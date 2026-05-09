# File Upload Standards

> Applies to: all file upload and binary attachment features in `apps/astra-apis/` and `apps/client-web/`.
> Last updated: 2026-04-13
>
> **Tactical upload-pipeline patterns for Claude live in `.claude/skills/file-uploads-attachments/`.** When a rule below changes, mirror the change in that SKILL.md so Claude's auto-loaded context stays in sync.

---

## 1. Overview

IDS Cloud DMS stores binary files (photos, scanned documents, PDFs) as **RavenDB attachments** on their parent documents. This standard defines the layered architecture for handling attachments across features.

**Key principle**: The shared `AttachmentService` handles binary I/O only. All validation, business rules, and metadata management live in the domain layer.

This document defines the current enforced standard. Planned enhancements and optional future directions are listed separately in Section 11.

---

## 2. Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  Controller Layer — HTTP boundary and request adaptation        │
│  Owns: multipart parsing, route params, manual DTO              │
│        parsing/validation, auth context handoff, response       │
│        shaping                                                  │
│  Example: PartController parses payload, filters repeated       │
│           photos fields, and sets response headers              │
│  Example: Future WO Controller adapts PDF/image form-data       │
├─────────────────────────────────────────────────────────────────┤
│  Domain Service Layer — business logic                           │
│  Owns: file type whitelist, max size, max count, metadata rules  │
│  Defines: ImageVariant[] constants (dimensions, quality)         │
│  Example: PartService manages Part.photos[], isDefault           │
│  Example: UserService manages User.hasProfilePhoto               │
├─────────────────────────────────────────────────────────────────┤
│  ImageProcessingService — shared, images only                    │
│  Owns: Sharp resize, WebP encode, multi-variant production       │
│  Location: common/services/image-processing.service.ts           │
│  No validation. Caller defines variants. Not used for PDFs.      │
├─────────────────────────────────────────────────────────────────┤
│  AttachmentService — shared, pure I/O                            │
│  Owns: RavenDB attachment store/get/delete and stream reads      │
│  Location: common/services/attachment.service.ts                 │
│  No validation. No business rules. No entity knowledge.          │
└─────────────────────────────────────────────────────────────────┘
```

### Why this split

Each feature has different attachment rules:

| Feature | Allowed types | Max size | Max count | Extra rules |
|---|---|---|---|---|
| User profile photo | JPEG, PNG, WebP, GIF, HEIC, HEIF | 20 MB | 1 | Replaces existing photo |
| Part pictures | JPEG, PNG, WebP, GIF, HEIC, HEIF | 10 MB | 10 | One default, tags, rotation |
| Work order docs (future) | PDF, JPEG, PNG, TIFF | 50 MB | Unlimited | Linked to WO line items |
| Invoice scans (future) | PDF, JPEG, PNG | 25 MB | Per invoice | OCR metadata |

Putting validation in the shared service would create a growing config object that every caller has to construct. Instead, each controller adapts the HTTP request into typed service input, performs transport-level DTO validation where needed, and delegates to a domain service that validates files with a feature-specific method before processing or storage.

---

## 3. AttachmentService API

Located at: `apps/astra-apis/src/common/services/attachment.service.ts`

```typescript
@Injectable()
export class AttachmentService {
  /**
   * Store an attachment within an existing session.
   * The caller owns the session and decides when to call saveChanges().
   * This allows atomic operations: document update + attachment in one transaction.
   */
  public store(session: IDocumentSession, docId: string, name: string, buffer: Buffer, contentType: string): void;

  /**
   * Get attachment as Buffer + contentType.
   * Opens its own read-only session internally.
   * Returns null if the attachment does not exist.
   */
  public async get(docId: string, name: string): Promise<{ data: Buffer; contentType: string } | null>;

  /**
   * Get attachment as a Node.js readable stream for HTTP delivery.
   * Returns a cleanup handle so the controller can dispose Raven resources
   * when the response completes or closes early.
   */
  public async getStream(
    docId: string,
    name: string,
  ): Promise<{ stream: Readable; contentType: string; dispose: () => void } | null>;

