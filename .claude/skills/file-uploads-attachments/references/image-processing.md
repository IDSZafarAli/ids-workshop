---
title: Image Processing
description: Variant-based image pipeline — Sharp resize + WebP encode, animated GIF handling, HEIC input, and per-feature variant config
tags: [sharp, webp, ImageVariant, processUpload, animated, HEIC]
---

# Image Processing

`ImageProcessingService.processUpload(buffer, variants, mimeType?)` produces an array of WebP buffers, one per variant. The caller decides what variants it needs — the service has no notion of features.

## Variant Definitions

```typescript
export type ImageVariant = {
  name: string;            // 'original', 'thumbnail', 'card'
  maxDimension: number;    // longest edge in pixels
  quality: number;         // WebP quality 0–100
};

private static readonly _PHOTO_VARIANTS: ImageVariant[] = [
  {name: 'original', maxDimension: 2048, quality: 85},
  {name: 'thumbnail', maxDimension: 256, quality: 75},
];
```

`maxDimension` is the **longest edge** — Sharp uses `fit: 'inside'` to preserve aspect ratio, and `withoutEnlargement: true` to leave smaller images alone. A 1000×800 source resized to `maxDimension: 256` becomes 256×205 (not stretched).

## The Pipeline

```typescript
const result = await sharp(buffer, isAnimated ? {animated: true} : {})
  .resize({
    width: v.maxDimension,
    height: v.maxDimension,
    fit: 'inside',
    withoutEnlargement: true,
  })
  .webp({quality: v.quality})
  .toBuffer({resolveWithObject: true});
```

Each variant becomes a `ProcessedVariant`:

```typescript
{
  name: 'thumbnail',
  buffer: <Buffer ...>,
  width: 256,
  height: 192,
  sizeBytes: 18234,
}
```

## Animated GIF Handling

```typescript
const isAnimated: boolean = mimeType === 'image/gif';
sharp(buffer, isAnimated ? {animated: true} : {});
```

Without `{animated: true}`, Sharp decodes the **first frame** of a multi-frame GIF and discards the rest. With it, all frames are preserved through the resize and emitted as an animated WebP. Always pass `mimeType` so the service can make this decision.

## HEIC / HEIF Input

iPhone uploads default to HEIC. Sharp decodes HEIC/HEIF natively (when libheif is available in the build) and re-encodes to WebP — clients receive a universally-compatible format. Validate the input MIME at the domain layer; the processing layer just decodes.

## WebP Output — Why

| Format | Decoder ubiquity | Compression ratio | Animation | Verdict                                    |
| ------ | ---------------- | ----------------- | --------- | ------------------------------------------ |
| JPEG   | Universal        | Baseline          | No        | Lossy-only; bigger; no animation           |
| PNG    | Universal        | Lossless          | No        | Bigger for photos; no animation            |
| WebP   | Universal (2023+) | ~30% smaller     | Yes       | **Chosen** — small, lossy + lossless, anim |
| AVIF   | Most browsers (2024+) | ~50% smaller | Yes       | Encode is too slow for the upload path      |
| HEIF   | Apple-only       | Excellent         | Limited   | Browser support gaps                        |

WebP is the sweet spot. AVIF is a candidate for a future async re-encode pipeline; for synchronous upload it's too slow.

## Quality Tuning

| Variant     | Typical quality | Output size (1024×768 photo) |
| ----------- | --------------- | ---------------------------- |
| Thumbnail   | 70–75           | 10–25 KB                     |
| Card        | 75–80           | 30–60 KB                     |
| Original    | 80–88           | 100–250 KB                   |
| Print       | 90–95           | 300–800 KB                   |

Past 85, file size grows quickly while perceptual difference is minor. 70 is the floor before banding becomes visible. Tune per-variant to fit the screen role.

## Per-Variant Storage

```typescript
const photoId = randomUUID();
for (const variant of result.variants) {
  this._attachmentService.store(
    session,
    part.id,
    `photo-${photoId}-${variant.name}`,    // photo-<uuid>-original, photo-<uuid>-thumbnail
    variant.buffer,
    'image/webp',
  );
}
```

Each variant becomes its own RavenDB attachment — independent retrieval. The serving endpoint picks the variant based on the URL or query param.

## Performance

- Sharp processing is CPU-bound — 50–200 ms per variant per image on modest hardware.
- Multiple variants run in `Promise.all` inside the service, parallelized across the libuv thread pool.
- Larger source images (HEIC from a 12 MP iPhone) take 300–500 ms per variant; budget the request timeout accordingly.

## Failures

```typescript
try {
  const result = await sharp(buffer, ...).resize(...).webp(...).toBuffer({resolveWithObject: true});
  return {name: v.name, buffer: result.data, ...};
} catch (err) {
  this._logger.error('image_processing_failed', {variant: v.name, error: err});
  throw new BadRequestException(`Failed to process image (variant: ${v.name})`);
}
```

A corrupted upload throws inside Sharp. Don't let the raw error surface — wrap in `BadRequestException` with a friendly message.

## Variant Naming Conventions

| Name        | Use                                                    |
| ----------- | ------------------------------------------------------ |
| `original`  | Largest variant we keep (project: 2048 px, q 85)       |
| `card`      | Mid-sized for list/grid views (e.g., 600 px, q 80)     |
| `thumbnail` | Smallest, for list rows (256 px, q 75)                 |
| `print`     | High-quality for print-rendering (e.g., 1600 px, q 92) |

Use these names consistently across features so retrieval URLs are predictable (`/api/parts/123/photos/abc/thumbnail`).

## Anti-Patterns

```typescript
// ❌ Storing the original raw upload alongside variants
this._attachmentService.store(session, part.id, `photo-${id}-source`, file.buffer, file.mimetype);
//   Doubles storage; client can never use the source variant; project chose lossy-only retention

// ❌ Skipping the resize for "originals"
sharp(buffer).webp({quality: 95}).toBuffer();
//   No resize means the source-size HEIC stays at native resolution; transcoding alone is the point

// ❌ Per-feature copy of the Sharp pipeline
sharp(buffer).resize(...).jpeg({quality: 85}).toBuffer();
//   The shared service exists; reach for it
```

## Documentation Pointers

- Variant config rationale: `docs/standards/file-upload-standards.md` Section 7.
- Sharp options: https://sharp.pixelplumbing.com/api-resize
- WebP encoder options: https://sharp.pixelplumbing.com/api-output#webp
