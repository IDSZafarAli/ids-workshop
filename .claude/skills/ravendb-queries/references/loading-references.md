---
title: Loading Related Documents
description: Single load, batch load, includes, and the snapshot pattern for cross-document data
tags: [load, includes, snapshot, relationships]
---

# Loading Related Documents

RavenDB is a document store — joins at query time are slow. The project uses three strategies, in order of preference:

1. **Snapshot** the read-side data into the parent document.
2. **Include** referenced documents in the same round trip.
3. **Batch load** by ID when neither fits.

## Strategy 1: Snapshot (Preferred for Read Screens)

When a Details screen needs a referenced document's display fields (vendor name, location name), copy those fields into the parent at write time:

```typescript
// Stored in the Part document
type PartVendor = {
  vendor: {
    id: string;
    vendorNumber: string;
    name: string;          // ← snapshot — no extra load on read
  };
  vendorPartNumber?: string;
  isPrimary: boolean;
};
```

Reads are zero extra round trips. Writes must keep snapshots fresh — when the source vendor name changes, a background patch updates every part that snapshotted it. This trade-off is documented in `docs/standards/ravendb-document-design.md`.

## Strategy 2: Includes — Cross-Document Load in One Round Trip

Use `Includes()` when you need a referenced document **occasionally** (e.g., a single Details screen) and snapshotting would explode write churn.

```typescript
const workOrder = await session
  .include('customer.id')
  .include('mechanicId')
  .load<WorkOrder>(`work-orders/${woNumber}`);

// Subsequent loads in the same session hit the identity map — no round trip:
const customer = await session.load<Customer>(workOrder.customer.id);
const mechanic = await session.load<User>(workOrder.mechanicId);
```

Includes attach to a query or load. The included documents arrive with the response and are placed in the session's identity map; calling `load()` for those IDs returns the cached instance.

`include()` accepts a path (`'customer.id'`) — RavenDB walks the path inside the source document and includes the document at that ID.

## Strategy 3: Batch Load

For collections of references (e.g., all vendors on a part), batch load by IDs:

```typescript
const vendorIds: string[] = part.vendors.map((pv) => pv.vendor.id);
const vendorDocs: Record<string, Vendor | null> = await session.load<Vendor>(vendorIds);

for (const pv of part.vendors) {
  const fresh = vendorDocs[pv.vendor.id];
  if (!fresh) {
    throw new BadRequestException(`Vendor ${pv.vendor.id} not found`);
  }
  // Use `fresh` for current-state validation
}
```

Batch load is one network round trip regardless of array size. Always prefer it over a loop of `load()` calls — though the identity map makes the loop harmless after the first call, batch load is clearer at the call site.

## When Each Strategy Applies

| Need                                        | Strategy        |
| ------------------------------------------- | --------------- |
| Display value on a list/Details screen      | Snapshot        |
| Validating against fresh source on write    | Batch load      |
| One-off Details lookup of a related entity  | Includes        |
| Source-of-truth update propagation          | Background patch on snapshot collections |

## Anti-Patterns

```typescript
// ❌ N+1 — one round trip per vendor
for (const pv of part.vendors) {
  const v = await session.load<Vendor>(pv.vendor.id);
  // ...
}

// ❌ Snapshot ignored — going to source on every read
const part = await session.load<Part>(`parts/${id}`);
const vendorIds = part.vendors.map((pv) => pv.vendor.id);
const vendors = await session.load<Vendor>(vendorIds);
return { ...part, vendorNames: vendors.map((v) => v.name) }; // already on `pv.vendor.name`
```

The first anti-pattern is technically fine inside a single session (identity map dedups), but reads worse at the call site. The second discards the project's read-design — snapshots exist precisely to avoid that load.

## Includes in Queries

Includes also attach to queries, not just loads:

```typescript
const workOrders = await session
  .query<WorkOrder>({indexName: 'WorkOrders/Search'})
  .whereEquals('locationId', locationId)
  .include('customer.id')
  .orderBy('updatedDate')
  .skip(skip).take(pageSize)
  .all();

// All referenced customers are now in the session's identity map.
```

Useful when the response shape needs a per-row lookup that wasn't snapshotted. For high-volume lists, prefer adding the field to the snapshot/index instead — includes still ship full documents over the wire.
