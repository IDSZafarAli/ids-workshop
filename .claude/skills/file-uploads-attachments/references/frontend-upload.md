---
title: Frontend Upload
description: React side of the upload — file picker, FormData composition, dual-mode (create vs edit), and TanStack Query mutations
tags: [multipart, FormData, apiClient, upload, dual-mode, file-input]
---

# Frontend Upload

The frontend sends `multipart/form-data` via `apiClient.upload(...)`. Files go in named file fields; structured metadata goes in JSON-string text fields. No raw `fetch()`.

## FormData Composition

```typescript
const fd = new FormData();
fd.append('payload', JSON.stringify(dto));
fd.append('photosMeta', JSON.stringify(meta));
for (const file of files) {
  fd.append('photos', file, file.name);
}

await apiClient.upload(`/api/parts/${partNumber}`, fd);
```

Field names match the controller's `FileFieldsInterceptor` config (`name: 'photos'`). Metadata goes through a JSON string field — multipart cannot represent nested objects natively.

## Dual-Mode: Create vs Edit

The same form handles **create** (no document yet, all photos are new) and **edit** (existing document, mix of new uploads + existing photo IDs to keep + IDs to remove).

```typescript
type PhotoFormState = {
  // Photos already on the server (from initial fetch)
  existing: Array<{photoId: string; isDefault: boolean; ...}>;
  // Photo IDs the user removed in this session
  removedIds: string[];
  // New File objects the user picked
  newFiles: File[];
  // Metadata for the new files (parallel to newFiles[])
  newMeta: Array<{isDefault: boolean; rotation: number; ...}>;
};
```

On submit:

```typescript
function buildFormData(state: PhotoFormState, dto: PartDto): FormData {
  const fd = new FormData();

  // Trimmed dto: existing photos minus removed
  const photosToKeep = state.existing
    .filter((p) => !state.removedIds.includes(p.photoId))
    .map(({photoId, isDefault, rotation, description, tags}) => ({
      photoId, isDefault, rotation, description, tags,
    }));

  fd.append('payload', JSON.stringify({...dto, photos: photosToKeep}));
  fd.append('photosMeta', JSON.stringify(state.newMeta));

  for (const file of state.newFiles) {
    fd.append('photos', file, file.name);
  }
  return fd;
}
```

The backend treats:

- `payload.photos[]` as the **desired final state** of existing photos (server reconciles by `photoId`).
- `photos[]` files as new uploads to add.
- `photosMeta[]` as metadata for the new uploads (parallel-indexed).

## File Input UI

```tsx
const fileInputRef = useRef<HTMLInputElement>(null);

<Button onClick={() => fileInputRef.current?.click()}>Add photos</Button>
<input
  ref={fileInputRef}
  type="file"
  accept="image/*"
  multiple
  hidden
  onChange={(e) => {
    const picked = Array.from(e.target.files ?? []);
    onFilesPicked(picked);
    e.target.value = '';   // reset so the same file can be re-picked
  }}
/>
```

Resetting `e.target.value = ''` after handling lets the user re-pick the same file (the input doesn't fire `change` for an identical re-selection otherwise).

## Client-Side Validation

Mirror the server's allow-list and size limits to fail fast in the UI:

```typescript
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);
const MAX_BYTES = 10 * 1024 * 1024;

function validateFile(file: File): string | null {
  if (!ALLOWED.has(file.type)) return t('photoUpload.unsupportedType', {type: file.type});
  if (file.size > MAX_BYTES) return t('photoUpload.tooLarge', {max: '10 MB'});
  return null;
}
```

Mirror, **don't replace** — the server still enforces. Client validation is for UX, not security.

## Mutation Wrapping

```typescript
const mutation = useMutation({
  mutationFn: async (input: SubmitInput) => {
    const fd = buildFormData(input.state, input.dto);
    return apiClient.upload<PartUpdateResponseDto>(`/api/parts/${partNumber}`, fd);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({queryKey: PART_QUERY_KEYS.detail(partNumber)});
    showSnackbar(t('part.savedWithPhotos'));
  },
  onError: (err) => {
    if (err instanceof ProblemDetailError && err.problem.type === PROBLEM_URN_TYPE.VALIDATION) {
      surfaceFieldErrors(err.problem.errors ?? []);
      return;
    }
    showSnackbar(err instanceof Error ? err.message : t('common.uploadFailed'));
  },
});
```

The `apiClient.upload()` helper is multipart-aware — it sets the right `Content-Type` (don't set it manually; the boundary marker matters) and passes through the `FormData`.

## Photo Display & Variants

For `<img>` rendering, request the variant the role needs:

```tsx
<img
  src={`/api/parts/${partNumber}/photos/${photoId}?variant=thumbnail`}
  loading="lazy"
  alt={photo.description ?? ''}
/>
```

The serving endpoint resolves the variant name to the right RavenDB attachment (e.g., `photo-<id>-thumbnail`) and streams it.

## Progress UI

`apiClient.upload` exposes an `onProgress` callback (XHR-backed) when needed:

```typescript
await apiClient.upload(url, fd, {
  onProgress: (e) => setProgress(Math.round((e.loaded / e.total) * 100)),
});
```

Use this for >5 MB uploads (PDFs, multi-photo batches). For small uploads (<2 MB), a simple loading spinner is enough.

## Anti-Patterns

```typescript
// ❌ Bare fetch — bypasses apiClient (auth, error mapping, content-type)
const res = await fetch(url, {method: 'POST', body: fd});

// ❌ Setting Content-Type manually
fd.set('Content-Type', 'multipart/form-data');   // strips the boundary; server can't parse

// ❌ JSON.stringify a File
fd.append('photo', JSON.stringify(file));        // fails — append the File directly

// ❌ Skipping the value reset
<input type="file" onChange={...} />             // can't re-pick the same file

// ❌ Not resetting state on cancel
//    User opens the dialog, picks a file, cancels — newFiles[] still holds the File
//    Next time the dialog opens, that ghost file silently submits.
```

## Forms with Files + RHF

React Hook Form is for the metadata side; files live in plain component state since `File` objects don't serialize and don't belong in the form state graph.

```typescript
const form = useForm<PartFormValues>({...});
const [files, setFiles] = useState<File[]>([]);
const [removedIds, setRemovedIds] = useState<string[]>([]);

const onSubmit = form.handleSubmit(async (values) => {
  const fd = buildFormData({existing: values.photos, removedIds, newFiles: files, ...}, values);
  await mutation.mutateAsync(fd);
});
```

Reset both on success: `form.reset(...)` for the form state, `setFiles([])` for the file state.
