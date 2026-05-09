---
title: Paginated Queries
description: The canonical paginated list-endpoint pattern with orderBy, skip, take, and statistics for total count
tags: [pagination, orderBy, skip, take, statistics, totalResults]
---

# Paginated Queries

The list endpoint pattern is identical across features: open a session, build a query against an index, filter by `locationId`, optionally narrow with search/filters, **order**, then page. The shape never changes.

## Canonical Shape

```typescript
public async findAll(
  query: WorkOrderListQueryDto,
): Promise<PagedResponseDto<WorkOrderResponseDto>> {
  const page = Number(query.page ?? DEFAULT_PAGE);
  const pageSize = Number(query.pageSize ?? DEFAULT_PAGE_SIZE);
  const skip: number = (page - 1) * pageSize;

  const locationId: string = query.locationId.startsWith('locations/')
    ? query.locationId
    : `locations/${query.locationId}`;

  using session = this._sessionFactory.openSession();
  let q: IDocumentQuery<WorkOrder> = session
    .query<WorkOrder>({indexName: 'WorkOrders/Search'})
    .whereEquals('isDeleted', false)
    .whereEquals('locationId', locationId);

  // ── Optional filters ──────────────────────────────────────────────
  if (query.searchTerm?.trim() && query.searchTerm.trim().length >= 2) {
    q = q.search('query', `${query.searchTerm.trim()}*`);
  }
  if (query.statuses) {
    const statusList = query.statuses.split(',').filter(Boolean);
    if (statusList.length > 0) {
      q = q.whereIn('status', statusList);
    }
  }

  // ── Sort ─────────────────────────────────────────────────────────
  const sortField = query.sort && VALID_SORT_FIELDS.includes(query.sort)
    ? query.sort
    : 'updatedDate';
  if (query.sortDir === 'desc') {
    q = q.orderByDescending(sortField);
  } else {
    q = q.orderBy(sortField);
  }

  // ── Page + total count ───────────────────────────────────────────
  let stats!: QueryStatistics;
  const items: WorkOrder[] = await q
    .statistics((s) => { stats = s; })
    .skip(skip)
    .take(pageSize)
    .all();

  return toPagedDto(
    toWorkOrderResponseDtoList(items),
    page,
    pageSize,
    stats.totalResults,
  );
}
```

## Why This Order Matters

`orderBy` → `skip` → `take` is the **only** correct sequence:

1. **Filter first** (`whereEquals`, `search`, `whereIn`) — narrows the working set.
2. **Order** — establishes the document sequence the index uses to slice pages.
3. **Skip** — drops the first N ordered entries.
4. **Take** — limits to N entries.

If `skip`/`take` runs before `orderBy`, the page slice happens against an undefined ordering — pages 1 and 2 may return overlapping or missing rows.

## Defaults

```typescript
import {DEFAULT_PAGE, DEFAULT_PAGE_SIZE} from '../common/dto/pagination-query.dto';
```

- `DEFAULT_PAGE` is `1`.
- `DEFAULT_PAGE_SIZE` is `100`.
- The global `PaginationInterceptor` enforces a hard ceiling of 3000.

## Total Count via Statistics

`statistics((s) => { stats = s; })` captures `QueryStatistics` for the query — `totalResults` is the unpaged match count, used by `toPagedDto` to compute total pages.

```typescript
import {type PagedResponseDto, toPagedDto} from '@ids/data-models';

return toPagedDto(items, page, pageSize, stats.totalResults);
```

`toPagedDto` returns `{ items, page, pageSize, totalItems, totalPages, hasNext, hasPrevious }`.

## Search vs whereEquals

Use `search()` against an index field marked `index('field', 'Search')` for full-text Lucene matching. Use `whereEquals` (or `whereIn`) for exact value matches.

```typescript
q = q.search('query', `${term.trim()}*`);          // wildcard suffix
q = q.whereEquals('status', 'OPEN');               // exact
q = q.whereIn('status', ['OPEN', 'CLOSED']);       // any of
q = q.whereBetween('promiseDate', from, to);       // range
```

## Index-Backed Sort Fields

`orderBy('myField')` requires `myField` to be returned from the index `map()` — RavenDB sorts on the stored entry, not the source document. If a sort field doesn't exist in the index entry, the query fails or falls back to lexical document-id order.

Maintain a `VALID_SORT_FIELDS` const that matches the index's stored fields:

```typescript
const VALID_SORT_FIELDS = [
  'partNumber',
  'description',
  'listPrice',
  'totalOnHand',
  'updatedDate',
] as const;

const sortField = sort && (VALID_SORT_FIELDS as readonly string[]).includes(sort)
  ? sort
  : 'updatedDate';
```

This is also the validation gate — a client-supplied `sort=foo` that isn't in the list silently falls back to the default rather than triggering an index error.

## Anti-Patterns

| Anti-Pattern                                    | Why It's Wrong                                    |
| ----------------------------------------------- | ------------------------------------------------- |
| `.skip().take().orderBy()`                      | Orders the page, not the source — wrong rows     |
| Filtering with `.all()` then `.filter()` in JS | Bypasses index; doesn't scale; flagged by validator |
| Sorting with `.all()` then `.sort()` in JS      | Same — flagged by validator                       |
| Querying without `whereEquals('locationId', …)`| Cross-tenant data leak                            |
| Hardcoding page size > 3000                     | `PaginationInterceptor` rejects with 400          |