  /**
   * Delete an attachment within an existing session if it exists.
   * Returns true if deleted, false if the attachment was not found.
   */
  public async delete(session: IDocumentSession, docId: string, name: string): Promise<boolean>;
}
```

### Design decisions

- **`store` and `delete` accept a session**: The caller controls the transaction boundary. This allows storing an attachment and updating entity metadata in a single `saveChanges()` call — atomic.
- **`get` opens its own session**: Read operations don't modify state, so there's no need for the caller to manage a session.
- **`getStream` returns a cleanup handle**: Controllers can stream HTTP responses without buffering the entire attachment in memory first, while still disposing Raven resources correctly.
- **No validation**: The service trusts that the caller already validated the file. If bad data reaches this layer, it's a bug in the domain layer.

---

## 4. Domain Service — Validation Pattern

Each domain service that handles file uploads defines its own validation constants and a private validation method:

```typescript
// Domain-specific — NOT in the shared service
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
  'image/heic', 'image/heif', // iPhone/Apple device formats — decoded by sharp/libvips, stored as WebP
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class PartPhotoService {
  private validateFile(file: Express.Multer.File): void {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `File type ${file.mimetype} not allowed. Allowed: ${[...ALLOWED_TYPES].join(', ')}.`,
      );
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(`File too large. Maximum size: ${MAX_BYTES / 1024 / 1024} MB.`);
    }
  }
}
```

**Rules:**
- Validate files in the **domain service** before calling image processing or attachment storage.
- Controllers should parse the request, perform transport-level DTO validation, and enforce multipart guardrails such as allowed file fields, field count, and per-file size limits.
- Controllers should not duplicate feature-specific MIME/business validation; those rules stay in the domain service.
- Use `BadRequestException` with a descriptive message that includes what was wrong and what's allowed.
- Each feature independently decides its type whitelist, size limit, and count limit.

---

## 5. Domain Service — Metadata Pattern

The domain service manages how attachment metadata is stored on the parent entity:

```typescript
@Injectable()
export class PartPhotoService {
  constructor(
    private readonly _sessionFactory: RavenSessionFactory,
    private readonly _attachmentService: AttachmentService,
  ) {}

  public async upload(partNumber: string, file: Express.Multer.File, meta: PhotoMeta, userId: string) {
    using session = this._sessionFactory.openSession();
    const part = await session.load<Part>(`parts/${partNumber}`);

    // Domain rule: max 10 photos
    if (part.photos.length >= 10) throw new BadRequestException('Maximum 10 photos per part.');

    const photoId = `photo-${Date.now()}`;

    // Delegate binary I/O to shared service
    this._attachmentService.store(session, part.id, photoId, file.buffer, file.mimetype);

    // Domain logic: update entity metadata
    part.photos.push({ photoId, originalFilename: file.originalname, /* ... */ });
    touchIdsBaseEntity(part, userId);

    // Atomic: attachment + entity update in one transaction
    await session.saveChanges();
  }
}
```

**Rules:**
- Always update the parent entity's metadata in the **same session** as the attachment store/delete.
- Call `saveChanges()` once — this guarantees atomicity between the binary and the metadata.
- Domain rules (max count, default flags, auto-promotion) belong here, not in the shared service.

---

## 6. RavenDB Attachment Properties

Key facts about RavenDB attachments that inform this architecture:

| Property | Implication |
|---|---|
| Attachments don't load with `session.load()` | No performance penalty on normal entity reads |
| Attachments are stored separately from document JSON | Document stays in KB range regardless of attachment count/size |
| Same `saveChanges()` = atomic | Store document + attachment together safely |
| Hash-based deduplication | Same file attached to multiple documents = one physical copy on disk |
| No size limit | Practical for most files; prefer cloud storage for files > 100 MB |
| Streaming-capable API | RavenDB exposes a stream-oriented read API, and the shared `AttachmentService.getStream()` now exposes it for HTTP delivery without buffering the entire attachment in memory first |

Reference: `docs/standards/ravendb-document-design.md` — Section 4.

---

## 7. Image Processing Pipeline (Server-Side)

For image attachments (photos, not PDFs/documents), process uploads through `ImageProcessingService` before storage.

Located at: `apps/astra-apis/src/common/services/image-processing.service.ts`

### Variant-Based Design

The `ImageProcessingService` accepts a list of **variants** — the caller (domain service) decides what sizes it needs. The shared service just processes them. This keeps the shared service generic while letting each domain define its own requirements.

```typescript
// Domain service defines what it needs:
const PART_PHOTO_VARIANTS: ImageVariant[] = [
  { name: 'photo', maxDimension: 1200, quality: 82 },
];

