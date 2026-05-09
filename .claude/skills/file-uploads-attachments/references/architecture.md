---
title: Architecture Layers
description: The four-layer file-upload split — what each layer owns, why it exists, and what would happen if you collapsed any of them
tags: [architecture, layers, AttachmentService, ImageProcessingService, separation]
---

# Architecture Layers

```
┌────────────────────────────────────────────────────────────────────┐
│  Controller — HTTP boundary                                        │
│  • Multipart parse via FileFieldsInterceptor                        │
│  • Manual class-validator on the JSON `payload` field               │
│  • Auth context, response shaping                                   │
│  • Knows: HTTP shape, request DTO. Not: validation rules.           │
├────────────────────────────────────────────────────────────────────┤
│  Domain Service — Business logic                                    │
│  • Allowed MIME types, max bytes, max count                         │
│  • Metadata rules (default-photo single, rotation, tags)            │
│  • Variant definitions (dimensions, quality)                        │
│  • Atomic save: parent document + attachments in one saveChanges()  │
│  • Knows: feature rules, variant config. Owns: the workflow.        │
├────────────────────────────────────────────────────────────────────┤
│  ImageProcessingService — Sharp pipeline                            │
│  • Input buffer + variant array → array of WebP buffers             │
│  • GIF flag for animated decode                                     │
│  • Knows: how to resize and encode. Not: what's allowed or named.   │
├────────────────────────────────────────────────────────────────────┤
│  AttachmentService — RavenDB I/O                                    │
│  • store / get / getStream / delete on a session                    │
│  • Knows: the RavenDB attachment API. Not: anything domain-related. │
└────────────────────────────────────────────────────────────────────┘
```

## Why The Split

Each feature has different rules:

| Feature                  | Allowed types                                  | Max size | Max count | Extra rules                |
| ------------------------ | ---------------------------------------------- | -------- | --------- | -------------------------- |
| User profile photo       | JPEG, PNG, WebP, GIF, HEIC, HEIF               | 20 MB    | 1         | Replaces existing          |
| Part pictures            | JPEG, PNG, WebP, GIF, HEIC, HEIF               | 10 MB    | 10        | One default, tags, rotation |
| Work-order documents     | PDF, JPEG, PNG, TIFF                           | 50 MB    | unlimited | Linked to WO line items    |
| Invoice scans            | PDF, JPEG, PNG                                 | 25 MB    | per inv.  | OCR metadata               |

If validation lived in `AttachmentService`, every caller would need to construct a config object and the shared service would grow a switch on feature kind. The split keeps `AttachmentService` and `ImageProcessingService` small and stable, and locates feature rules where the rest of the feature's logic lives.

## What Belongs Where

### Controller

```typescript
@Post()
@UseInterceptors(FileFieldsInterceptor([{name: 'photos', maxCount: 10}], {
  limits: {files: 10, fileSize: 10 * 1024 * 1024, fields: 2},
}))
public async create(
  @UploadedFiles() files: {photos?: Express.Multer.File[]},
  @Body('payload') payloadJson: string,
  @Auth() auth: AuthInfo,
): Promise<PartCreateResponseDto> {
  const dto = plainToInstance(PartCreateDto, JSON.parse(payloadJson));
  const errs = await validate(dto);
  if (errs.length > 0) throw new BadRequestException(formatValidationErrors(errs));
  return this._service.create(dto, auth.sub, files.photos ?? []);
}
```

The `limits` block on the interceptor is a **transport** ceiling — first-line defense against abusive uploads. The domain service applies the **business** rules below that ceiling. Both must be set; one without the other is a hole.

**Forbidden in the controller:**

- File type checks (`if (file.mimetype !== ...)`).
- File size checks beyond the transport limit.
- Image processing (Sharp, resize, encode).
- Direct `attachments.store` calls.

### Domain Service

```typescript
private static readonly _ALLOWED_TYPES = new Set([...]);
private static readonly _MAX_BYTES = 10 * 1024 * 1024;
private static readonly _MAX_COUNT = 10;

private static readonly _VARIANTS: ImageVariant[] = [
  {name: 'original', maxDimension: 2048, quality: 85},
  {name: 'thumbnail', maxDimension: 256, quality: 75},
];
```

These are private static class members, prefixed `_` per the naming standard. They live with the service because the service is the only layer that gets to know them.

**Forbidden in the domain service:**

- Multipart parsing (controller's job).
- Direct `sharp(...)` calls (use `ImageProcessingService`).
- Hand-rolled RavenDB attachment API calls (use `AttachmentService`).

### ImageProcessingService

```typescript
public async processUpload(
  buffer: Buffer,
  variants: ImageVariant[],
  mimeType?: string,
): Promise<ProcessResult>
```

Pure transform. No validation, no storage, no entity knowledge. The caller passes in the variants — the service produces the WebP buffers.

### AttachmentService

```typescript
public store(session, docId, name, buffer, contentType): void
public async get(docId, name): Promise<AttachmentReadResult | null>
public async getStream(docId, name): Promise<AttachmentStreamResult | null>
public async delete(session, docId, name): Promise<void>
```

The session is **owned by the caller**. `store` enqueues; `saveChanges()` on the caller's session commits the parent document and attachments together. Read methods open and dispose their own session.

**Forbidden in `AttachmentService`:**

- Validation (allowed types, size limits).
- Image processing.
- Entity-shape knowledge ("if it's a Part photo, do X").

## What If You Collapse a Layer?

| Collapse                                          | Symptom                                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Validation in controller                          | Two endpoints with the same feature drift apart; rules duplicated across paths                           |
| Image processing in domain service                | Five copies of the Sharp pipeline; bug fixes hit only one                                                |
| Attachment store in domain service                | Direct RavenDB API calls leak — when the session model changes, every feature breaks                     |
| Validation in `AttachmentService`                 | Shared service grows a config object per caller, then a switch on caller kind, then per-feature branches |

The four-layer shape is the local minimum — collapsing any single layer is technically possible, but the code drifts within a quarter.

## Adding a New Upload Feature

1. **Define the rules** as private static fields on the domain service: types, max bytes, max count, variants.
2. **Add a validator method** on the service: `private validateXyzFile(file): void`.
3. **Add the multipart route** on the controller with `FileFieldsInterceptor` + transport limits.
4. **In the service method**, loop files: validate → process (if image) → store via `AttachmentService` → push metadata onto parent document.
5. **One `saveChanges()`** at the end — atomic.
6. **Read endpoint** uses `AttachmentService.getStream` + `StreamableFile` (see `attachment-naming.md`).

The checklist is also in `docs/standards/file-upload-standards.md` Section 10.
