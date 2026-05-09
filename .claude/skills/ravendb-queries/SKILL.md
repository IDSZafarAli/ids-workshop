---
name: ravendb-queries
description: RavenDB session and query patterns for IDS Cloud DMS — session lifecycle, locationId filtering, paginated queries with orderBy → skip → take, static indexes, includes, and load by ID. Use when writing or modifying any RavenDB query or session code in apps/astra-apis.
license: MIT
---

# RavenDB Queries

RavenDB drives all application data in `apps/astra-apis`. Sessions are the unit of work — open, query/load, mutate, `saveChanges`, dispose.

## Project-Specific Context

- Session factory injected via `RavenSessionFactory` — open with `using session = this._sessionFactory.openSession();`
- Multi-tenancy: `whereEquals('locationId', locationId)` on **every** non-global query. The standards validator flags missing filters.
- Document IDs follow `{collection}/{identifier}` — `parts/PART-001`, `customers/LOC_HQ-CUST001`, `locations/LOC_HQ`. Always normalize bare IDs into the `locations/<id>` form before filtering.
- Static indexes live in `<feature>/indexes/<feature>-<purpose>.index.ts` and are referenced by their `Class_Name → 'Class/Name'` form (e.g., `Parts_Search` → `'Parts/Search'`).
- Pagination: `(page - 1) * pageSize` for `skip`, server-enforced max via the global `PaginationInterceptor` (3000).

## When to Apply

- Writing or modifying a service method that touches RavenDB
- Adding or changing a static index
- Implementing list/search endpoints with pagination, sorting, or filters
- Loading related documents (single, batch, or via `Includes()`)
- Reviewing service code for missing `locationId` guards or unordered pagination

## References

| Reference                          | Use When                                                       |
| ---------------------------------- | -------------------------------------------------------------- |
| `references/sessions.md`           | Opening sessions, `load`, `firstOrNull`, `saveChanges`         |
| `references/paginated-queries.md`  | Building list endpoints — orderBy → skip → take, statistics    |
| `references/indexes.md`            | Designing static indexes, fanout, query field, naming          |
| `references/filtering.md`          | `locationId`, `whereEquals`, `whereIn`, search, `whereBetween` |
| `references/loading-references.md` | `session.load(id)`, batch load, `Includes()` for related docs  |

## Critical Patterns

### Always Filter by `locationId`

```typescript
using session = this._sessionFactory.openSession();
const locationId = query.locationId.startsWith('locations/')
  ? query.locationId
  : `locations/${query.locationId}`;

const customers = await session
  .query<Customer>({indexName: 'Customers/Search'})
  .whereEquals('isDeleted', false)
  .whereEquals('locationId', locationId)
  .orderBy('updatedDate')
  .skip(skip)
  .take(pageSize)
  .all();
```

Skip the `locationId` filter only on globally-scoped collections (`Location` itself, system tables).

### Pagination: orderBy BEFORE skip/take

```typescript
// ✅ Correct — deterministic page boundaries
let q = session.query<WorkOrder>({indexName: 'WorkOrders/Search'})
  .whereEquals('isDeleted', false)
  .whereEquals('locationId', locationId);

if (sortDir === 'desc') {
  q = q.orderByDescending(sortField);
} else {
  q = q.orderBy(sortField);
}

let stats!: QueryStatistics;
const items = await q
  .statistics((s) => { stats = s; })
  .skip(skip)
  .take(pageSize)
  .all();

return toPagedDto(toResponseDtoList(items), page, pageSize, stats.totalResults);
```

Unordered pagination is a bug — RavenDB does not guarantee stable ordering across pages without an explicit `orderBy`.

### Single Document by ID

```typescript
const part: Part | null = await session.load<Part>(`parts/${partNumber}`);
if (!part || part.isDeleted) {
  throw new NotFoundException(`Part ${partNumber} not found`);
}
```

### Filter and Sort in the Query, Never in JS

```typescript
// ❌ Wrong — RavenDB returns all matches, then JS filters
const all = await session.query<Part>().whereEquals('locationId', locationId).all();
const active = all.filter((p) => p.status === 'A').sort((a, b) => a.partNumber.localeCompare(b.partNumber));

// ✅ Correct — index does the work
const active = await session.query<Part>({indexName: 'Parts/Search'})
  .whereEquals('locationId', locationId)
  .whereEquals('status', 'A')
  .orderBy('partNumber')
  .all();
```

The standards validator flags `.filter()` and `.sort()` directly after `.all()` in service files.

## Further Documentation

- RavenDB Node.js client: https://ravendb.net/docs/article-page/6.2/nodejs/client-api/what-is-a-document-store
- Indexes & queries: https://ravendb.net/docs/article-page/6.2/nodejs/indexes/what-are-indexes
- Project doc: `docs/standards/ravendb-document-design.md`
