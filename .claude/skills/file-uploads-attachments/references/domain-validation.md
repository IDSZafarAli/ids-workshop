---
title: Domain Validation
description: Per-feature file validation — allowed types, max bytes, max count, metadata rules — colocated with the domain service
tags: [validation, MIME types, max-size, max-count, allow-list]
---

# Domain Validation

Validation rules live on the domain service as private static fields. The service exposes a private `validateXyzFile()` method called once per file inside the upload loop.

## Allow-List, Not Block-List

```typescript
// ✅ Allow-list — only these types pass
private static readonly _ALLOWED_PHOTO_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

// ❌ Block-list — adversarial input slips through
private static readonly _BLOCKED_TYPES = new Set(['application/x-msdownload']);
```

A new MIME type the validator hasn't seen before should fail closed. Block-lists fail open and are a classic upload-pipeline vulnerability.

## Three Limits Every Feature Sets

```typescript
private static readonly _ALLOWED_PHOTO_TYPES = new Set([...]);
private static readonly _MAX_PHOTO_BYTES = 10 * 1024 * 1024;
private static readonly _MAX_PHOTOS = 10;
```

| Limit                  | Default                        | Why                                                |
| ---------------------- | ------------------------------ | -------------------------------------------------- |
| Allowed types (Set)    | feature-specific MIME allow-list | Stops executable / scripted payloads               |
| Max bytes (per file)   | 10 MB photos, 50 MB docs       | Protects memory + RavenDB storage                  |
| Max count (per parent) | 10 photos, unlimited docs      | Bounds document size; UI bound for list rendering  |

Both the controller's `FileFieldsInterceptor` `limits` and the service's `_MAX_*` apply — controller fails fast on truly oversized uploads (transport-level), service applies the business rule (which may be lower).

## The Validator Method

```typescript
private validatePhotoFile(file: Express.Multer.File): void {
  if (!PartService._ALLOWED_PHOTO_TYPES.has(file.mimetype)) {
    throw new BadRequestException(
      `File type ${file.mimetype} not allowed. Allowed: ${
        [...PartService._ALLOWED_PHOTO_TYPES].join(', ')
      }.`,
    );
  }
  if (file.size > PartService._MAX_PHOTO_BYTES) {
    throw new BadRequestException(
      `File too large. Maximum size: ${PartService._MAX_PHOTO_BYTES / 1024 / 1024} MB.`,
    );
  }
}
```

Per-file validation runs **inside** the upload loop. Per-batch validation (max count) runs **before** the loop:

```typescript
const totalAfter = (existingPhotos?.length ?? 0) + files.length;
if (totalAfter > PartService._MAX_PHOTOS) {
  throw new BadRequestException(
    `Maximum ${PartService._MAX_PHOTOS} photos per part. ` +
    `Currently ${existingPhotos.length}, attempting to add ${files.length}.`,
  );
}

for (const file of files) {
  this.validatePhotoFile(file);
  // ... process and store ...
}
```

## Throwing the Right Exception

`BadRequestException` — the global filter shapes it into `urn:ids:error:validation`. Field-level errors follow the `<field> <message>` convention:

```typescript
throw new BadRequestException(
  `photos[${index}] file type ${file.mimetype} not allowed`,
);
// → { field: 'photos[0]', message: 'file type image/svg+xml not allowed' }
```

## Metadata Rules

Beyond file-level validation, features have metadata invariants — exactly one default photo, rotation in `{0, 90, 180, 270}`, tags within a closed set. Encode the simple ones in the DTO via class-validator:

```typescript
@ApiProperty({description: 'Rotation in degrees (0, 90, 180, 270)'})
@IsNumber()
@IsIn([0, 90, 180, 270])
rotation!: number;
```

The harder cross-record rules (only one `isDefault: true` per part) belong in a private validation method called before save:

```typescript
private validateOneDefault(photos: PartPhoto[]): void {
  const defaults = photos.filter((p) => p.isDefault);
  if (defaults.length > 1) {
    throw new BadRequestException(
      `Only one photo can be the default; found ${defaults.length}.`,
    );
  }
}
```

## Magic Bytes vs MIME Type

Multer reports `file.mimetype` from the upload's `Content-Type` header — **client-supplied** and trivially forgeable. For higher-trust contexts, sniff the file's magic bytes:

```typescript
import {fileTypeFromBuffer} from 'file-type';

const detected = await fileTypeFromBuffer(file.buffer);
if (!detected || !PartService._ALLOWED_PHOTO_TYPES.has(detected.mime)) {
  throw new BadRequestException(`File content is not a supported image format.`);
}
```

This project's photo upload accepts the client-reported MIME type as a second-class signal — Sharp itself would reject a non-image buffer at the processing step. For PDF/document uploads with stricter security needs, magic-byte sniffing is the right addition.

## Validation Anti-Patterns

```typescript
// ❌ Trusting the file extension
if (!file.originalname.endsWith('.jpg') && !file.originalname.endsWith('.png')) { ... }
//   `evil.exe.jpg` passes; `image.JPEG` fails. Use MIME type.

// ❌ Validating in the controller
if (file.size > 10 * 1024 * 1024) {                       // wrong layer
  throw new BadRequestException('Too large');
}

// ❌ Validating in AttachmentService
public store(session, docId, name, buffer, contentType): void {
  if (buffer.length > MAX_SIZE) throw ...;                // wrong layer
}

// ❌ Block-list
const BLOCKED = new Set(['application/x-msdownload']);    // fails open

// ❌ Validating after storing
this._attachmentService.store(...);
this.validatePhotoFile(file);                             // backwards
```

## Where Each Limit Belongs

| Limit                                      | Layer                                          |
| ------------------------------------------ | ---------------------------------------------- |
| Transport ceiling (`fileSize`, `files`)    | Controller — `FileFieldsInterceptor.limits`    |
| Allowed types                              | Domain service `_ALLOWED_*_TYPES`              |
| Per-file max bytes (business rule)         | Domain service `_MAX_*_BYTES`                  |
| Per-parent max count                       | Domain service `_MAX_*` + pre-loop check       |
| Field-shape rules (rotation enum, etc.)    | DTO via class-validator                        |
| Cross-record invariants (one default)      | Private service method, pre-save               |
