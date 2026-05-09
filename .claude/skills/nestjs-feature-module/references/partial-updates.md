---
title: Partial Updates
description: Three-way field semantics for PATCH endpoints — undefined skips, null clears, value sets
tags: [partial-update, PATCH, three-way, undefined, null]
---

# Partial Updates

PATCH endpoints in this project use **three-way field semantics**: each field can be skipped, cleared, or set. The DTO + service must honor all three states.

## The Three States

| Wire value     | Meaning              | Service action                        |
| -------------- | -------------------- | ------------------------------------- |
| key absent (`undefined`) | "Don't touch this field" | Skip                              |
| `null`         | "Clear this field"   | Set to `null` / `undefined` on entity |
| any value      | "Set to this value"  | Assign                                |

This shape lets the client send a sparse update (just the fields that changed) and explicitly clear fields without sending the entire document.

## DTO Side

```typescript
import {ApiPropertyOptional} from '@nestjs/swagger';
import {IsNumber, IsOptional, IsString, Min} from 'class-validator';

export class PartUpdateDto {
  // Required field — null rejected (no `string | null` type, no nullable: true)
  @ApiPropertyOptional({description: 'Description'})
  @IsString()
  @IsOptional()
  description?: string;

  // Optional field — null clears
  @ApiPropertyOptional({description: 'Comments', nullable: true})
  @IsString()
  @IsOptional()
  comments?: string | null;

  // Optional numeric — null clears
  @ApiPropertyOptional({description: 'List price', minimum: 0, nullable: true})
  @IsNumber()
  @IsOptional()
  @Min(0)
  listPrice?: number | null;
}
```

The pattern is:

- **Required fields**: type is `T?` (no `| null`), no `nullable: true`. Sending `null` fails validation.
- **Optional fields**: type is `T | null`, `nullable: true`, `@IsOptional()`. Sending `null` is allowed and means clear.

## Service Side — The Guard

```typescript
public async update(
  partNumber: string,
  dto: PartUpdateDto,
  userId: string,
): Promise<PartUpdateResponseDto> {
  using session = this._sessionFactory.openSession();

  const part = await session.load<Part>(`parts/${partNumber}`);
  if (!part || part.isDeleted) {
    throw new NotFoundException(`Part ${partNumber} not found`);
  }

  // Required field — null rejected by DTO; just check undefined
  if (dto.description !== undefined) {
    part.description = dto.description;
  }

  // Optional string — null clears
  if (dto.comments !== undefined) {
    part.comments = dto.comments ?? undefined;
  }

  // Optional numeric — null clears
  if (dto.salePurchaseRatio !== undefined) {
    part.salePurchaseRatio = dto.salePurchaseRatio ?? undefined;
  }

  // Optional money — null clears, value goes through toMoney()
  if (dto.listPrice !== undefined) {
    part.listPrice = dto.listPrice !== null ? toMoney(dto.listPrice, 'USD') : undefined;
  }

  touchIdsBaseEntity(part, userId);
  await session.saveChanges();

  return toPartUpdateResponseDto(part);
}
```

## The `if (!dto.field)` Trap

```typescript
// ❌ WRONG — collapses three states into two, and treats falsy values as "skip"
if (!dto.description) {
  // skip — but this also skips `description: ''`!
} else {
  part.description = dto.description;
}

// ❌ WRONG — for numbers, this skips `listPrice: 0`
if (!dto.listPrice) {
  // skip — but `0` is a legal price meaning "clear"
}

// ✅ CORRECT — explicit on the absence vs the clear
if (dto.description !== undefined) {
  part.description = dto.description;
}
if (dto.listPrice !== undefined) {
  part.listPrice = dto.listPrice !== null ? toMoney(dto.listPrice, 'USD') : undefined;
}
```

The standards validator flags `if (!dto.field)` patterns in service files. Reason: every legacy bug in the partial-update flow can be traced back to this one shortcut.

## Why `?? undefined` Inside the Service?

The entity field is typed `field?: string`. RavenDB serializes `undefined` as a missing key in the document. `null` and `undefined` are equivalent at the document level for optional fields, but `undefined` is the canonical TypeScript way to express "no value."

The exception: at the **mapper boundary**, we send `null` (not `undefined`) so JSON has a stable key shape. Two different concerns:

| Layer                       | Use         | Why                                      |
| --------------------------- | ----------- | ---------------------------------------- |
| Entity (RavenDB document)   | `undefined` | TypeScript convention for optional       |
| DTO response (JSON wire)    | `null`      | Stable JSON key set; clients bind safely |
| DTO input (PATCH payload)   | `null`      | Distinguishes "clear" from "skip"        |

## Cross-Field Validation in Updates

If a partial update has cross-field rules ("if A is set, B must be present"), validate **after** applying the patch:

```typescript
private validateCrossFieldRules(part: Part): void {
  if (part.shippingAddressSameAsBilling === false && !part.shippingAddress) {
    throw new BadRequestException('shippingAddress is required when shippingAddressSameAsBilling is false');
  }
}

public async update(...): Promise<...> {
  // ... apply three-way update ...
  this.validateCrossFieldRules(part);  // validate the post-patch state
  await session.saveChanges();
}
```

Pre-patch validation only sees the diff, not the full state — and the rule depends on the full state.

## Bulk / Nested Partial Updates

For embedded arrays (vendors, photos, bins), the DTO usually carries the **full intended state** of the array, not a diff. The service replaces the array wholesale (after validation) rather than applying per-item patches.

```typescript
// dto.vendors is the desired full vendor list (or undefined to skip)
if (dto.vendors !== undefined) {
  await this.replaceVendors(part, dto.vendors, session);
}
```

Diff-style nested updates are doable but rare in this codebase — start with replace-wholesale unless concurrency needs say otherwise.
