---
title: Frontend Handling
description: Parsing problem+json on the React side — apiClient detection, ProblemDetailError class, and surfacing errors via TanStack Query mutations
tags: [frontend, apiClient, ProblemDetailError, useMutation, error-boundary]
---

# Frontend Handling

`apiClient` already detects `application/problem+json` responses, parses them, and throws a typed error. Feature code consumes that error — it does not parse JSON itself.

## ProblemDetailError

```typescript
// core/services/apiClient — sketch
export class ProblemDetailError extends Error {
  public readonly problem: ProblemDetailDto;
  public readonly status: number;

  public constructor(problem: ProblemDetailDto) {
    super(problem.detail ?? problem.title);
    this.problem = problem;
    this.status = problem.status;
  }
}
```

Every `apiClient` call (`get`, `post`, `patch`, `delete`, `upload`) rejects with `ProblemDetailError` when the server returns `problem+json`.

## Branching on URN Type

Use the URN, not the status code — URNs are stable across HTTP refactors:

```typescript
import {PROBLEM_URN_TYPE} from '@ids/data-models';

if (err instanceof ProblemDetailError) {
  switch (err.problem.type) {
    case PROBLEM_URN_TYPE.VALIDATION:
      surfaceFieldErrors(err.problem.errors ?? []);
      break;
    case PROBLEM_URN_TYPE.NOT_FOUND:
      navigate('/parts');
      break;
    case PROBLEM_URN_TYPE.CONFLICT:
      showSnackbar(err.problem.detail ?? 'Conflict');
      break;
    case PROBLEM_URN_TYPE.UNAUTHORIZED:
      // global handler in queryClient already redirects
      break;
    default:
      showSnackbar(err.problem.detail ?? err.problem.title);
  }
}
```

## TanStack Query Mutations

Standard pattern in the project:

```typescript
const updateMutation = useMutation({
  mutationFn: (dto: PartUpdateDto) => apiClient.patch(`/parts/${partNumber}`, dto),
  onSuccess: () => {
    queryClient.invalidateQueries({queryKey: PART_QUERY_KEYS.detail(partNumber)});
    showSnackbar('Saved');
  },
  onError: (err) => {
    if (err instanceof ProblemDetailError && err.problem.type === PROBLEM_URN_TYPE.VALIDATION) {
      for (const fieldErr of err.problem.errors ?? []) {
        if (fieldErr.field === '_form') {
          form.setError('root.serverError', {type: 'server', message: fieldErr.message});
        } else {
          form.setError(fieldErr.field as Path<FormValues>, {
            type: 'server',
            message: fieldErr.message,
          });
        }
      }
      return;
    }
    showSnackbar(err instanceof Error ? err.message : 'Update failed');
  },
});
```

## Field Paths Match RHF Names

Backend emits dotted paths (`addresses.0.line1`, `vendors.0.vendorId`). React Hook Form's `setError` accepts the same shape — no translation layer.

```typescript
// Backend response
{ field: 'vendors.0.vendorId', message: 'Vendor not found' }

// React Hook Form binding
form.setError('vendors.0.vendorId', { type: 'server', message: 'Vendor not found' });
```

If the form keys diverge from the backend keys (e.g., backend `firstName` ↔ form `givenName`), maintain a map in the page module. Don't mutate the field path on the wire — keep that consistent with the entity.

## Global Handlers via QueryClient

```typescript
// core/queries/queryClient.ts
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err) => {
      if (err instanceof ProblemDetailError) {
        if (err.problem.type === PROBLEM_URN_TYPE.UNAUTHORIZED) {
          authKernel.logout({reason: 'session_expired'});
        }
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (err) => {
      if (err instanceof ProblemDetailError && err.problem.type === PROBLEM_URN_TYPE.UNAUTHORIZED) {
        authKernel.logout({reason: 'session_expired'});
      }
    },
  }),
});
```

Per-feature handlers (`onError` in a `useMutation` call) override the global where needed; the global handler covers cross-cutting concerns like 401 expiry.

## Error Boundary Scope

Per project rule: **only navigation-level errors (404, 403) belong in a route ErrorBoundary.** In-page errors (mutation failures, validation, query errors with retry available) surface inline — snackbars, field errors, error states in the component.

```typescript
// ✅ ErrorBoundary catches: route 404 (loader threw 404), route 403 (loader threw 403)
// ❌ ErrorBoundary should NOT catch: validation 400, conflict 409, mutation failures
```

A mutation that throws 400 should result in a snackbar or field errors, not a full-page error screen.

## Toast/Snackbar Copy

The backend's `detail` is the canonical user-facing message — use it directly in snackbars:

```typescript
showSnackbar(err.problem.detail ?? err.problem.title ?? 'Something went wrong');
```

Don't rewrite messages on the frontend. The backend owns the wording so all channels (web, mobile, integrations) speak the same language.

## Error Logging on the Client

Log non-validation errors with the trace IDs the backend includes:

```typescript
logger.error('api_error', {
  type: err.problem.type,
  status: err.problem.status,
  requestId: err.problem.requestId,
  correlationId: err.problem.correlationId,
  traceId: err.problem.traceId,
  detail: err.problem.detail,
});
```

`requestId` lets ops correlate a frontend error report with a backend log line in seconds.

## Anti-Patterns

```typescript
// ❌ Branching on status instead of URN
if (err.status === 404) { ... }   // brittle if a route changes status semantics

// ❌ Reading err.message instead of err.problem.detail
showSnackbar(err.message);   // works, but loses field errors and trace IDs

// ❌ Showing the title for every error
showSnackbar(err.problem.title);   // 'Bad Request' is not a useful message

// ❌ Falling through ProblemDetailError to a generic catch
catch (err) {
  showSnackbar('Error');   // throws away the ready-made message
}
```
