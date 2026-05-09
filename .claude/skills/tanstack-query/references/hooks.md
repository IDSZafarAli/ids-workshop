---
title: Custom Hooks
description: Patterns for writing custom useQuery and useMutation hooks with auth, abort signals, and feature organization
tags: [hooks, useQuery, useMutation, custom-hooks, apiClient]
---

# Custom Hooks

All data fetching in this project goes through custom hooks that wrap `useQuery` / `useMutation`. Hooks live in feature modules at `pages/[feature]/hooks/`.

## Hook Structure

```
pages/
  parts/
    hooks/
      useParts.ts            # List query hook
      usePartFormOptions.ts   # Multi-query hook for dropdowns
    queries/
      partQueryKey.ts         # Key factory
      partQueries.ts          # API service functions
```

## Standard useQuery Hook

```tsx
import { useQuery } from '@tanstack/react-query';
import { useAuth } from 'core/auth/useAuth';
import { PART_QUERY_KEYS } from '../queries/partQueryKey';
import { partQueries } from '../queries/partQueries';

interface UsePartsOptions {
  locationId: string;
  page?: number;
  pageSize?: number;
  searchTerm?: string;
}

export function useParts(options: UsePartsOptions) {
  const { accessToken } = useAuth();
  const { locationId, page = 1, pageSize = 25, searchTerm = '' } = options;

  return useQuery({
    queryKey: PART_QUERY_KEYS.list(locationId, { page, pageSize, searchTerm }),
    queryFn: ({ signal }) => {
      if (!accessToken) throw new Error('No access token');
      return partQueries.fetchAll({
        locationId,
        page,
        pageSize,
        searchTerm,
        signal,
        token: accessToken,
      });
    },
    enabled: !!accessToken && !!locationId,
    placeholderData: (previousData) => previousData,
  });
}
```

### Key Patterns

- **`useAuth()` for tokens** — hooks get `accessToken` from auth context, pass to API functions
- **`signal` from queryFn** — React Query provides an `AbortSignal` for automatic cancellation
- **`enabled` guard** — prevents queries from firing without auth or required params
- **`placeholderData`** — keeps previous data visible during pagination/filtering

## Multi-Query Hook (Aggregated Dropdowns)

When a form needs many dropdown options, aggregate them into one hook.

### Checklist — every multi-query hook must have all of these

- [ ] **Token from context** — call `useLocation()` (for location-scoped APIs) or `useAuth()` (for global APIs) inside the hook; never accept `token` as a parameter
- [ ] **Shared `enabled` guard** — derive once (`const enabled = token !== ''`) and reuse on every query
- [ ] **`staleTime: 30 * 60_000`** — reference/lookup data rarely changes; set on every query
- [ ] **`isLoading` in return** — OR of all query `isLoading` values so callers can show a loading state
- [ ] **`error` in return** — first non-null error across all queries so callers can surface failures
- [ ] **No non-null assertions (`!`)** — use `token !== ''` guard + empty-string default instead

```tsx
export function usePartFormOptions(locationId: string) {
  const { locationToken } = useLocation();
  const token = locationToken ?? '';
  const enabled = token !== '';

  const statusCodes = useQuery({
    queryKey: PART_QUERY_KEYS.partStatusCodes(),
    queryFn: ({ signal }) => partQueries.fetchStatusCodes({ signal, token }),
    enabled,
    staleTime: 30 * 60_000,
  });

  const uoms = useQuery({
    queryKey: PART_QUERY_KEYS.uoms(),
    queryFn: ({ signal }) => partQueries.fetchUoms({ signal, token }),
    enabled,
    staleTime: 30 * 60_000,
  });

  return {
    statusCodes: statusCodes.data ?? [],
    uoms: uoms.data ?? [],
    isLoading: statusCodes.isLoading || uoms.isLoading,
    error: statusCodes.error ?? uoms.error ?? null,
  };
}
```

## API Service Functions

Service functions are plain objects per feature in `queries/*Queries.ts`. They handle URL construction and use `apiClient`:

```tsx
import { apiClient } from 'core/services/apiClient';
import { API_CONFIG } from 'core/config/apiConfig';

interface FetchAllParams {
  locationId: string;
  page: number;
  pageSize: number;
  searchTerm?: string;
  signal?: AbortSignal;
  token: string;
}

export const partQueries = {
  fetchAll: async (params: FetchAllParams): Promise<PartListResponse> => {
    const searchParams = new URLSearchParams({
      page: String(params.page),
      pageSize: String(params.pageSize),
      ...(params.searchTerm && { searchTerm: params.searchTerm }),
    });
    return apiClient.get<PartListResponse>(
      `${API_CONFIG.baseUrl}/parts/${params.locationId}?${searchParams}`,
      { signal: params.signal, token: params.token },
    );
  },

  fetchById: async ({ id, signal, token }: { id: string; signal?: AbortSignal; token: string }) => {
    return apiClient.get<Part>(
      `${API_CONFIG.baseUrl}/parts/detail/${id}`,
      { signal, token },
    );
  },

  update: async (partNumber: string, data: PartUpdateInput, token: string) => {
    return apiClient.patch<Part>(
      `${API_CONFIG.baseUrl}/parts/${partNumber}`,
      { body: data, token },
    );
  },
};
```

### Rules for API Functions

- **Always use `apiClient`** — never bare `fetch()` (see frontend coding standards)
- **Accept `signal`** — enables React Query's automatic request cancellation
- **Accept `token`** — auth token from `useAuth()`, passed by the hook
- **Type inputs and outputs** — full TypeScript safety on params and return types

## useMutation Hook

```tsx
export function useDeletePart(locationId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (partNumber: string) =>
      partQueries.delete(partNumber, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: PART_QUERY_KEYS.all(locationId),
      });
    },
  });
}
```

## Naming Conventions

| Hook | Purpose | Example |
|---|---|---|
| `use[Entity]s` | Fetch list | `useParts`, `useLocations` |
| `use[Entity]` | Fetch single | `usePart(id)` |
| `use[Entity]FormOptions` | Fetch form dropdowns | `usePartFormOptions` |
| `useCreate[Entity]` | Create mutation | `useCreatePart` |
| `useUpdate[Entity]` | Update mutation | `useUpdatePart` |
| `useDelete[Entity]` | Delete mutation | `useDeletePart` |

## See Also

- [query-keys.md](./query-keys.md) - Key factories used by hooks
- [mutations.md](./mutations.md) - Mutation callback patterns
- [error-handling.md](./error-handling.md) - Error handling in hooks
