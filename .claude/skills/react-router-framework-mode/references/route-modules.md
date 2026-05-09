---
title: Route Modules
description: All route module exports - loader, action, meta, links, ErrorBoundary, etc.
tags: [route-module, loader, action, meta, links, ErrorBoundary, headers, handle]
---

# Route Modules

Route modules are files referenced in `routes.ts` that define automatic code-splitting, data loading, actions, revalidation, error boundaries, and more.

## Exports Quick Reference

| Export             | Purpose                             | Runs On |
| ------------------ | ----------------------------------- | ------- |
| `default`          | Route component                     | Client  |
| `loader`           | Load data before render             | Server  |
| `clientLoader`     | Load data on client                 | Client  |
| `action`           | Handle form mutations               | Server  |
| `clientAction`     | Handle mutations on client          | Client  |
| `middleware`       | Pre/post request processing         | Server  |
| `clientMiddleware` | Client navigation processing        | Client  |
| `ErrorBoundary`    | Render on errors                    | Client  |
| `HydrateFallback`  | Show during client loader hydration | Client  |
| `headers`          | Set HTTP response headers           | Server  |
| `handle`           | Custom route metadata               | Both    |
| `links`            | Add `<link>` elements               | Both    |
| `meta`             | Add meta tags                       | Both    |
| `shouldRevalidate` | Control loader revalidation         | Client  |

---

## Component (`default`)

The default export renders when the route matches:

```tsx
import type { Route } from "./+types/my-route";

export default function MyRoute({
  loaderData,
  actionData,
  params,
  matches,
}: Route.ComponentProps) {
  return <div>{loaderData.message}</div>;
}
```

---

## `clientLoader`

Runs in browser (primary loader in SPA mode):

```tsx
export async function clientLoader({
  params,
  request,
}: Route.ClientLoaderArgs) {
  const res = await fetch(`/api/items/${params.id}`);
  return res.json();
}
```

---

## `clientAction`

Handles mutations in the browser:

```tsx
export async function clientAction({
  request,
}: Route.ClientActionArgs) {
  const formData = await request.formData();
  await api.update(formData);
  return { success: true };
}
```

---

## `ErrorBoundary`

Renders when loader, action, or component throws:

```tsx
import { isRouteErrorResponse, useRouteError } from "react-router";

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div>
        <h1>{error.status} {error.statusText}</h1>
        <p>{error.data}</p>
      </div>
    );
  }

  if (error instanceof Error) {
    return (
      <div>
        <h1>Error</h1>
        <p>{error.message}</p>
      </div>
    );
  }

  return <h1>Unknown Error</h1>;
}
```

---

## `HydrateFallback`

Renders during initial load while `clientLoader.hydrate` runs:

```tsx
export async function clientLoader() {
  return await loadLocalData();
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return <div>Loading...</div>;
}
```

---

## `meta`

```tsx
export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: loaderData.product.name },
    { name: "description", content: loaderData.product.description },
  ];
}
```

**Use `loaderData`, not `data`** - the `data` parameter is deprecated.

---

## `handle`

Custom data accessible via `useMatches`:

```tsx
export const handle = {
  breadcrumb: "Dashboard",
  permissions: ["admin"],
};
```

Usage:

```tsx
import { useMatches } from "react-router";

function Breadcrumbs() {
  const matches = useMatches();
  const crumbs = matches
    .filter((m) => m.handle?.breadcrumb)
    .map((m) => m.handle.breadcrumb);
  return <nav>{crumbs.join(" > ")}</nav>;
}
```

---

## `shouldRevalidate`

Opt out of automatic loader revalidation:

```tsx
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}: Route.ShouldRevalidateFunctionArgs) {
  if (currentUrl.pathname === nextUrl.pathname) {
    return false;
  }
  return defaultShouldRevalidate;
}
```

---

## See Also

- [routing.md](./routing.md) - Route configuration
- [data-loading.md](./data-loading.md) - Loader patterns
- [actions.md](./actions.md) - Action patterns
- [error-handling.md](./error-handling.md) - ErrorBoundary details
