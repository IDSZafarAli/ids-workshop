---
title: Error Handling
description: Retry logic, global error hooks, error boundaries, and per-query error handling
tags: [error-handling, retry, onError, QueryCache, error-boundary]
---

# Error Handling

React Query provides multiple layers of error handling: per-query, global cache hooks, and React error boundaries.

## Global Error Handler (Already Configured)

The project's `queryClient.ts` sets up global error handling via `QueryCache.onError`:

```tsx
// core/queries/queryClient.ts
function handleGlobalError(error: Error): void {
  // Network errors -> trigger offline banner
  if (error instanceof NetworkOfflineError || error instanceof ServerUnreachableError) {
    networkMonitor.reportServerUnreachable();
    return;
  }
  // 401 -> force sign-out
  if (error instanceof ApiError && error.status === 401) {
    setSignOutNotice('session_expired');
    window.location.href = '/sign-in';
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleGlobalError }),
  mutationCache: new MutationCache({ onError: handleGlobalError }),
  // ...
});
```

**Do not duplicate this logic in individual queries.** The global handler covers auth failures and network issues automatically.

## Retry Configuration

The project configures smart retries globally:

```tsx
defaultOptions: {
  queries: {
    retry: (failureCount, error) => {
      // Never retry transient errors (network offline, abort)
      if (isTransientError(error)) return false;
      // Never retry client errors (auth, not found, validation)
      if (error instanceof ApiError) {
        if ([401, 403, 404, 422].includes(error.status)) return false;
      }
      // Retry server errors up to 2 times
      return failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
  },
}
```

### Per-Query Override

```tsx
// Disable retry for a specific query
useQuery({
  queryKey: KEYS.detail(id),
  queryFn: fetchById,
  retry: false,
});

// More aggressive retry for critical data
useQuery({
  queryKey: KEYS.criticalData(),
  queryFn: fetchCritical,
  retry: 5,
  retryDelay: 1000,
});
```

## Per-Query Error Handling

For queries that need inline error UI:

```tsx
const { data, error, isError } = useQuery({
  queryKey: KEYS.detail(id),
  queryFn: fetchById,
});

if (isError) {
  return <Alert severity="error">{error.message}</Alert>;
}
```

### Using the QueryErrorAlert Component

The project has a `QueryErrorAlert` component for standardized error display:

```tsx
import { QueryErrorAlert } from 'components/QueryErrorAlert';

function PartList() {
  const { data, error } = useQuery({ ... });

  return (
    <Box>
      <QueryErrorAlert error={error instanceof Error ? error : null} />
      {/* rest of UI */}
    </Box>
  );
}
```

## Error States in Components

```tsx
const { data, error, isError, isLoading, isFetching } = useQuery({ ... });

// Initial load — no cached data yet
if (isLoading) return <CircularProgress />;

// Error with no cached data — show error state
if (isError && !data) return <ErrorState error={error} />;

// Error with stale cached data — show data + subtle error indicator
// (placeholderData or previous cache still available)
if (isError && data) {
  return (
    <>
      <Alert severity="warning">Data may be outdated</Alert>
      <DataView data={data} />
    </>
  );
}
```

## Mutation Error Handling

```tsx
const mutation = useMutation({
  mutationFn: createPart,
  onError: (error) => {
    // Handle validation errors locally
    if (error instanceof ApiError && error.status === 422) {
      setErrors(error.data);
      return;
    }
    // Other errors (401, network) handled by global handler
  },
});

// In JSX
{mutation.isError && (
  <Alert severity="error">{mutation.error.message}</Alert>
)}
```

## Error Recovery

### Automatic: Refetch on Reconnect

React Query automatically refetches failed queries when the browser comes back online (if `refetchOnReconnect` is enabled).

### Manual: Retry Button

```tsx
const { error, refetch } = useQuery({ ... });

if (error) {
  return (
    <Alert
      severity="error"
      action={
        <Button onClick={() => refetch()}>Retry</Button>
      }
    >
      {error.message}
    </Alert>
  );
}
```

## Anti-Patterns

```tsx
// DON'T: Catch errors in queryFn (React Query can't track the error)
queryFn: async () => {
  try {
    return await fetchData();
  } catch (e) {
    return null; // Error is swallowed — isError never fires
  }
},

// DO: Let errors propagate — React Query handles them
queryFn: async ({ signal }) => {
  return fetchData({ signal });
},

// DON'T: Duplicate global error handling in every query
useQuery({
  queryKey: KEYS.list(),
  queryFn: fetchList,
  onError: (error) => {
    if (error.status === 401) redirectToLogin(); // Already handled globally!
  },
});
```

## See Also

- [mutations.md](./mutations.md) - Mutation-specific error patterns
- [caching.md](./caching.md) - How stale data is served during errors
