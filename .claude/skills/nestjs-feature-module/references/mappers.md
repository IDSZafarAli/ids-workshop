---
title: Mappers
description: Dedicated <feature>.mapper.ts file — entity-to-DTO conversion, ?? null rule, list mappers, and embedded-field handling
tags: [mapper, ResponseDto, "?? null", entity-to-dto, list-mapper]
---

# Mappers

Mappers convert RavenDB entities to response DTOs. They live in **dedicated `<feature>.mapper.ts` files** — not inside the service.

## File Structure

```typescript
// customer.mapper.ts
import type {Customer} from './entities/customer.entity';
import type {
  CustomerCreateResponseDto,
  CustomerListResponseDto,
  CustomerDetailResponseDto,
  CustomerUpdateResponseDto,
} from './dto/...';

export function toCustomerCreateResponseDto(c: Customer): CustomerCreateResponseDto {
  return {
    customerNo: c.customerNo,
    firstName: c.firstName,
    lastName: c.lastName,
    locationId: c.locationId,
  };
}

export function toCustomerUpdateResponseDto(c: Customer): CustomerUpdateResponseDto {
  return {
    customerNo: c.customerNo,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email ?? null,
    locationId: c.locationId,
  };
}

export function toCustomerDetailResponseDto(c: Customer): CustomerDetailResponseDto {
  return {
    customerNo: c.customerNo,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email ?? null,
    phone: c.phone ?? null,
    address: c.address ? toAddressDto(c.address) : null,
    locationId: c.locationId,
    createdDate: c.createdDate,
    updatedDate: c.updatedDate,
  };
}

export function toCustomerListResponseDtoList(customers: Customer[]): CustomerListResponseDto[] {
  return customers.map(toCustomerListResponseDto);
}

function toCustomerListResponseDto(c: Customer): CustomerListResponseDto {
  return {
    customerNo: c.customerNo,
    fullName: `${c.firstName} ${c.lastName}`,
    locationId: c.locationId,
  };
}
```

## The `?? null` Rule

Optional fields in DTOs use `?? null`, **never** `?? undefined`:

```typescript
// ✅ Correct — JSON serializes `null` consistently
return {
  email: customer.email ?? null,
  phone: customer.phone ?? null,
};

// ❌ Wrong — `undefined` becomes a missing key in JSON; clients can't distinguish
//    "field absent" from "field cleared"
return {
  email: customer.email ?? undefined,
};
```

The standards validator flags `?? undefined` in mapper files. Reason: API consumers parse a stable shape; missing keys mean optional fields silently drop, which corrupts forms that expect to bind to every key.

## List Mappers — Two-Function Pattern

```typescript
export function toPartWithInventoryResponseDtoList(
  parts: Part[],
  locationId?: string,
): PartWithInventoryResponseDto[] {
  return parts.map((p) => toPartWithInventoryResponseDto(p, locationId));
}

export function toPartWithInventoryResponseDto(
  part: Part,
  locationId?: string,
): PartWithInventoryResponseDto {
  // ...
}
```

Export both — the service calls `...List` after a paginated query; the single function is reusable in nested mappers.

## Embedded Snapshot Fields

When the entity stores a snapshot (a copy of fields from a related document), map directly from the snapshot — no extra load:

```typescript
export function toPartDetailVendorDto(pv: PartVendor): PartDetailVendorDto {
  return {
    vendorId: pv.vendor.id,
    vendorNumber: pv.vendor.vendorNumber,        // from snapshot
    vendorName: pv.vendor.name,                  // from snapshot
    vendorPartNumber: pv.vendorPartNumber ?? null,
    isPrimary: pv.isPrimary,
    cost: pv.cost ? pv.cost.amount / 100 : null, // Money → decimal
  };
}
```

The snapshot exists precisely so the read path doesn't need an extra `session.load`. See the `ravendb-queries` skill's `loading-references.md`.

## Money — Cents to Decimal at the Boundary

`Money.amount` is stored in cents (integer). At the DTO boundary, divide by 100:

```typescript
// Read — entity → DTO
return {
  listPrice: part.listPrice ? part.listPrice.amount / 100 : null,
};

// Write — DTO → entity
import {toMoney} from '@ids/data-models';
if (dto.listPrice !== undefined) {
  part.listPrice = dto.listPrice !== null ? toMoney(dto.listPrice, 'USD') : undefined;
}
```

Never assign a raw decimal to `Money.amount` — the storage contract expects integer cents.

## Computed Fields

Pure read-side transforms belong in the mapper:

```typescript
export function toPartDetailResponseDto(part: Part, locationId?: string): PartDetailResponseDto {
  const partLocation = locationId
    ? part.locations?.find((pl) => pl.location.id === locationId)
    : part.locations?.[0];

  const primaryVendor = part.vendors?.find((pv) => pv.isPrimary);
  const totalOnHand = part.locations?.reduce((sum, pl) => sum + (pl.onHandQty ?? 0), 0) ?? 0;

  return {
    partNumber: part.partNumber,
    description: part.description,
    primaryVendorName: primaryVendor?.vendor.name ?? null,
    onHandQty: partLocation?.onHandQty ?? 0,
    totalOnHand,
    locationId: partLocation?.location.id ?? null,
  };
}
```

Don't put business decisions or DB writes in the mapper — pure functions only. `entity → DTO` and nothing else.

## Nested Helper Functions

For deeply nested DTOs, factor sub-mappers as non-exported helpers:

```typescript
function toPartDetailLocationDto(pl: PartLocation): PartDetailLocationDto { ... }
function toPartDetailBinDto(b: LocationBin): PartDetailBinDto { ... }
function toPartDetailPhotoDto(p: PartPhoto): PartDetailPhotoDto { ... }

export function toPartDetailResponseDto(part: Part): PartDetailResponseDto {
  return {
    // ...
    locations: part.locations?.map(toPartDetailLocationDto) ?? [],
  };
}
```

Helpers stay private to the mapper file unless another mapper file genuinely needs them — at which point either share a sub-mapper or duplicate (the duplicate is often clearer).

## Forbidden in Mappers

- Awaiting promises. Mappers are sync. Loads happen in the service.
- Throwing exceptions. If the data shape isn't right, that's a service-level invariant.
- DB writes or session use.
- Importing other features' mappers across module boundaries when a snapshot already covers the case.
- `?? undefined` (validator-flagged).
