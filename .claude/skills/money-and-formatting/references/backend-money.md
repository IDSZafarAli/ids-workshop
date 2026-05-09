---
title: Backend Money
description: Server-side Money handling — toMoney at the boundary, mapper conversion to decimal, partial-update semantics, and entity field typing
tags: [backend, toMoney, mapper, partial-update, entity, DTO]
---

# Backend Money

The backend is the single source of truth for money values. The wire format (DTO) carries decimals; the storage format (entity) carries `Money` (integer cents + currency). Conversion happens **only** at the mapper and the service-side write path.

## Entity — Money Type, Always

```typescript
import type {Money} from '@ids/data-models';
import {IdsBaseEntity} from '../../common/entities/ids-base.entity';

export class Part extends IdsBaseEntity {
  public id!: string;
  public partNumber!: string;
  public locationId!: string;

  public listPrice?: Money;       // optional — undefined or null means "not set"
  public wholesalePrice?: Money;
  public internalPrice?: Money;

  public vendors!: PartVendor[];
}

export type PartVendor = {
  vendor: VendorSnapshot;
  cost?: Money;                   // also Money, also optional
  vendorPartNumber?: string;
  isPrimary: boolean;
};
```

Every monetary field is `Money` or `Money | undefined` — never `number`.

## DTO — Decimal on the Wire

```typescript
export class PartUpdateDto {
  @ApiPropertyOptional({description: 'List price', minimum: 0, nullable: true})
  @IsNumber()
  @IsOptional()
  @Min(0)
  listPrice?: number | null;
}

export type PartDetailResponseDto = {
  partNumber: string;
  listPrice: number | null;
  // ...
};
```

The wire format is `number | null`. Clients deal in decimals (`12.99`); they don't know about cents.

## Read Path — Cents → Decimal in the Mapper

```typescript
// part.mapper.ts
import type {Part, PartVendor} from './entities/part.entity';

export function toPartDetailResponseDto(part: Part): PartDetailResponseDto {
  return {
    partNumber: part.partNumber,
    description: part.description,
    listPrice: part.listPrice ? part.listPrice.amount / 100 : null,
    wholesalePrice: part.wholesalePrice ? part.wholesalePrice.amount / 100 : null,
    primaryVendorCost: pickPrimary(part.vendors)?.cost
      ? pickPrimary(part.vendors)!.cost!.amount / 100
      : null,
  };
}
```

`amount / 100` is the canonical reverse of `toMoney(value, currency)`. The result is a number with up to 2 decimal places (or 4 for currencies tracked at higher precision).

For the `moneyToDisplay()` helper exists for the frontend; the backend just divides directly because the mapper isn't passed a Money currency context.

## Write Path — Decimal → Cents via toMoney

```typescript
// part.service.ts — partial update
if (dto.listPrice !== undefined) {
  part.listPrice = dto.listPrice !== null
    ? toMoney(dto.listPrice, 'USD')
    : undefined;
}

if (dto.wholesalePrice !== undefined) {
  part.wholesalePrice = dto.wholesalePrice !== null
    ? toMoney(dto.wholesalePrice, 'USD')
    : undefined;
}
```

The three-way partial-update guard:

- `undefined` (key absent) → don't touch the field.
- `null` (explicit clear) → set to `undefined`.
- `number` → call `toMoney(value, currency)`.

## Currency Selection

The currency is **not** passed by the client — it's derived server-side from the location's settings:

```typescript
const currency: CurrencyCode = location.currencyCode ?? 'USD';

if (dto.listPrice !== undefined) {
  part.listPrice = dto.listPrice !== null ? toMoney(dto.listPrice, currency) : undefined;
}
```

For now, most locations are USD; structure the code to read currency from location config so the multi-currency switch flips cleanly when it lands.

## Computations on the Server

Server-side calculations stay in the cents domain:

```typescript
import {addMoney, applyRate, multiplyMoney, sumMoney} from '@ids/data-models';

// Line item: unit price × qty
const lineTotal = multiplyMoney(unitPrice, quantity);

// Tax: 6.25% as 625 basis points
const tax = applyRate(lineTotal, taxRateBp);

// Order total: lines + tax
const lineTotals = lines.map((line) => multiplyMoney(line.unitPrice, line.quantity));
const subtotal = sumMoney(lineTotals, 'USD');
const total = addMoney(subtotal, applyRate(subtotal, taxRateBp));
```

Convert to decimal **only** at the mapper boundary — never inside the service for intermediate computations.

## Index Storage — Cents

When storing a price in a RavenDB index entry for sortable lists, store the integer cents:

```typescript
type PartsSearchEntry = {
  // ...
  /** List price in cents — stored as integer for correct numeric sort. */
  listPrice: number | null;
};

// In the index map:
return {
  listPrice: part.listPrice ? part.listPrice.amount : null,
};
```

Lexical sort over decimal strings does not produce numeric order (`'9.99'` > `'10.00'`). Cents as integers sort numerically.

## Anti-Patterns

```typescript
// ❌ Storing decimal directly to entity
part.listPrice = {amount: dto.listPrice, currency: 'USD'};
//   `dto.listPrice` is a decimal; this is the float-precision bug. Use toMoney().

// ❌ Mapping with toMoney instead of /100
return {listPrice: toMoney(part.listPrice, 'USD')};   // wrong direction
return {listPrice: part.listPrice.amount / 100};      // ✅

// ❌ Skipping the boundary check
const part = await session.load<Part>(`parts/${id}`);
const listPrice = part.listPrice.amount / 100;       // crashes when listPrice is undefined
//   Use: part.listPrice ? part.listPrice.amount / 100 : null

// ❌ Mixing cents and decimal in arithmetic
const total = part.listPrice.amount + dto.adjustmentAmount;
//   .amount is cents; dto field is decimal. Convert at the boundary first.

// ❌ Hand-rolled currency check
if (a.currency !== b.currency) throw new Error('mismatch');
const total = {amount: a.amount + b.amount, currency: a.currency};
//   Use addMoney(a, b). The helpers exist precisely so this code doesn't get duplicated.
```

## Validation in the DTO

```typescript
@ApiPropertyOptional({description: 'Price', minimum: 0, nullable: true})
@IsNumber()
@IsOptional()
@Min(0)
listPrice?: number | null;
```

`@Min(0)` rejects negative prices at the validation layer. For ranges, layer `@Min` and `@Max`. Locale parsing isn't an issue here — the wire format is JSON, always with `.` as decimal separator. The locale concern is a UI-side matter (see `frontend-input.md`).

## Testing Reference

`apps/astra-apis/src/part/__test__/part.service.test.ts` includes Money round-trip tests — DTO decimal in, entity Money out, mapper decimal out. Match these patterns when adding tests.