// Shared service processes them:
const result = await imageProcessing.processUpload(file.buffer, PART_PHOTO_VARIANTS);
// result.variants = [{ name: 'photo', buffer, width, height, sizeBytes }]
```

### Pipeline

```
Upload buffer (raw browser file)
  ↓
ImageProcessingService.processUpload(buffer, variants):
  ├─ For each variant: sharp(buffer).resize(maxDimension, { fit: 'inside', withoutEnlargement: true })
  │                                  .webp({ quality }) → WebP buffer + dimensions
  └─ All variants processed in parallel via Promise.all()
  ↓
Returns: { variants[] }
```

### Storage per image

Attachment naming is feature-defined. In the current Parts flow, the processed image is stored as `photo-{photoId}`:

| Attachment name | Content | Format | Typical size | Purpose |
|---|---|---|---|---|
| `photo-{id}` | Display version | WebP, 1200px max | 80–150 KB | Shared current asset for both preview and thumbnail surfaces |

**Adding an extra variant later** is still straightforward: extend the domain service's `VARIANTS` array and add retrieval logic only if the product surface truly benefits from a dedicated smaller asset.
### When to use image processing

| Upload type | Use ImageProcessingService? | Reason |
|---|---|---|
| Product photos (Part) | Yes | WebP saves 50–70% vs JPEG |
| Scanned documents (PDF) | No | Not an image — store as-is |
| Generated PDFs | No | Already optimized — store as-is |

### Performance characteristics

- Sharp uses `libvips` — memory-efficient, non-blocking via libuv
- ~50–100ms per image at typical upload sizes
- 10 images processed with `Promise.all()` ≈ 0.5–1s total

### HEIC / HEIF input support

HEIC and HEIF uploads are accepted at the MIME whitelist level and decoded by `sharp` via `libvips`. The production Alpine image bundles `libvips` with HEIF read support (`heif: 1.20.2`), so no additional native dependencies are needed.

All HEIC/HEIF inputs are normalised to WebP on ingest — the stored attachment format is always WebP regardless of what was uploaded. This keeps downstream storage and browser display uniform.

`ImageProcessingService.processUpload()` wraps the `sharp` decode step in a try/catch. If the file is corrupt or the HEIF codec is unavailable at runtime, it throws a `BadRequestException` (HTTP 400) rather than an unhandled 500 error.

### Why WebP (not HEIF) for storage

HEIF offers ~5–15% better compression than WebP, but:
- Chrome and Firefox do not render `image/heif` / `image/heic` natively — stored HEIF would require server-side transcoding on every photo fetch for non-Safari clients
- `libvips` HEIF write support is a separate compile flag from HEIF read support and is not guaranteed across environments
- HEVC (the codec HEIF uses) carries patent encumbrances

WebP at the current quality settings (82 for parts, 85 for profile) is already 25–34% smaller than JPEG, which is the meaningful saving. The marginal HEIF gain (~50–100 KB at these sizes) does not justify the complexity.

### Why WebP (not AVIF)

- WebP: 97% browser support, fast encoding (~50ms), 25-34% smaller than JPEG
- AVIF: 95% browser support, slow encoding (5-10x slower than WebP), 50% smaller than JPEG
- For an internal DMS application, WebP's encoding speed and broad support is the right trade-off
- If AVIF is needed later, the pipeline is already in place — just add another output

---

## 8. Frontend — Upload Pattern (Client-Side)

### Dual-mode pattern (create vs edit)

When a feature has both create and edit forms:

| Mode | Behavior |
|---|---|
| **Create** (entity doesn't exist yet) | Hold files in local state for preview. Submit them on Save in one multipart request — atomically with entity creation. |
| **Edit** (entity already exists) | Hold newly added files in local state for preview. Submit them on Save in one multipart request alongside the PATCH payload and photo metadata changes. |

This keeps the aggregate update atomic in both modes while still allowing immediate local previews.

### Direct multipart submission

After client-side validation passes, build a real `FormData` payload and submit the multipart request directly. Route `clientAction` should forward that same `FormData` after patching any route-owned fields instead of reparsing files and rebuilding multipart from scratch. Do not rely on module-level file staging to move `File` objects across route boundaries.

### File input validation

Always validate on both client and server:

```typescript
// Client: accept attribute on file input
<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif" />

