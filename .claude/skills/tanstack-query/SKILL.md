---
name: tanstack-query
description: Patterns for TanStack React Query v5 — query keys, caching, mutations, and error handling. Use when writing data fetching hooks, configuring queries, invalidating cache, or handling async server state.
license: MIT
---

# TanStack React Query v5

React Query manages server state — fetching, caching, synchronizing, and updating data that lives on the server.

## Project-Specific Context

- Query client configured in `core/queries/queryClient.ts` with global error handling, 5-minute `staleTime`, and smart retry logic
- All API calls go through `apiClient` (never bare `fetch`) — see frontend coding standards
- Query key factories live in `queries/*QueryKey.ts` files per feature (e.g., `PART_QUERY_KEYS`)
- Data pre-fetching happens in `clientLoader` via `queryClient.ensureQueryData`
- Multi-tenancy: most queries are scoped by `locationId`

## When to Apply

- Creating or modifying data fetching hooks
- Configuring query options (`staleTime`, `gcTime`, `enabled`, `retry`)
- Invalidating or updating cached data after mutations
- Pre-fetching data in `clientLoader` for route transitions
- Implementing optimistic updates or mutation side effects

## References

| Reference                      | Use When                                          |
| ------------------------------ | ------------------------------------------------- |
| `references/query-keys.md`     | Designing query key hierarchies, invalidation     |
| `references/caching.md`        | Configuring staleTime, gcTime, cache strategies   |
| `references/mutations.md`      | Optimistic updates, post-mutation cache sync      |
| `references/error-handling.md` | Retry logic, error boundaries, global error hooks |
| `references/hooks.md`          | Writing custom useQuery/useMutation hooks         |

## Critical Patterns

### Always Use Query Key Factories

```tsx
// DO: Centralized key factory
export const PART_QUERY_KEYS = {
  all: (locationId: string) => ['parts', locationId] as const,
  list: (locationId: string, filters?: Record<string, unknown>) =>
    ['parts', locationId, 'list', filters ?? {}] as const,
  detail: (id: string) => ['parts', 'detail', id] as const,
};

// DON'T: Inline string keys
useQuery({ queryKey: ['parts', locationId], ... });
```

### Pre-fetch in clientLoader

```tsx
export async function clientLoader({ context }: ClientLoaderFunctionArgs) {
  const { locationToken } = context.get(RESOLVED_LOCATION_CONTEXT);
  await queryClient.ensureQueryData({
    queryKey: QUERY_KEYS.list(locationId),
    queryFn: ({ signal }) => api.fetchAll({ signal, token: locationToken }),
  });
  return null;
}
```

### Invalidate After Mutation

```tsx
await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(id) });
```

## Further Documentation

https://tanstack.com/query/latest/docs/framework/react/overview
