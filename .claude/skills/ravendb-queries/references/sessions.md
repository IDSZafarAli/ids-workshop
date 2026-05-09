---
title: Sessions & Loads
description: Opening RavenDB sessions, loading documents by ID, firstOrNull, saveChanges, and the using-disposal pattern
tags: [session, load, firstOrNull, saveChanges, openSession]
---

# Sessions & Loads

A RavenDB session is a unit of work: track changes to documents, then commit with `saveChanges()`. Sessions are not thread-safe and are short-lived — open one per service method.

## Opening a Session

Always use the `using` declaration so the session disposes automatically — no try/finally needed.

```typescript
import {RavenSessionFactory} from '../infrastructure/ravendb/session-factory';

@Injectable()
export class CustomerService {
  public constructor(private readonly _sessionFactory: RavenSessionFactory) {}

  public async findOne(id: string): Promise<CustomerDetailResponseDto> {
    using session = this._sessionFactory.openSession();
    // ... session is disposed when the function returns
  }
}
```

`using` is TypeScript 5.2+ and lowers to a try/finally block. Each method opens its own session — never share a session across methods or requests.

## Load by Single ID

`session.load<T>(id)` returns the document or `null`. The session's identity map ensures a second `load(id)` of the same ID in the same session returns the cached instance.

```typescript
const part: Part | null = await session.load<Part>(`parts/${partNumber}`);
if (!part || part.isDeleted) {
  throw new NotFoundException(`Part ${partNumber} not found`);
}
```

The `isDeleted` check is project-wide — soft deletes are stored in-place; queries that don't filter `isDeleted` will return ghosts.

## Batch Load by IDs

`session.load<T>(ids)` with an array returns a `Record<id, T | null>` keyed by the original IDs.

```typescript
const vendorIds: string[] = part.vendors.map((v) => v.vendor.id);
const vendorDocs: Record<string, Vendor | null> = await session.load<Vendor>(vendorIds);

for (const vendor of part.vendors) {
  const fresh = vendorDocs[vendor.vendor.id];
  if (!fresh) {
    throw new BadRequestException(`Vendor ${vendor.vendor.id} not found`);
  }
}
```

Batch load is one network round trip regardless of array size.

## firstOrNull — Single Result from a Query

When a query is expected to return at most one document, use `firstOrNull()`. **Never** use `.take(1).all()` then `[0]` — the standards validator flags it.

```typescript
// ✅ Correct
const customerUnit = await session
  .query<CustomerUnit>({indexName: 'CustomerUnits/ByCustomerAndVin'})
  .whereEquals('customerId', customerId)
  .whereEquals('vin', vin)
  .firstOrNull();

if (!customerUnit) {
  throw new NotFoundException('Customer unit not found');
}

// ❌ Wrong
const results = await session.query<CustomerUnit>(...).take(1).all();
const customerUnit = results[0] ?? null;
```

## saveChanges — Commit the Unit of Work

Mutations on tracked documents are buffered until `saveChanges()`. One call commits every change in the session atomically (per-document; cross-document atomicity needs a cluster transaction).

```typescript
const customer = await session.load<Customer>(`customers/${id}`);
if (!customer) {
  throw new NotFoundException();
}

customer.firstName = dto.firstName ?? customer.firstName;
customer.updatedDate = new Date().toISOString();
customer.updatedBy = userId;

await session.saveChanges();
```

If you forget `saveChanges()`, the changes are silently discarded when the session disposes.

## store — Insert New Documents

```typescript
const newCustomer: Customer = {
  ...createIdsBaseEntity(userId),
  id: `customers/${locationId}-${customerNo}`,
  firstName: dto.firstName,
  lastName: dto.lastName,
  locationId,
  active: true,
};

await session.store(newCustomer);
await session.saveChanges();
```

Pass the document ID inside the entity (`id: 'customers/...'`). RavenDB writes that exact ID — no auto-generation.

## delete — Soft vs Hard

The project uses **soft deletes** for business entities — set `isDeleted = true` and `saveChanges()`. Hard delete (`session.delete(doc)`) is only for data that has no audit requirement (cache rows, ephemeral state).

```typescript
const part = await session.load<Part>(`parts/${partNumber}`);
if (!part) {
  throw new NotFoundException();
}
part.isDeleted = true;
touchIdsBaseEntity(part, userId);
await session.saveChanges();
```

## Common Mistakes

| Mistake                               | Fix                                                        |
| ------------------------------------- | ---------------------------------------------------------- |
| Sharing a session across requests     | Open one per service method via `using session = ...`      |
| Forgetting `saveChanges()`            | Always call it after mutating tracked documents            |
| Loading by string concat without `/`  | Always use `${collection}/${identifier}` form              |
| `.take(1).all()` for single results   | Use `.firstOrNull()`                                       |
| Skipping the `isDeleted` check        | Either filter in the query or check after `load`           |