// Server: domain service validates before processing (see Section 4)
```

---

## 9. Attachment Naming Convention

Attachment names on a RavenDB document should be:

| Pattern | Example | Use when |
|---|---|---|
| Fixed name | `profile-photo` | Single attachment per entity (user photo) |
| Photo attachment | `photo-1712678400000-0` | Current Parts display image (WebP). Pattern: `photo-{photoId}` |
| Batch suffix | `photo-1712678400000-0` | Batch uploads — index suffix prevents timestamp collisions |

**Never** use the original filename as the attachment name — it may contain special characters, duplicates, or path traversal attempts. Store the original filename as metadata on the entity.

---

## 10. Checklist for New Attachment Features

When adding a new feature that handles file uploads:

- [ ] Define allowed MIME types and max file size as constants in the **domain service**
- [ ] Define max attachment count per entity (if bounded) in the **domain service**
- [ ] Add metadata fields to the parent entity (embedded type — see `ravendb-document-design.md` Section 8)
- [ ] Use `AttachmentService.store()` with the caller's session for transactional consistency
- [ ] Use `AttachmentService.get()` for buffered attachment retrieval on small/medium files; add a dedicated streaming path for large file endpoints
- [ ] **If images**: pipe through `ImageProcessingService`; define `ImageVariant[]` constants in the domain service
- [ ] **If images**: store the current display asset (for Parts, `photo-{id}`); include `width`, `height`, `sizeBytes` in entity metadata
- [ ] Set cache headers on authenticated GET endpoints to `Cache-Control: private, max-age=86400` unless the endpoint is intentionally public
- [ ] Client-side: use `useImageBlob` hook for authenticated image display
- [ ] Client-side: use dual-mode pattern if both create and edit forms exist
- [ ] Client-side: submit multipart `FormData` directly after validation; avoid module-level file staging
- [ ] Client-side: use `accept` attribute on file inputs to restrict selectable types
- [ ] Add the feature's validation rules to the table in Section 2 of this document

---

## 11. Future Plans

These features are recommended future improvements for the upload pipeline. Some are already designed in detail and ready to implement; others are architectural follow-ups intended to support future large-file and document scenarios. The pipeline is already extensible — adding most of these requires changes only in the domain service, not in `ImageProcessingService` or `AttachmentService`.

### Original image archival

Store the raw uploaded file alongside the WebP display variant:

- Attachment name: `original-{photoId}`
- Content: file as-uploaded (JPEG/PNG/etc.), untouched
- Purpose: archival, re-processing at higher quality, user download/export
- Implementation: one extra `attachmentService.store()` call in `processAndStorePhotos`, passing `file.buffer` and `file.mimetype`

### Thumbnail variant

Store a small fixed-size variant for list views and grid displays:

- Attachment name: `thumb-{photoId}`
- Format: WebP, 150px max dimension, quality 75
- Implementation: add `{ name: 'thumb', maxDimension: 150, quality: 75 }` to `PART_PHOTO_VARIANTS` + a new GET endpoint

### BlurHash / LQIP placeholder

Generate a compact color-encoded placeholder string server-side so the client can show a blurry preview instantly — before the real image loads:

- Generated by: `sharp(buffer).resize(20).raw()` → `blurhash.encode()` → ~28 char string
- Stored as: `blurHash` field on the `PartPhoto` entity (not an attachment — just a string)
- Displayed via: `react-blurhash` component; real image fades in with CSS `opacity` transition
- Requires: adding `blurHash` field to `PartPhoto`, `PartPhotoResponseDto`, and the `ImageProcessingService` return type

### Client-side image compression

Client-side image compression is **not part of the current canonical pipeline**.

- The backend already resizes and re-encodes image uploads through `ImageProcessingService` before storage.
- A blanket browser-side resize/re-encode would therefore introduce a second lossy pass before the server's own WebP conversion.
- The previously proposed `1024px` / JPEG `0.85` rule should **not** be adopted as-is: it would downscale below the current 1200px server target used for part photos and permanently discard detail while original-image archival is still not implemented.
- If we revisit this later, treat it only as an **optional pre-upload bandwidth optimization** for oversized image files on slow connections, not as a replacement for server-side processing.
- Utility location (when implemented): `apps/client-web/app/core/services/compressImage.ts`
- Only for image uploads — never compress PDFs or other document types

