---
title: Data Loading
description: Server loaders, client loaders, streaming, caching patterns
tags: [loader, clientLoader, data, streaming, Suspense, defer]
---

# Data Loading

Data is loaded using `loader` (server) and `clientLoader` (browser) functions.

## Client Loader

Runs in the browser. Primary loader in SPA mode:

```tsx
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const res = await fetch(`/api/products/${params.id}`);
  return res.json();
}
```

### ClientLoaderArgs

- `params` - URL parameters from dynamic segments
- `request` - The Fetch Request object
- `serverLoader` - Function to call the server loader (if one exists)

## Server Loader

Runs on the server during SSR and on server during client navigation:

```tsx
export async function loader({ params, request }: Route.LoaderArgs) {
  const product = await db.getProduct(params.id);
  return product;
}

export default function Product({ loaderData }: Route.ComponentProps) {
  return <h1>{loaderData.name}</h1>;
}
```

## Combining Server and Client Loaders

```tsx
export async function loader({ params }: Route.LoaderArgs) {
  return db.getProduct(params.id);
}

export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  const serverData = await serverLoader();
  const preferences = localStorage.getItem("prefs");
  return { ...serverData, preferences: JSON.parse(preferences || "{}") };
}
```

## Hydration with Client Loader

Force `clientLoader` to run during initial page hydration:

```tsx
export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  const cached = getFromCache();
  if (cached) return cached;

  const data = await serverLoader();
  setInCache(data);
  return data;
}

clientLoader.hydrate = true;

export function HydrateFallback() {
  return <ProductSkeleton />;
}
```

## Returning Responses

Loaders can return plain objects or Response objects:

```tsx
export async function loader({ params }: Route.LoaderArgs) {
  const product = await db.getProduct(params.id);
  if (!product) {
    throw new Response("Not Found", { status: 404 });
  }
  return product;
}
```

## Throwing Redirects

```tsx
import { redirect } from "react-router";

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const user = await getUser(request);
  if (!user) {
    throw redirect("/login");
  }
  return user;
}
```

## Using Request

Access headers, URL, and signal from the request:

```tsx
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q");
  const results = await search(query, { signal: request.signal });
  return results;
}
```

## Parallel Data Loading

React Router loads data for all matched routes in parallel. Parent and child loaders run simultaneously, not sequentially.

## Streaming with Suspense (Advanced)

Stream slow data while rendering fast data immediately:

```tsx
import { Suspense } from "react";
import { Await } from "react-router";

export async function loader({ params }: Route.LoaderArgs) {
  return {
    product: await db.getProduct(params.id),
    reviews: db.getReviews(params.id), // Don't await - stream later
  };
}

export default function Product({ loaderData }: Route.ComponentProps) {
  return (
    <div>
      <h1>{loaderData.product.name}</h1>
      <Suspense fallback={<ReviewsSkeleton />}>
        <Await resolve={loaderData.reviews}>
          {(reviews) => <Reviews items={reviews} />}
        </Await>
      </Suspense>
    </div>
  );
}
```
