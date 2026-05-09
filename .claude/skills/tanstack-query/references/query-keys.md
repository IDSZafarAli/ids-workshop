---
title: Query Keys
description: Hierarchical query key structure, key factories, and cache invalidation patterns
tags: [query-keys, cache-invalidation, queryKey, factory]
---

# Query Keys

Query keys uniquely identify cached data. A well-structured key hierarchy enables precise and broad cache invalidation.

## Key Factory Pattern (Required)

Always centralize keys in a factory object per feature. Never use inline string arrays.

```tsx
// queries/partQueryKey.ts
export const PART_QUERY_KEYS = {
  // Broadest scope — invalidate ALL part data for a location
  all: (locationId: string) => ['parts', locationId] as const,

  // List with filters — invalidate when filters change
  list: (locationId: string, filters?: Record<string, unknown>) =>
    ['parts', locationId, 'list', filters ?? {}] as const,

  // Single part detail
  detail: (id: string) => ['parts', 'detail', id] as const,
} as const;
```

### Why Factories?

- **Single source of truth** — no duplicate key strings scattered across files
- **Hierarchical invalidation** — `['parts', locationId]` invalidates lists AND details for that location
- **Type safety** — `as const` gives exact tuple types for TypeScript inference
- **Refactor-safe** — change the key structure in one place

## Key Hierarchy Rules

Keys form a tree. Broader keys are prefixes of narrower keys:

```
['parts', locationId]                          <- all parts (broadest)
['parts', locationId, 'list', { page: 1 }]    <- filtered list
['parts', 'detail', 'PART-001']               <- single detail
```

### Invalidation Scope

```tsx
// Invalidate EVERYTHING for this location's parts (list + details)
queryClient.invalidateQueries({ queryKey: PART_QUERY_KEYS.all(locationId) });

// Invalidate only lists (not details) — e.g., after creating a new part
queryClient.invalidateQueries({ queryKey: ['parts', locationId, 'list'] });

// Invalidate one specific detail
queryClient.invalidateQueries({ queryKey: PART_QUERY_KEYS.detail(partNumber) });
```

## Reference Data Keys

For dropdown/lookup data that doesn't vary by location:

```tsx
export const PART_QUERY_KEYS = {
  // ...entity keys above...
  partStatusCodes: () => ['part-status-codes'] as const,
  uoms: () => ['uoms'] as const,
  glGroups: () => ['gl-groups'] as const,
  taxCodes: () => ['tax-codes'] as const,
};
```

These are global (no `locationId` prefix) because they're shared across all locations.

## Multi-Tenancy: Always Include locationId

For tenant-scoped data, `locationId` MUST be in the key. This ensures:
- Location switch automatically invalidates stale data
- No cross-tenant cache leaks

```tsx
// DO: locationId in key
queryKey: PART_QUERY_KEYS.list(locationId, { page, searchTerm })

// DON'T: Missing locationId — data leaks across locations
queryKey: ['parts', 'list', { page, searchTerm }]
```

## Dependent / Conditional Queries

Use `enabled` to prevent queries from firing without required context:

```tsx
useQuery({
  queryKey: PART_QUERY_KEYS.list(locationId, filters),
  queryFn: fetchParts,
  enabled: !!locationId && !!locationToken && isOnline,
});
```

## Pre-fetching with ensureQueryData

In `clientLoader`, use `ensureQueryData` to prime the cache before the component renders:

```tsx
await queryClient.ensureQueryData({
  queryKey: PART_QUERY_KEYS.list(locationId, { page, pageSize }),
  queryFn: ({ signal }) => partQueries.fetchAll({ locationId, signal, token }),
});
```

This avoids the loading flash on initial render — data is already in cache when the component mounts.

## queryOptions Helper (v5)

Use `queryOptions` for reusable, type-safe query configurations:

```tsx
import { queryOptions } from '@tanstack/react-query';

function partDetailOptions(id: string, token: string) {
  return queryOptions({
    queryKey: PART_QUERY_KEYS.detail(id),
    queryFn: ({ signal }) => partQueries.fetchById({ id, signal, token }),
    staleTime: 5 * 60_000,
  });
}

// Use in hooks
useQuery(partDetailOptions(id, token));

// Use in prefetching
queryClient.ensureQueryData(partDetailOptions(id, token));

// Use in invalidation — extract just the key
queryClient.invalidateQueries({ queryKey: partDetailOptions(id, token).queryKey });
```

Benefits: co-locates `queryKey` and `queryFn`, full TypeScript inference, reusable across `useQuery`, `ensureQueryData`, and `invalidateQueries`.

## See Also

- [caching.md](./caching.md) - staleTime, gcTime configuration
- [mutations.md](./mutations.md) - Post-mutation invalidation patterns
