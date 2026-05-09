---
title: Services
description: Service shape — constructor injection, session lifecycle, mapping calls, audit fields, and access modifiers
tags: [service, Injectable, session, mapper, IdsBaseEntity]
---

# Services

The service is the home for business logic. It opens sessions, validates state, mutates documents, calls the mapper, returns DTOs.

## Anatomy

```typescript
import {Injectable, Logger, NotFoundException} from '@nestjs/common';
import {RavenSessionFactory} from '../infrastructure/ravendb/session-factory';
import {touchIdsBaseEntity} from '../common/entities/ids-base.entity';
import type {Customer} from './entities/customer.entity';
import type {CustomerUpdateDto, CustomerUpdateResponseDto} from './dto/customer-update.dto';
import {toCustomerUpdateResponseDto} from './customer.mapper';

@Injectable()
export class CustomerService {
  private readonly _logger = new Logger(CustomerService.name);

  public constructor(
    private readonly _sessionFactory: RavenSessionFactory,
  ) {}

  public async update(
    customerNo: string,
    dto: CustomerUpdateDto,
    userId: string,
  ): Promise<CustomerUpdateResponseDto> {
    using session = this._sessionFactory.openSession();

    const customer = await session.load<Customer>(`customers/${customerNo}`);
    if (!customer || customer.isDeleted) {
      throw new NotFoundException(`Customer ${customerNo} not found`);
    }

    this.applyUpdate(customer, dto);
    touchIdsBaseEntity(customer, userId);
    await session.saveChanges();

    return toCustomerUpdateResponseDto(customer);
  }

  private applyUpdate(customer: Customer, dto: CustomerUpdateDto): void {
    if (dto.firstName !== undefined) customer.firstName = dto.firstName;
    if (dto.lastName !== undefined) customer.lastName = dto.lastName;
    if (dto.email !== undefined) customer.email = dto.email ?? undefined;
  }
}
```

## Naming Rules (project Non-Negotiable)

- Constructor-injected deps: `private readonly _sessionFactory: ...` — `_` prefix.
- Loggers, internal counters, etc.: `private readonly _logger = ...`.
- Private methods: `private applyUpdate(...)` — **no** `_` prefix.
- Public methods: `public async update(...)` — explicit modifier.

The validator hook flags `private async _someMethod` (wrong `_`) and `private readonly customerRepository` (missing `_` on the variable).

## Session per Method

Open a fresh session per public method. Don't share sessions across methods or store one as a field. The `using` declaration auto-disposes when the method returns.

```typescript
public async findOne(id: string): Promise<CustomerDetailResponseDto> {
  using session = this._sessionFactory.openSession();
  // ...
}

public async findAll(...): Promise<...> {
  using session = this._sessionFactory.openSession();
  // ...
}
```

## Audit Fields

Every business entity extends `IdsBaseEntity` with `createdDate`, `updatedDate`, `createdBy`, `updatedBy`, `version`, `isDeleted`.

```typescript
import {createIdsBaseEntity, touchIdsBaseEntity} from '../common/entities/ids-base.entity';

// Create — full audit init
const newCustomer: Customer = {
  ...createIdsBaseEntity(userId),
  id: `customers/${locationId}-${customerNo}`,
  // ...
};
await session.store(newCustomer);

// Update — bump updatedDate, updatedBy, version
touchIdsBaseEntity(customer, userId);
```

## Mapping Calls

The mapper is a separate file (`<feature>.mapper.ts`). The service imports the named functions and calls them at the return statement.

```typescript
import {toCustomerListResponseDtoList, toCustomerUpdateResponseDto} from './customer.mapper';

public async findAll(...): Promise<PagedResponseDto<CustomerListResponseDto>> {
  // ... query ...
  return toPagedDto(toCustomerListResponseDtoList(customers), page, pageSize, stats.totalResults);
}
```

The standards validator flags mapper functions defined inside service files.

## Method Style — Traditional, Not Arrow Properties

```typescript
// ✅ Correct
public async findAll(): Promise<...> { ... }

// ❌ Wrong — arrow function property
public findAll = async (): Promise<...> => { ... };
```

Arrow function properties bind `this` differently and break Nest's DI in subclasses. The validator flags them in service and controller classes.

## Throwing Exceptions

Use NestJS's built-in `HttpException` subclasses. The global filter shapes them into RFC 9457 Problem Details.

| Situation                                  | Exception                  |
| ------------------------------------------ | -------------------------- |
| Document not found                         | `NotFoundException`        |
| Cross-field validation failure             | `BadRequestException`      |
| Duplicate / unique constraint              | `ConflictException`        |
| Auth missing or invalid                    | `UnauthorizedException`    |
| Permission denied                          | `ForbiddenException`       |

Never hand-craft response JSON. See the `problem-details-errors` skill for the full mapping.

## Logging

```typescript
private readonly _logger = new Logger(CustomerService.name);

this._logger.log({event: 'customer_created', customerNo, locationId});
this._logger.warn({event: 'customer_update_no_change', customerNo});
this._logger.error({event: 'customer_update_failed', customerNo, error: err});
```

Log structured objects, not free-form strings — observability tooling parses the JSON.

## Cross-Field Validation

Per-field validation belongs in the DTO via class-validator. Cross-field rules ("if A is set, B is required") belong in a private service method called before mutation.

```typescript
private validateCrossFieldRules(dto: CustomerUpdateDto): void {
  if (dto.shippingAddressSameAsBilling === false && !dto.shippingAddress) {
    throw new BadRequestException('shippingAddress is required when shippingAddressSameAsBilling is false');
  }
}
```

Throw `BadRequestException` — the field-level message is parsed by the global filter into a `ProblemFieldError`.

## Forbidden in Services

```typescript
// ❌ Mapping inline
return {
  customerNo: customer.customerNo,
  fullName: `${customer.firstName} ${customer.lastName}`,  // map this in customer.mapper.ts
};

// ❌ Returning entities
public async findOne(id: string): Promise<Customer> { ... }

// ❌ Sharing sessions across methods
private _session = this._sessionFactory.openSession();   // never

// ❌ `if (!dto.field)` for partial-update guards
if (!dto.email) { ... }                                  // wrong — flagged by validator
```
