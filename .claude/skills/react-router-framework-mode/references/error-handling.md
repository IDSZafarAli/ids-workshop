---
title: Error Handling
description: Error boundaries, error responses, error reporting
tags: [ErrorBoundary, error, useRouteError, isRouteErrorResponse]
---

# Error Handling

React Router provides built-in error handling through `ErrorBoundary` exports that catch errors from loaders, actions, and rendering.

## ErrorBoundary Export

Export an `ErrorBoundary` component from route modules:

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

## Throwing Responses

For expected errors (not found, unauthorized), throw Response objects from loaders:

```tsx
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const product = await fetchProduct(params.id);
  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }
  return product;
}
```

### Structured Error Data

Use the `data` helper for structured error responses:

```tsx
import { data } from "react-router";

throw data(
  { message: "Product not found", productId: params.id },
  { status: 404 }
);
```

## isRouteErrorResponse

Distinguish between intentional Response errors and unexpected errors:

```tsx
export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    // Intentionally thrown Response (404, 403, etc.)
    return <NotFoundPage />;
  }

  // Unexpected error (bug, network failure, etc.)
  return <GenericErrorPage />;
}
```

## Error Bubbling

Errors propagate upward to the nearest `ErrorBoundary` in the route hierarchy:

```
root.tsx (ErrorBoundary here catches everything)
  └── dashboard.tsx (ErrorBoundary here catches dashboard errors)
       └── settings.tsx (no ErrorBoundary - bubbles to dashboard)
```

If no `ErrorBoundary` exists in a nested route, the error reaches the parent's boundary.

## Root Error Boundary

Always implement an `ErrorBoundary` in your root route as a fallback:

```tsx
// app/root.tsx
export function ErrorBoundary() {
  const error = useRouteError();

  return (
    <html>
      <head><title>Error</title></head>
      <body>
        <h1>Something went wrong</h1>
        {isRouteErrorResponse(error) ? (
          <p>{error.status}: {error.data}</p>
        ) : (
          <p>An unexpected error occurred</p>
        )}
      </body>
    </html>
  );
}
```

## Validation Errors vs Error Boundaries

Form validation errors should be **returned** (not thrown) from actions:

```tsx
// Return validation errors - these go to actionData, NOT ErrorBoundary
export async function clientAction({ request }: Route.ClientActionArgs) {
  const formData = await request.formData();
  const errors: Record<string, string> = {};

  if (!formData.get("email")?.toString().includes("@")) {
    errors.email = "Invalid email";
  }

  if (Object.keys(errors).length > 0) {
    return data({ errors }, { status: 400 });
  }

  await createUser(formData);
  return redirect("/dashboard");
}
```

Access via `fetcher.data` or `actionData`, not `ErrorBoundary`.

## Error Reporting

Use `handleError` in `entry.server.tsx` for external error tracking:

```tsx
// app/entry.server.tsx
export function handleError(error: unknown, { request }: { request: Request }) {
  if (!request.signal.aborted) {
    // Report to Sentry, DataDog, etc.
    reportError(error);
  }
}
```

## See Also

- [route-modules.md](./route-modules.md) - All route module exports
- [actions.md](./actions.md) - Validation error patterns
