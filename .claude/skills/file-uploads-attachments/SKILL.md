---
name: file-uploads-attachments
description: Layered file-upload architecture for IDS Cloud DMS — controller adapts multipart, domain service validates, ImageProcessingService produces WebP variants, AttachmentService stores RavenDB attachments. Use when adding photo, document, or any binary upload feature on the backend or wiring the multipart submission on the frontend.
license: MIT
---

# File Uploads & Attachments

Binary files (photos, scanned documents, PDFs) are stored as **RavenDB attachments** on their parent documents. The upload pipeline has four distinct layers — each has narrow responsibilities, and skipping a layer breaks the contract.

## Project-Specific Context

- Shared services: `apps/astra-apis/src/common/services/attachment.service.ts` (pure I/O), `image-processing.service.ts` (Sharp → WebP).
- Validation rules (allowed types, max size, max count) live **per-feature** in the domain service — not in the shared service.
- Photos are processed into multiple WebP variants (e.g., `original`, `thumbnail`) with feature-specific dimensions/quality.
- Multipart payload is parsed at the controller (`FileFieldsInterceptor`); class-validator must run **manually** on the JSON `payload` field because multipart bypasses Nest's automatic pipeline.
- Frontend sends `multipart/form-data` via `apiClient.upload()` — never raw `fetch`.

## When to Apply

- Adding a new file-upload endpoint (photos, attachments, documents).
- Modifying validation rules — allowed MIME types, max bytes, max count.
- Adding or revising image variants (size, quality, naming).
- Wiring the React side of an upload (file picker → FormData → mutation).
- Reviewing an upload feature for layer-leakage (validation in shared service, mapping in controller, etc.).

## References

| Reference                              | Use When                                                              |
| -------------------------------------- | --------------------------------------------------------------------- |
| `references/architecture.md`           | Understanding the four-layer split and what belongs where             |
| `references/domain-validation.md`      | Defining feature-specific allowed types, sizes, counts, and metadata  |
| `references/image-processing.md`       | Designing WebP variants, sharp pipeline, GIF/HEIC handling            |
| `references/frontend-upload.md`        | Building the React upload UI — file picker, FormData, dual-mode flows |
| `references/attachment-naming.md`      | RavenDB attachment-name conventions and retrieval                     |

## Critical Patterns

### Four-Layer Pipeline

```
Controller        — multipart parse, manual class-validator on payload, auth
   ↓
Domain Service    — feature validation (types, size, count), metadata rules,
                    variant definitions, atomic save
   ↓
ImageProcessing   — Sharp resize + WebP encode (images only)
   ↓
AttachmentService — RavenDB attachments.store / get / delete (pure I/O)
```

The domain service is the **only** layer that knows the feature's rules. The shared services are agnostic.

### Controller — Multipart + Manual Validation

```typescript
@Post()
@UseInterceptors(FileFieldsInterceptor([{name: 'photos', maxCount: 10}], {
  limits: {files: 10, fileSize: 10 * 1024 * 1024, fields: 2},
}))
@ApiConsumes('multipart/form-data')
public async create(
  @UploadedFiles() files: {photos?: Express.Multer.File[]},
  @Body('payload') payloadJson: string,
  @Body('photosMeta') photosMetaJson: string | undefined,
  @Auth() auth: AuthInfo,
): Promise<PartCreateResponseDto> {
  const dto = plainToInstance(PartCreateDto, JSON.parse(payloadJson));
  const errs = await validate(dto);
  if (errs.length > 0) {
    throw new BadRequestException(formatValidationErrors(errs));
  }

  const meta = photosMetaJson ? JSON.parse(photosMetaJson) : undefined;
  return this._partService.create(dto, auth.sub, files.photos ?? [], meta);
}
```

### Domain Service — Validation + Atomic Save

```typescript
private static readonly _ALLOWED_PHOTO_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
]);
private static readonly _MAX_PHOTO_BYTES = 10 * 1024 * 1024;
private static readonly _MAX_PHOTOS = 10;

private static readonly _PHOTO_VARIANTS: ImageVariant[] = [
  {name: 'original', maxDimension: 2048, quality: 85},
  {name: 'thumbnail', maxDimension: 256, quality: 75},
];

public async create(
  dto: PartCreateDto,
  userId: string,
  files: Express.Multer.File[],
  meta?: PartPhotoUploadMetaDto[],
): Promise<PartCreateResponseDto> {
  using session = this._sessionFactory.openSession();

  // ... build & store the parent document (Part) ...

  if (files.length > 0) {
    if (files.length > PartService._MAX_PHOTOS) {
      throw new BadRequestException(`Maximum ${PartService._MAX_PHOTOS} photos.`);
    }
    for (const file of files) {
      this.validatePhotoFile(file);
      const result = await this._imageProcessing.processUpload(
        file.buffer, PartService._PHOTO_VARIANTS, file.mimetype,
      );
      const photoId = randomUUID();
      for (const variant of result.variants) {
        this._attachmentService.store(
          session, part.id, `photo-${photoId}-${variant.name}`,
          variant.buffer, 'image/webp',
        );
      }
      part.photos.push({photoId, ...metaForFile(meta, file.fieldname)});
    }
  }

  await session.saveChanges();    // atomic: document + attachments
  return toPartCreateResponseDto(part);
}

private validatePhotoFile(file: Express.Multer.File): void {
  if (!PartService._ALLOWED_PHOTO_TYPES.has(file.mimetype)) {
    throw new BadRequestException(`File type ${file.mimetype} not allowed.`);
  }
  if (file.size > PartService._MAX_PHOTO_BYTES) {
    throw new BadRequestException(
      `File too large. Maximum: ${PartService._MAX_PHOTO_BYTES / 1024 / 1024} MB.`,
    );
  }
}
```

### Atomic Document + Attachments

`session.advanced.attachments.store(...)` queues the attachment write inside the session's unit of work. One `saveChanges()` commits the document and all attachments together — no half-written state if the second write fails.

```typescript
this._attachmentService.store(session, docId, name, buffer, contentType);
// ... more stores ...
await session.saveChanges();   // single commit
```

## Further Documentation

- Project doc: `docs/standards/file-upload-standards.md` (definitive source — 392 lines, layer responsibilities and future plans)
- RavenDB attachments: https://ravendb.net/docs/article-page/6.2/nodejs/client-api/operations/attachments/attachments-overview
- Sharp: https://sharp.pixelplumbing.com/
