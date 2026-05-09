---
title: Middleware & Context API
description: Server and client middleware, context API for sharing data
tags: [middleware, context, authentication, logging, request-processing]
requires: [react-router@7.9.0+, v8_middleware: true]
---

# Middleware & Context API

## Version Requirements

Middleware requires React Router 7.9.0+ and the `v8_middleware: true` flag in `react-router.config.ts`.

## Overview

Middleware runs code before and after response generation. Executes in a nested chain: parent -> child on the way down, child -> parent on the way up.

```
Root middleware start
  Parent middleware start
    Child middleware start
      -> Run loaders, generate Response
    Child middleware end
  Parent middleware end
Root middleware end
```

## Basic Middleware

```tsx
import type { Route } from "./+types/dashboard";
import { redirect } from "react-router";

async function authMiddleware({ request, context }: Route.MiddlewareArgs) {
  const user = await getUserFromSession(request);
  if (!user) {
    throw redirect("/login");
  }
  context.set(userContext, user);
}

export const middleware: Route.MiddlewareFunction[] = [authMiddleware];
```

### The `next` Function

Call `next()` to continue the chain and get the response:

```tsx
async function loggingMiddleware(
  { request }: Route.MiddlewareArgs,
  next: Route.MiddlewareNext,
) {
  console.log(`-> ${request.method} ${request.url}`);
  const response = await next();
  console.log(`<- ${response.status}`);
  return response;
}
```

- Call `next()` only once
- If you don't need post-processing, skip calling `next()` (called automatically)

## Context API

Create typed context to share data between middleware and loaders/actions:

```tsx
// app/context.ts
import { createContext } from "react-router";

export const userContext = createContext<User | null>(null);
export const dbContext = createContext<Database>();
```

### Setting Context in Middleware

```tsx
import { userContext } from "~/context";

async function authMiddleware({ request, context }: Route.MiddlewareArgs) {
  const user = await getUser(request);
  context.set(userContext, user);
}

export const middleware: Route.MiddlewareFunction[] = [authMiddleware];
```

### Reading Context in Loaders/Actions

```tsx
import { userContext } from "~/context";

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  return { profile: await getProfile(user) };
}
```

## Client Middleware

Runs on client-side navigations:

```tsx
export const clientMiddleware: Route.ClientMiddlewareFunction[] = [
  async ({ context }, next) => {
    const start = performance.now();
    await next();
    console.log(`Navigation: ${performance.now() - start}ms`);
  },
];
```

## When Server Middleware Runs

| Request Type                     | Middleware Runs?      |
| -------------------------------- | --------------------- |
| Document request (`GET /route`)  | Always                |
| Client navigation with loader    | Yes (`.data` request) |
| Client navigation without loader | No                    |

To force middleware on routes without loaders, add an empty loader:

```tsx
export const middleware: Route.MiddlewareFunction[] = [authMiddleware];
export async function loader() { return null; }
```

## Common Patterns

### Authentication

```tsx
async function authMiddleware({ request, context }: Route.MiddlewareArgs) {
  const session = await getSession(request);
  if (!session.get("userId")) {
    throw redirect("/login");
  }
  context.set(userContext, await getUserById(session.get("userId")));
}
```

### Response Headers

```tsx
async function securityHeaders(
  _: Route.MiddlewareArgs,
  next: Route.MiddlewareNext,
) {
  const response = await next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
```

### Conditional Execution

```tsx
export const middleware: Route.MiddlewareFunction[] = [
  async ({ request, context }, next) => {
    if (request.method === "POST") {
      await requireAuth(request, context);
    }
    return next();
  },
];
```

## See Also

- [React Router Middleware Documentation](https://reactrouter.com/how-to/middleware)
