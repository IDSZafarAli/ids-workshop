---
name: react-router-framework-mode
description: Build full-stack React applications using React Router's framework mode. Use when configuring routes, working with loaders and actions, handling forms, handling navigation, pending/optimistic UI, error boundaries, or working with react-router.config.ts or other react router conventions.
license: MIT
---

# React Router Framework Mode

Framework mode is React Router's full-stack development experience with file-based routing, server-side, client-side, and static rendering strategies, data loading and mutations, and type-safe route module API.

## Project-Specific Context

This project runs in **SPA mode** (`ssr: false`) with `v8_middleware: true` enabled. Auth is handled by Logto (external OAuth/OIDC), not cookie sessions. All data loading uses `clientLoader`/`clientAction`, not server loaders.

## When to Apply

- Configuring new routes (`app/routes.ts`)
- Loading data with `clientLoader`
- Handling mutations with `clientAction`
- Navigating with `<Link>`, `<NavLink>`, `<Form>`, `redirect`, and `useNavigate`
- Implementing pending/loading UI states
- Implementing error boundaries
- Working with middleware

## References

Load the relevant reference for detailed guidance on the specific API/concept:

| Reference                      | Use When                                            |
| ------------------------------ | --------------------------------------------------- |
| `references/routing.md`        | Configuring routes, nested routes, dynamic segments |
| `references/route-modules.md`  | Understanding all route module exports              |
| `references/data-loading.md`   | Loading data with loaders, streaming, caching       |
| `references/actions.md`        | Handling forms, mutations, validation               |
| `references/pending-ui.md`     | Loading states, optimistic UI                       |
| `references/error-handling.md` | Error boundaries, error reporting                   |
| `references/middleware.md`     | Adding middleware (requires v7.9.0+)                |
| `references/type-safety.md`    | Auto-generated route types, type imports            |

## Critical Patterns

### Forms & Mutations

**Inline mutations** - use `useFetcher`, NOT `<Form>` (which causes page navigation):

```tsx
const fetcher = useFetcher();
const optimistic = fetcher.formData?.get("favorite") === "true" ?? isFavorite;

<fetcher.Form method="post" action={`/favorites/${id}`}>
  <button>{optimistic ? "★" : "☆"}</button>
</fetcher.Form>;
```

See `references/actions.md` for complete patterns.

### Error Boundaries

Always add `ErrorBoundary` exports to route modules to prevent crashes from bubbling up:

```tsx
import { isRouteErrorResponse, useRouteError } from "react-router";

export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return <div>{error.status} {error.statusText}</div>;
  }
  return <div>Something went wrong</div>;
}
```

See `references/error-handling.md` for details.

### Route Module Exports

**`meta` uses `loaderData`**, not deprecated `data`:

```tsx
// Correct
export function meta({ loaderData }: Route.MetaArgs) { ... }
```

See `references/route-modules.md` for all exports.

## Further Documentation

https://reactrouter.com/docs
