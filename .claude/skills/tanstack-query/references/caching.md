---
title: Caching
description: staleTime, gcTime, invalidation strategies, and cache lifetime management
tags: [caching, staleTime, gcTime, invalidation, refetch, placeholderData]
---

# Caching

React Query's cache prevents redundant network requests. Understanding `staleTime` and `gcTime` is critical.

## Key Concepts

| Setting      | Default   | Controls                                        |
| ------------ | --------- | ----------------------------------------------- |
| `staleTime`  | 0         | How long data is considered "fresh" (no refetch) |
| `gcTime`     | 5 minutes | How long inactive data stays in memory           |

### staleTime

- While data is **fresh** (`age < staleTime`), React Query serves it from cache without refetching
- Once **stale**, data is still shown but a background refetch is triggered on the next access
- Project default: **5 minutes** (set in `queryClient.ts`)

```tsx
// Global default (already configured)
defaultOptions: {
  queries: {
    staleTime: 5 * 60_000, // 5 minutes
  },
}

// Per-query override for frequently changing data
useQuery({
  queryKey: KEYS.list(locationId, filters),
  queryFn: fetchParts,
  staleTime: 30_000, // 30 seconds — refetch more often
});

// Per-query override for rarely changing reference data
useQuery({
  queryKey: KEYS.uoms(),
  queryFn: fetchUoms,
  staleTime: 30 * 60_000, // 30 minutes — UOM codes rarely change
});
```

### gcTime (Garbage Collection Time)

- Once a query has **no active observers** (component unmounted), the timer starts
- After `gcTime`, the cached data is garbage collected
- Default: 5 minutes — usually fine

```tsx
// Keep reference data longer
useQuery({
  queryKey: KEYS.partStatusCodes(),
  queryFn: fetchStatusCodes,
  gcTime: 60 * 60_000, // 1 hour — keep in memory even when not displayed
});
```

## Cache Invalidation

### After Mutations

```tsx
// Invalidate specific detail after update
await queryClient.invalidateQueries({
  queryKey: PART_QUERY_KEYS.detail(partNumber),
});

// Invalidate all lists after create (new item should appear)
await queryClient.invalidateQueries({
  queryKey: ['parts', locationId, 'list'],
});

// Nuclear option: invalidate everything for this entity
await queryClient.invalidateQueries({
  queryKey: PART_QUERY_KEYS.all(locationId),
});
```

### Targeted vs Broad

| Scenario           | Strategy                | Example                               |
| ------------------ | ----------------------- | ------------------------------------- |
| Updated one part   | Invalidate detail only  | `KEYS.detail(id)`                     |
| Created new part   | Invalidate all lists    | `['parts', locationId, 'list']`       |
| Deleted a part     | Invalidate lists + detail | `KEYS.all(locationId)` + `KEYS.detail(id)` |
| Location changed   | Automatic — key changes | Key includes `locationId`             |

## placeholderData for Smooth Transitions

Show previous data while new data loads (no loading flash on pagination):

```tsx
useQuery({
  queryKey: KEYS.list(locationId, { page, pageSize, searchTerm }),
  queryFn: fetchParts,
  placeholderData: (previousData) => previousData,
});
```

This keeps the old page visible while the next page loads. The `isFetching` flag indicates background activity.

## refetchOnWindowFocus

Disabled globally in this project (`refetchOnWindowFocus: false`). Don't override unless you have a specific reason.

## ensureQueryData vs fetchQuery

| Method            | Returns cached data? | Fetches if stale? |
| ----------------- | -------------------- | ----------------- |
| `ensureQueryData` | Yes                  | Only if missing   |
| `fetchQuery`      | No — always fetches  | Always            |

Use `ensureQueryData` in `clientLoader` for pre-fetching:

```tsx
// Good: uses cache if available, fetches only if missing
await queryClient.ensureQueryData({
  queryKey: KEYS.detail(id),
  queryFn: fetchById,
});

// Avoid: always hits the network even if data is cached
await queryClient.fetchQuery({
  queryKey: KEYS.detail(id),
  queryFn: fetchById,
});
```

## Anti-Patterns

```tsx
// DON'T: staleTime: Infinity (data never refetches)
useQuery({ queryKey: KEYS.list(), queryFn: fetch, staleTime: Infinity });

// DON'T: Manual refetch on mount (staleTime handles this)
useEffect(() => { refetch(); }, []);

// DON'T: gcTime: 0 (data is garbage collected immediately — defeats caching)
useQuery({ queryKey: KEYS.list(), queryFn: fetch, gcTime: 0 });
```

## See Also

- [query-keys.md](./query-keys.md) - Key hierarchy for invalidation targeting
- [mutations.md](./mutations.md) - Post-mutation cache strategies
