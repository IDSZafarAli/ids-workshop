# RavenDB Document Design — Architecture Guide

> Applies to: `apps/astra-apis/` — all RavenDB entities, indexes, and service queries.
> Last updated: 2026-04-06
>
> Reference: [Inside RavenDB — Document Modeling](https://ravendb.net/learn/inside-ravendb-book/reader/4.0/3-document-modeling#document-modeling)
>
> **Tactical query/session patterns for Claude live in `.claude/skills/ravendb-queries/`.** When a rule below changes, mirror the change in that SKILL.md so Claude's auto-loaded context stays in sync.

---

## 1. Core Philosophy: Design for Your Read Screens

The single most important rule in a document store is:

> **Put all the data you need for a Details screen into one document.**

Documents should be **independent** (stand alone without other documents), **isolated** (change independently from other documents), and **coherent** (understandable without referencing other documents).

Unlike relational databases, RavenDB is not optimized for joining data at query time. Structure your documents around how the application _reads_ data, not around how a data modeler would _normalize_ it.

- If the Part Details screen shows part identity, vendor info, and per-location inventory — all of that goes into the `Part` document.
- If the Work Order Details screen shows line items, technician, and customer info — all of that goes into the `WorkOrder` document.

**Practical test:** Can you load a Details screen with a single `session.load(id)` call? If yes, the document is well-designed. If you need multiple loads or queries, reconsider the structure.

**Real-world document test:** When modeling, imagine the data as a physical document. If it makes sense as a printed page, it's probably valid modeling.

---

## 2. Embedded vs Referenced Documents

### Embed when:
- The child data is _owned_ by the parent (it has no meaningful life outside the parent)
- The child is always loaded with the parent (you always need it on the Details screen)
- The child collection is bounded and won't grow without limit (vendors on a part, line items on a work order)
- You need atomic updates across parent + child (one `saveChanges()` call)

### Reference (store document ID) when:
- The child is a shared, independent entity with its own lifecycle (e.g., a `Vendor` or `Location` document)
- The child is displayed on its own Details screen
- The child is referenced by many parents (many parts reference the same vendor)
- You need to query _across_ the child's own fields independently

### The Snapshot Pattern (preferred over live references)

When you need data from a referenced document embedded in a query result, use a **snapshot** — a copy of the fields you need, stored inline:

```typescript
// BAD — requires cross-document lookup on every read
type PartVendor = {
  vendorId: string; // forces session.load('vendors/ACME') to get name
};

// GOOD — snapshot embeds what the UI needs; no extra lookup
type PartVendor = {
  vendor: {
    id: string;        // keep the ID for navigation / refresh
    vendorNumber: string;
    name: string;
  };
  vendorPartNumber?: string;
  isPrimary: boolean;
  cost?: Money;
};
```

**Snapshot maintenance:** When the source document changes (e.g., vendor name update), snapshots across all referencing documents must be refreshed. Handle this with a background job or a patch command scoped to affected documents. This is an accepted trade-off for read performance.

### Relationship guidance

- **Many-to-one:** Store the relationship on the "one" side by holding document IDs. Load related documents via `Include()` for single round trips.
- **Many-to-many:** Place the relationship on the _smaller_ side (fewer items per document). For example, store group IDs on users rather than user IDs on groups.
- **One-to-one:** Avoid creating separate documents. Embed the data, or use document ID postfixes (like `orders/2834/header`) only if truly necessary for concurrent updates.

---

## 3. Document Size & Unbounded Collections

**Documents should measure in kilobytes.** Very small documents (dozens of bytes) may better fit as reference/config data grouped into a single document. Very large documents (multiple MB) create performance problems on load and save.

| Size | Signal |
|---|---|
| < 100 bytes | Consider grouping into a config document (e.g., `config/uom-codes`) |
| 1–50 KB | Healthy range for most entities |
| 50–200 KB | Acceptable for aggregate roots with moderate embedded collections |
| > 200 KB | Review the design — likely embedding too much |
| > 1 MB | Design smell — split or use attachments |

### When embedded collections grow without bound

If an embedded array has no natural upper limit (e.g., transaction history on a customer), **do not** let it grow indefinitely inside one document. Strategies:

1. **Split along business boundaries** — group by time period (e.g., `invoices/CUST-001/2026-03` for March invoices). Each document stays bounded.
2. **Artificial pagination** — store N items per document (e.g., 100 line items per batch). The parent holds an array of child document IDs.
3. **Promote to a separate collection** — if the child has independent query needs, make it its own collection with a reference back to the parent.

**In IDS Cloud DMS:** A Part with 5–10 vendors and 3–5 locations is normal. A Part with 500 locations or 10,000 transaction records embedded would be a design smell — split by location or time period.

---

## 4. Attachments

Store binary or large textual data as **attachments**, not as base64-encoded fields within document JSON.

**Key properties:**
- Attachments don't load with the parent document (no performance penalty on `session.load`)
- No size limits (unlike document JSON which should stay in KB range)
- Same ACID transaction semantics as document operations — storing a document + attachment in one `saveChanges()` is atomic
- Each attachment has a name, content type, and hash

**Use attachments for:**
- Part images / photos (Pictures tab)
- Scanned documents (receipts, invoices, warranty cards)
- Generated PDFs (work order printouts, shipping labels)
- Any file upload feature

```typescript
// Store an attachment alongside a document update
session.advanced.attachments.store(docId, 'photo-front.jpg', stream, 'image/jpeg');
await session.saveChanges(); // atomic with any document changes in this session
```

---

## 5. Document ID Conventions

RavenDB uses string document IDs. Prefer **natural, human-readable IDs** over auto-generated GUIDs:

```
parts/BRAKE-PAD-D1092          ✅ natural key
vendors/CLINCHTECH             ✅ natural key
locations/MAIN                 ✅ natural key
bins/MAIN/A-12-3               ✅ hierarchical for scoping
orders/ORD-2026-00123          ✅ sequential with prefix
```

**Rules:**
- Use lowercase collection names with `/` separator: `parts/`, `vendors/`, `locations/`
- For entities scoped to a location (e.g., bins): use `bins/{locationId}/{binCode}`
- Never use database-generated integer IDs for entities that users refer to by name (part numbers, vendor codes)
- Avoid GUIDs as primary IDs — they make debugging painful and URLs opaque
- Use **ID postfixes** to group related documents: `orders/2834`, `orders/2834/items/1`, `orders/2834/tracking`

---

## 6. Multi-Tenancy: locationId Scoping

IDS Cloud DMS is multi-tenant. A tenant = a Location (`locationId`).

**Rules:**
- Every entity that is location-scoped **must** carry the location relationship, either:
  - As a direct field on the document (for entities that belong to exactly one location), or
  - As an embedded `locations[]` array (for entities shared across locations, like `Part`)
- RavenDB indexes that power list/search queries **must** filter by `locationId`
- Never return cross-location data in a single API response

**The flat-array-for-filtering pattern:**

RavenDB JavaScript indexes can query nested arrays, but a flat array of IDs is simpler to index and filter:

```typescript
// In the Parts/Search index — emit a flat array for location filtering
locationIds: doc.locations.map(l => l.location.id)
```

Then query:
```typescript
q.whereEquals('locationIds', 'locations/MAIN')
```

This avoids a nested-object `array-contains` query and keeps index definitions clean. Apply this pattern for any many-to-many flat-filter need.

---

## 7. Querying: JavaScript Indexes

RavenDB's JavaScript indexes are powerful. You can:
- Index into nested objects and arrays freely
- Fanout (emit multiple index entries per document)
- Combine full-text search fields with exact-match filter fields in one index

### Index structure pattern

```typescript
export class Parts_Search extends AbstractJavaScriptIndexCreationTask {
  constructor() {
    super();
    this.map('parts', (doc) => ({
      // Full-text search field — all searchable text concatenated
      query: [doc.partNumber, doc.description, ...doc.vendors.map(v => v.vendor.name)].join(' '),

      // Exact-match filter fields — used in .whereEquals()
      locationIds: doc.locations.map(l => l.location.id),
      isDeleted: doc.isDeleted,
      status: doc.status,
    }));

    this.index('query', FieldIndexing.Search);
    this.analyze('query', 'StandardAnalyzer');
    this.store('query', FieldStorage.No);
  }
}
```

**Rules:**
- One index per "list screen" is the target — avoid querying without an index
- Combine all searchable text into a single `query` field and use `StandardAnalyzer`
- Keep filter fields as flat primitives (strings, booleans) — avoid filtering on nested object fields directly
- Use `statistics()` callback to get `totalResults` for pagination without a second COUNT query

---

## 8. Embedded Sub-Objects: Entity File Conventions

In a document store, embedded sub-objects are **not** independent entities — they are value objects owned by their aggregate root. This has a direct impact on how we structure TypeScript files:

### Rule: Embedded types live in the aggregate root's entity file

```
apps/astra-apis/src/part/entities/
  part.entity.ts        ✅ contains Part, PartVendor, PartLocation, LocationBin, all snapshots
  part-vendor.entity.ts ❌ should not exist — PostgreSQL artifact
  part-location.entity.ts ❌ should not exist — PostgreSQL artifact
```

Separate entity files imply a separate table/collection (the relational mental model). If `PartVendor` has its own file, a future developer may assume it is a separate RavenDB collection and write cross-document queries for it.

**Correct pattern:** All embedded types for an aggregate (the document root) live in one file — `{aggregate}.entity.ts`. Import them from there, never from a sub-file.

If a shim re-export file exists from a PostgreSQL migration, delete it and update all imports to point to the aggregate root file.

---

## 9. Computed / Rollup Fields

RavenDB has no computed columns. Rollup totals must be calculated and stored on every write.

**Do not** manually cache aggregated properties (like `customer.numberOfOrders`). Use MapReduce indexes instead for cross-document aggregations. Manual caching creates concurrency issues and requires complex update logic.

**Pattern used in IDS Cloud DMS (within a single document):**

```typescript
// Part entity stores rollup totals that are recomputed on every save
part.totalOnHand = part.locations.reduce((sum, l) => sum + l.numOnHand, 0);
part.totalAvailable = part.totalOnHand + part.totalOnOrder - part.totalCommitted;
part.totalNetAvailable = part.totalAvailable - part.totalSpecialOrderCommitted;

// Each PartLocation stores bin-level rollup
location.numOnHand = location.bins.reduce((sum, b) => sum + b.numOnHand, 0);
location.numAvailable = location.numOnHand + location.numOnOrder - location.numCommitted;
```

**Rules:**
- Every write to a document with rollup fields must recalculate all rollups before `saveChanges()`
- Never read rollup fields from a query result and trust them without knowing when they were last written
- Document rollup fields with `/** Computed: ... Set on every write. */` comments (as done in `part.entity.ts`)
- For cross-document aggregations, use MapReduce indexes — never maintain counters on a parent document manually

---

## 10. ACID Scope & Transaction Boundaries

Understanding RavenDB's transaction model prevents subtle data-integrity bugs.

**Single-document operations (by ID) = full ACID:**
- `session.load()` + modify + `session.saveChanges()` is atomic, consistent, isolated, and durable
- Multiple documents modified in the same session are saved in a single ACID transaction
- This is why embedding data in one document gives you free atomicity

**Bulk operations over query results = multiple transactions (BASE):**
- Patch-by-query and delete-by-query operate on batches and may span multiple transactions
- If the operation fails mid-way, some documents will have been updated and others won't
- Design bulk operations to be idempotent so they can be safely retried

**Practical rules for IDS Cloud DMS:**
- For create/update of a single entity (Part, Vendor, etc.): rely on session-level ACID — no extra handling needed
- For batch operations (e.g., updating all snapshots when a vendor name changes): use patch-by-query and design the patch to be idempotent
- Never assume two separate `session.saveChanges()` calls are atomic with each other — if you need atomicity, do both changes in the same session

---

## 11. When to Use RavenDB `Include()`

`Include()` tells RavenDB to load related documents in the same server round trip (not in the same document — the client cache holds both, and you access them with a second `session.load()` which hits the cache, not the network).

**Use Include() when:**
- You need the full related document for write operations (e.g., to validate and snapshot a vendor on part create)
- The related data changes often (snapshots would be stale too frequently)
- You are building an update/edit flow that needs to refresh a snapshot

**Do not use Include() for:**
- List screens — the index should already have embedded the data you need
- Details screens where snapshot data is sufficient — prefer snapshot over Include for read-only display

**Lazy operations:** For multiple unrelated loads in the same request, use lazy operations to batch them into a single server call rather than multiple sequential `session.load()` calls.

---

## 12. Optimistic Concurrency

RavenDB uses change vectors for optimistic concurrency. For entities that may be edited concurrently (e.g., a Part being updated from two work orders simultaneously), enable concurrency checking:

```typescript
session.advanced.useOptimisticConcurrency = true;
```

The `IdsBaseEntity` includes a `version` field for application-level versioning, but RavenDB's `@change-vector` in `@metadata` is the authoritative concurrency token. Rely on RavenDB's built-in mechanism rather than manual version counters for write conflict detection.

---

## 13. Anti-Patterns

These are common mistakes when transitioning from relational databases to RavenDB. Avoid them.

### 13.1 Normalization mindset
> **Don't** force relational third-normal-form onto a document database.

If you find yourself creating 5 collections that always load together, you're normalizing. Embed the data in one document instead.

### 13.2 Cross-document dependencies
> **Don't** create hidden dependencies that require coordinated updates across multiple documents.

If updating document A requires also updating documents B and C in the same request to stay consistent, you either need to embed B and C into A (atomic) or accept eventual consistency with a background refresh job.

### 13.3 Incoherent documents
> **Don't** design documents that require loading other documents to be understood.

A document should be self-explanatory. If you load a `PartVendor` and it only contains `{ vendorId: 'vendors/ACME', isPrimary: true }`, you can't display anything useful without a second load. Use snapshots.

### 13.4 Manual denormalization counters
> **Don't** maintain cached aggregation fields like `customer.numberOfOrders` or `vendor.totalPartsSupplied`.

These create concurrency bugs and stale data. Use MapReduce indexes for cross-document counts and sums. Within-document rollups (like `part.totalOnHand` computed from `part.locations[]`) are fine because they're updated atomically in the same save.

### 13.5 Shared databases between applications
> **Don't** share a RavenDB database between multiple applications.

Each application owns its database. If another application needs data, use ETL (Extract-Transform-Load) or an API layer. This prevents schema coupling and conflicting migration paths.

### 13.6 Separate entity files for embedded types
> **Don't** create individual TypeScript files for embedded sub-objects.

`part-vendor.entity.ts` implies `PartVendor` is its own collection. It's not — it's an embedded value object. Keep it in `part.entity.ts`. See [Section 8](#8-embedded-sub-objects-entity-file-conventions).

---

## Quick Reference

| Decision | Answer |
|---|---|
| Should I embed or reference? | Embed if owned + bounded + always loaded together |
| What size should a document be? | Kilobytes. Under 200 KB is healthy; over 1 MB is a design smell |
| Where do snapshot types live? | In the aggregate root's `{entity}.entity.ts` file |
| How do I filter by location on a list? | Index a flat `locationIds: string[]` array; use `whereEquals('locationIds', id)` |
| How do I handle rollup totals? | Calculate and store them on every write (within one document) |
| How do I handle cross-document counts? | MapReduce indexes — never manual counters |
| Should I create a separate entity file for an embedded type? | No. It implies a separate collection. |
| When should I use `Include()`? | Write flows that need to validate/refresh a related document |
| How do I support full-text search? | One index per list screen; combine text fields into a single `query` field with `StandardAnalyzer` |
| How do I store images / binary files? | Attachments — not base64 in JSON |
| Is `saveChanges()` atomic? | Yes, for all documents modified in that session. Patch-by-query is NOT atomic. |
| What if an embedded array grows without limit? | Split by business boundary (time, location) into separate documents |
