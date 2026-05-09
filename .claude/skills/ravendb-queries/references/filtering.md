---
title: Filtering & locationId
description: locationId normalization, isDeleted, whereEquals, whereIn, search, whereBetween, and the multi-tenancy guard
tags: [locationId, multi-tenancy, whereEquals, whereIn, search, isDeleted]
---

# Filtering & `locationId`

Every non-global query in this project starts with two filters: `isDeleted = false` and `locationId = <current location>`. Skipping either is a data-correctness bug.

## The locationId Guard

**Rule:** every query against a non-global collection must call `whereEquals('locationId', locationId)` before the result is materialized.

### Global vs Tenant Collections

| Collection                                                                              | Scope    | Filter by `locationId`? |
| --------------------------------------------------------------------------------------- | -------- | ----------------------- |
| `locations`, `users`, `unit-of-measurements`, system / config tables                    | Global   | No                      |
| `customers`, `parts`, `work-orders`, `stocks`, `vendors`, `bins`, all per-dealer tables | Tenant   | **Yes**                 |

When in doubt, look at the entity definition: if it has a `locationId` field, the query must filter by it.

## Normalizing the locationId

Inputs from query strings often arrive as bare codes (`LOC_HQ`). Documents store the prefixed form (`locations/LOC_HQ`). Normalize at the service entry:

```typescript
const locationId: string = query.locationId.startsWith('locations/')
  ? query.locationId
  : `locations/${query.locationId}`;
```

Use the prefixed form for `whereEquals`. If the index stores a bare ID, normalize the other direction. Pick a side per index and stay consistent.

## isDeleted

Soft-deleted documents stay in the collection. Every list query that the UI consumes must filter them out:

```typescript
session.query<Customer>({indexName: 'Customers/Search'})
  .whereEquals('isDeleted', false)
  .whereEquals('locationId', locationId)
```

For loads by ID, check after the load:

```typescript
const part = await session.load<Part>(`parts/${partNumber}`);
if (!part || part.isDeleted) {
  throw new NotFoundException();
}
```

## whereEquals — Exact Match

```typescript
q = q.whereEquals('status', 'ACTIVE');
q = q.whereEquals('isPrimary', true);
q = q.whereEquals('vendor.id', `vendors/${vendorId}`);   // dotted path into nested field
```

## whereIn — Multi-Value Match

```typescript
const statusList: string[] = query.statuses?.split(',').filter(Boolean) ?? [];
if (statusList.length > 0) {
  q = q.whereIn('status', statusList);
}
```

`whereIn` with an empty array matches nothing — guard the call.

## search — Full-Text on a Search Index Field

Requires the field to be indexed with `this.index('field', 'Search')` in the index definition. Wildcards are appended manually:

```typescript
const term = query.searchTerm?.trim();
if (term && term.length >= 2) {
  q = q.search('query', `${term}*`);
}
```

Why the `length >= 2` guard? Single-character wildcards (`a*`) match enormous result sets and stress the index. Two characters is the project minimum for opt-in search.

## whereBetween — Ranges

```typescript
const from = query.dateFrom ? new Date(query.dateFrom) : new Date('1900-01-01');
const to = query.dateTo ? new Date(query.dateTo) : new Date('2099-12-31');
q = q.whereBetween('createdDate', from, to);
```

Sentinel dates avoid having to compose two query branches for "open-ended on either side."

## Conditional Filter Composition

Build the query, then layer in optional filters with reassignment:

```typescript
let q: IDocumentQuery<Customer> = session
  .query<Customer>({indexName: 'Customers/Search'})
  .whereEquals('isDeleted', false)
  .whereEquals('locationId', locationId);

if (query.searchTerm?.trim()) {
  q = q.search('query', `${query.searchTerm.trim()}*`);
}
if (query.status) {
  q = q.whereEquals('status', query.status);
}
```

`q` is reassigned because the fluent methods return new query instances. Without `let`, optional filters silently no-op.

## AND vs OR

By default, consecutive `whereEquals` calls AND together. For OR within a query, use `.orElse()` or use `whereIn` for value alternatives:

```typescript
// "status = OPEN AND (vendor = ACME OR vendor = WIDGETS)"
q = q
  .whereEquals('status', 'OPEN')
  .andAlso()
  .openSubclause()
  .whereEquals('vendor.id', 'vendors/ACME')
  .orElse()
  .whereEquals('vendor.id', 'vendors/WIDGETS')
  .closeSubclause();
```

In practice, `whereIn` covers most OR cases without subclauses.

## Common Mistakes

| Mistake                                                  | Fix                                                       |
| -------------------------------------------------------- | --------------------------------------------------------- |
| Forgetting `locationId` filter                           | Always filter; cross-tenant data leak otherwise           |
| Filtering bare ID against prefixed index value           | Normalize before `whereEquals`                            |
| `whereIn('field', [])`                                   | Guard the call — empty array matches nothing              |
| `search('field', term)` — no wildcard                    | Append `*` for prefix search; or use `whereEquals`        |
| Chaining without reassigning `q = q.whereEquals(...)`    | The chained call returns a new instance — must reassign   |
