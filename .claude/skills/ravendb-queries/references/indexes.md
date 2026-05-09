---
title: Static Indexes
description: Designing JavaScript static indexes — naming, fanout, the query field, sortable entry fields, and Jint constraints
tags: [index, AbstractJavaScriptIndexCreationTask, fanout, search, lucene, jint]
---

# Static Indexes

RavenDB precomputes query results via **static indexes** — TypeScript classes extending `AbstractJavaScriptIndexCreationTask`. The map function projects source documents into queryable entries. Indexes power every list endpoint in this project.

## File Layout

```
apps/astra-apis/src/<feature>/indexes/<feature>-<purpose>.index.ts
```

Examples: `parts-search.index.ts`, `customers-search.index.ts`, `stock-adjustments-by-part-and-location.index.ts`.

## Class Naming → Query Name

```typescript
export class Parts_Search extends AbstractJavaScriptIndexCreationTask { ... }
// Referenced as:
session.query<Part>({indexName: 'Parts/Search'});
```

The underscore in the class name becomes a slash in the query reference. RavenDB uses this transformation automatically.

## Anatomy of a Search Index

```typescript
import {AbstractJavaScriptIndexCreationTask} from 'ravendb';
import {type Part, PartStatus} from '../entities/part.entity';

type PartsSearchEntry = {
  partNumber: string;
  description: string;
  listPrice: number | null;       // cents — numeric sort
  totalOnHand: number;
  primaryVendorName: string | null;
  primaryBinNumber: string | null;
  query: string[];                // full-text tokens
  locationId: string;             // scalar — fanout per location
  isDeleted: boolean;
  status: PartStatus;
  updatedDate: Date;
};

export class Parts_Search extends AbstractJavaScriptIndexCreationTask {
  constructor() {
    super();
    this.map('parts', (part: Part): PartsSearchEntry[] => {
      // Return ONE entry per part × location (fanout)
      return part.locations.map((loc) => ({
        partNumber: part.partNumber || '',
        description: part.description || '',
        listPrice: part.listPrice ? part.listPrice.amount : null,
        totalOnHand: loc.onHandQty || 0,
        primaryVendorName: part.vendors.find((v) => v.isPrimary)?.vendor.name ?? null,
        primaryBinNumber: loc.bins.find((b) => b.isMain)?.binNumber ?? null,
        query: [part.partNumber, part.description, /* ... */],
        locationId: loc.location.id,
        isDeleted: part.isDeleted,
        status: part.status,
        updatedDate: part.updatedDate,
      }));
    });

    this.index('query', 'Search');             // Lucene StandardAnalyzer for `search()`
    this.store('listPrice', 'Yes');            // Required for projection-from-index
  }
}
```

## Fanout: One Entry Per Logical Slice

If a document has **N** locations and you need per-location queryability, return an array of N entries from `map()`. Each entry has a scalar `locationId` so `.whereEquals('locationId', X)` returns each part exactly once for that location.

The standard tenant pattern: one entry per `locations[]` row, each carrying the per-location fields (bins, on-hand, primary bin) inline.

## The `query` Field — Full-Text Search

For text search (`search('query', '...')`):

1. Map a `query: string[]` of tokens into the entry — partNumber, description, vendor name, bin numbers, etc.
2. Mark it as a search field: `this.index('query', 'Search')`.
3. RavenDB applies Lucene's StandardAnalyzer on both index and query side.

Wildcards work: `q.search('query', `${term}*`)`.

## Sortable Fields Must Be in the Entry

`orderBy('foo')` reads from the **index entry**, not the source document. Every field you intend to sort by must appear in the mapped entry. If it isn't there, sorting silently degrades.

For numeric sort on currency, store in cents as integer (`listPrice.amount`) — lexical sort over decimal strings does not give numeric order.

## Jint Constraints

RavenDB compiles index map functions in **Jint** (an embedded ECMAScript engine). Jint doesn't support every modern JS feature.

| Avoid in index `map()`             | Use Instead                       |
| ---------------------------------- | --------------------------------- |
| Optional chaining `?.`             | `&&` chains: `a && a.b && a.b.c` |
| Nullish coalescing `??`            | Logical OR: `a || b`             |
| `flat()`, `flatMap()`              | `reduce` with `concat`           |
| Spread in object literals          | Manual property assignment        |
| `for…of` over Map/Set              | `for…of` over arrays only         |

The index file itself is TypeScript — it compiles fine. The constraint applies only to code that ends up serialized into the `map` function string.

## Multi-Field and Multi-Source Indexes

```typescript
export class StockAdjustments_ByPartAndLocation extends AbstractJavaScriptIndexCreationTask {
  constructor() {
    super();
    this.map('stock-adjustments', (adj) => ({
      partNumber: adj.partNumber,
      locationId: adj.locationId,
      adjustmentDate: adj.adjustmentDate,
    }));
  }
}
```

For composite filters (e.g., search by part **and** location), index both fields and use `.whereEquals()` twice.

For **multi-source** indexes (joining two collections), use `addMap()` per collection. Read the official docs before reaching for this — most join needs are better served by snapshot fields on the parent document.

## When to Add a New Index

Add an index when:

- A new sort field is needed by a list endpoint.
- A new filter combination is hot-path and isn't satisfied by the existing index entry shape.
- A Details screen needs a non-trivial cross-document lookup that snapshotting can't solve.

Don't add an index for one-off queries — the index has a steady-state CPU cost during writes. Re-use existing indexes where possible.
