---
title: DTOs
description: Request and response DTOs — class-validator decorators, partial-update string | null types, swagger metadata, and shared DTO contracts
tags: [dto, class-validator, ApiProperty, IsOptional, IsEnum, partial-update]
---

# DTOs

Every endpoint has typed input and output DTOs. Input DTOs use `class-validator` decorators for validation; response DTOs are type aliases or simple classes used for Swagger.

## File Layout

```
apps/astra-apis/src/<feature>/dto/
  <feature>-base.dto.ts          ← shared response shape (no decorators if pure type)
  <feature>-create.dto.ts        ← create input + create response
  <feature>-update.dto.ts        ← partial-update input + update response
  <feature>-detail.dto.ts        ← Details screen response (richest)
  <feature>-list.query.dto.ts    ← list query params + list response row
```

Co-locate the input DTO and its response DTO in the same file when they're paired one-to-one — keeps the contract visible.

## Class-Validator Basics

```typescript
import {ApiProperty, ApiPropertyOptional} from '@nestjs/swagger';
import {IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, Min} from 'class-validator';

export class CustomerCreateDto {
  @ApiProperty({description: 'Location ID', example: 'LOC_HQ'})
  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @ApiProperty({description: 'First name', maxLength: 50})
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  firstName!: string;

  @ApiPropertyOptional({description: 'Email address', nullable: true})
  @IsString()
  @IsEmail()
  @IsOptional()
  email?: string | null;

  @ApiProperty({description: 'Customer status', enum: CustomerStatus})
  @IsEnum(CustomerStatus)
  status!: CustomerStatus;
}
```

## DTO Enum Fields Require `@IsEnum`

The standards validator flags DTOs whose enum fields lack `@IsEnum(...)`. Without it, the validator pipeline lets through any string and the runtime cast inside the service produces a corrupted document.

```typescript
@ApiProperty({enum: PartStatus})
@IsEnum(PartStatus)
status!: PartStatus;
```

## Partial Update DTO — `string | null`, All Optional

In an update DTO, every mutable field is **optional**. Fields that the client may explicitly clear are typed `T | null`:

```typescript
import type {UpdatePartDto} from '@ids/data-models';

export class PartUpdateDto implements UpdatePartDto {
  // Required field — null rejected by `@IsString()` (not nullable)
  @ApiPropertyOptional({description: 'Part description'})
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  description?: string;

  // Optional field — null clears
  @ApiPropertyOptional({description: 'Comments', nullable: true})
  @IsString()
  @IsOptional()
  comments?: string | null;

  @ApiPropertyOptional({description: 'List price', minimum: 0, nullable: true})
  @IsNumber()
  @IsOptional()
  @Min(0)
  listPrice?: number | null;
}
```

The service applies these via three-way semantics — see `partial-updates.md`.

`@IsOptional()` lets the field be missing OR `null`. Without it, missing/null fails validation. With `@IsString()` alone (no `@IsOptional()`), null is rejected — that's the right shape for **required** fields in a partial update.

## Swagger Decorators

| Decorator              | Use For                                                  |
| ---------------------- | -------------------------------------------------------- |
| `@ApiProperty(...)`    | Required fields                                          |
| `@ApiPropertyOptional` | Optional / partial-update fields                         |
| `enum: MyEnum`         | Pair with `@IsEnum(MyEnum)`                              |
| `nullable: true`       | The field accepts `null` as a clear-value                |
| `minimum`, `maximum`   | Pair with `@Min(N)` / `@Max(N)` from class-validator     |
| `maxLength`            | Pair with `@MaxLength(N)`                                |

Keep the Swagger metadata aligned with the validator decorators — they're the public API contract.

## Nested DTOs

```typescript
import {Type} from 'class-transformer';
import {ValidateNested, IsArray} from 'class-validator';

export class PartCreateDto {
  @ApiProperty({type: [PartVendorCreateDto]})
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => PartVendorCreateDto)
  vendors!: PartVendorCreateDto[];
}

export class PartVendorCreateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  vendorId!: string;
  // ...
}
```

`@Type(() => Foo)` is **required** for nested validation — class-transformer needs the constructor to instantiate the nested DTO; without it, validation silently no-ops on the nested object.

## Query DTOs

```typescript
export class PartListQueryDto {
  @ApiProperty({example: 'LOC_HQ'})
  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @ApiPropertyOptional({minimum: 1})
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({minimum: 1, maximum: 3000})
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @ApiPropertyOptional({example: 'OPEN,CLOSED', description: 'Comma-separated list'})
  @IsOptional()
  @IsString()
  statuses?: string;
}
```

Query strings are always strings — `@Type(() => Number)` triggers the cast. Without it, `page` arrives as `'1'` and silently fails numeric comparisons.

## Shared Contracts via `@ids/data-models`

Backend and frontend share DTO contracts through `@ids/data-models`:

```typescript
import type {UpdatePartDto, PartDetailDto} from '@ids/data-models';

export class PartUpdateDto implements UpdatePartDto { ... }
```

The `implements` clause keeps the backend DTO shape compatible with the type frontend code consumes. When the frontend type changes, TypeScript catches the drift here.

## Response DTO Contract — All Fields, Explicit Null

Response DTOs must always include **every field** the client expects. Optional/absent values use `null`, never `undefined`.

```typescript
// ✅ Correct — complete shape, null for absent values
export type CustomerDetailResponseDto = {
  customerNo: string;
  firstName: string;
  lastName: string;
  email: string | null;     // present but possibly empty
  phone: string | null;
  middleName: string | null;
};

// ❌ Wrong — undefined fields are dropped from JSON serialization
export type CustomerDetailResponseDto = {
  customerNo: string;
  firstName: string;
  lastName?: string;        // may be omitted from the wire response entirely
  email?: string;           // client can't distinguish "not set" from "cleared"
};
```

**Why this matters:** `JSON.stringify` silently drops `undefined` values. If the mapper returns `{ email: undefined }`, the wire response arrives as `{}` — the field is missing, not present with a null value. Frontend code that binds to every field will break or behave inconsistently because the key doesn't exist.

The rule in practice:
- Type every nullable field in the response DTO as `T | null`, not `T | undefined` and not optional (`?`)
- The mapper uses `?? null` to convert entity `undefined` to `null` at the boundary — see `mappers.md`
- All fields in the response DTO shape must be populated in the mapper — no field can be silently omitted

```typescript
// ✅ Mapper returns complete shape — all fields present
export function toCustomerDetailResponseDto(c: Customer): CustomerDetailResponseDto {
  return {
    customerNo: c.customerNo,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email ?? null,       // never ?? undefined
    phone: c.phone ?? null,
    middleName: c.middleName ?? null,
  };
}
```

## Forbidden in DTOs

- `any` types (use `unknown` if genuinely needed; usually a stricter type is correct).
- Service logic in `@Transform` callbacks — keep transforms to literal type/format conversions.
- Backend-only types (RavenDB entities, internal models) leaking into a DTO. DTOs are the wire format.
- Optional fields (`field?: T`) in response DTOs — use `field: T | null` so the key is always present in the JSON.
