---
title: Mutations
description: useMutation patterns, optimistic updates, error rollbacks, and post-mutation cache sync
tags: [mutations, useMutation, optimistic-update, invalidation, onSuccess, onError]
---

# Mutations

Mutations handle create, update, and delete operations. React Query's `useMutation` provides loading states, error handling, and cache synchronization.

## Basic useMutation

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

function useUpdatePart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ partNumber, data }: { partNumber: string; data: PartUpdateInput }) =>
      partQueries.update(partNumber, data, token),
    onSuccess: (_data, variables) => {
      // Invalidate to refetch fresh data
      queryClient.invalidateQueries({
        queryKey: PART_QUERY_KEYS.detail(variables.partNumber),
      });
    },
  });
}
```

## Post-Mutation Cache Strategies

### Strategy 1: Invalidate (Recommended Default)

Simplest and safest. Marks cached data as stale so it refetches:

```tsx
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: KEYS.detail(id) });
  queryClient.invalidateQueries({ queryKey: ['parts', locationId, 'list'] });
},
```

### Strategy 2: Direct Cache Update

When you know exactly what the new data looks like (avoids an extra network round-trip):

```tsx
onSuccess: (updatedPart) => {
  // Update the detail cache directly
  queryClient.setQueryData(KEYS.detail(updatedPart.partNumber), updatedPart);

  // Still invalidate lists (order/filtering may have changed)
  queryClient.invalidateQueries({ queryKey: ['parts', locationId, 'list'] });
},
```

### Strategy 3: Optimistic Update

Show the expected result immediately, roll back on error:

```tsx
useMutation({
  mutationFn: updatePart,
  onMutate: async (newData) => {
    // 1. Cancel outgoing refetches to avoid overwriting optimistic update
    await queryClient.cancelQueries({ queryKey: KEYS.detail(id) });

    // 2. Snapshot current data for rollback
    const previous = queryClient.getQueryData(KEYS.detail(id));

    // 3. Optimistically update cache
    queryClient.setQueryData(KEYS.detail(id), (old) => ({
      ...old,
      ...newData,
    }));

    // 4. Return snapshot for rollback
    return { previous };
  },
  onError: (_err, _newData, context) => {
    // Roll back to snapshot
    if (context?.previous) {
      queryClient.setQueryData(KEYS.detail(id), context.previous);
    }
  },
  onSettled: () => {
    // Always refetch to ensure server truth
    queryClient.invalidateQueries({ queryKey: KEYS.detail(id) });
  },
});
```

**When to use optimistic updates:**
- Toggle operations (like/unlike, enable/disable)
- Inline edits where latency matters
- NOT for complex multi-field form submissions (use invalidation instead)

## Mutation States

```tsx
const mutation = useMutation({ mutationFn: updatePart });

mutation.isPending;  // Currently running
mutation.isSuccess;  // Completed successfully
mutation.isError;    // Failed
mutation.error;      // Error object (if failed)
mutation.data;       // Return data (if successful)
mutation.reset();    // Reset to idle state
```

## Using with React Router clientAction

In this project, form mutations go through `clientAction` + `useSubmit`, not `useMutation`. This is fine — React Router handles the submission state via `useNavigation().state`. Use `useMutation` for:
- Non-form mutations (delete, toggle, inline edit)
- Background operations that don't navigate
- Operations needing optimistic UI

```tsx
// clientAction approach (current pattern — good for form submissions)
export async function clientAction({ request }: ClientActionFunctionArgs) {
  const formData = await request.formData();
  const payload = JSON.parse(formData.get('payload') as string);
  const result = await partQueries.update(partNumber, payload, token);
  await queryClient.invalidateQueries({ queryKey: KEYS.detail(partNumber) });
  return { success: true };
}

// useMutation approach (better for inline/non-form mutations)
const deletePart = useMutation({
  mutationFn: (id: string) => partQueries.delete(id, token),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: KEYS.all(locationId) });
    navigate('/parts');
  },
});
```

## Error Handling in Mutations

```tsx
useMutation({
  mutationFn: createPart,
  onError: (error) => {
    // Show inline error (don't rely on global handler for user-facing feedback)
    if (error instanceof ApiError && error.status === 422) {
      setValidationErrors(error.data);
    }
    // 401/network errors are caught by global handler in queryClient.ts
  },
});
```

## Multiple Mutations on Same Page

Each `useMutation` instance has independent state. For multiple inline mutations (e.g., vendor table rows), use one hook per row or track by key:

```tsx
function VendorRow({ vendor }) {
  const deleteMutation = useMutation({
    mutationFn: () => deleteVendor(vendor.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYS.vendors() }),
  });

  return (
    <TableRow sx={{ opacity: deleteMutation.isPending ? 0.5 : 1 }}>
      {/* ... */}
      <IconButton
        onClick={() => deleteMutation.mutate()}
        disabled={deleteMutation.isPending}
      >
        <DeleteIcon />
      </IconButton>
    </TableRow>
  );
}
```

## See Also

- [query-keys.md](./query-keys.md) - Key hierarchy for targeted invalidation
- [caching.md](./caching.md) - When invalidation triggers refetch
- [error-handling.md](./error-handling.md) - Global error handling patterns
