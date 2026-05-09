---
name: nestjs-feature-module
description: NestJS feature module structure for IDS Cloud DMS — controller-thin / service-owns-mapping / dedicated mapper file, *ResponseDto return types, three-way partial-update semantics, and DTO validation. Use when adding or modifying a controller, service, mapper, or DTO under apps/astra-apis/src — not when only touching tests, indexes, or imports.
license: MIT
---

# NestJS Feature Module

Every backend feature follows the same five-file shape: `<feature>.module.ts`, `<feature>.controller.ts`, `<feature>.service.ts`, `<feature>.mapper.ts`, plus `dto/`, `entities/`, and `indexes/` directories. The non-negotiable rule: **controllers return DTOs, services own mapping via a dedicated mapper file, partial updates use three-way field semantics**.

## Project-Specific Context

- File naming: kebab-case (`customer.service.ts`, `create-customer.dto.ts`).
- Private variables (incl. injected deps) prefixed `_`; private methods are plain camelCase — **not** `_methodName`.
- Interfaces prefixed `I` (`ICustomerRepository`).
- All response types end in `ResponseDto`. Entities never escape the service.
- Mapping lives in `<feature>.mapper.ts` — never inline in controllers, never inline in queries.
- Errors use Problem Details (RFC 9457). Throw NestJS exceptions; the global filter shapes them.

## When to Apply

- Adding a new feature module
- Adding endpoints to an existing controller
- Implementing or modifying create/update/delete operations
- Designing or revising DTOs (request, response, query, partial update)
- Reviewing service code for the controller-thin / mapper-separated invariants

## References

| Reference                         | Use When                                                          |
| --------------------------------- | ----------------------------------------------------------------- |
| `references/controllers.md`       | Building thin controllers; ResponseDto return types               |
| `references/services.md`          | Service shape, session lifecycle, private members, mapping calls  |
| `references/dtos.md`              | Class-validator decorators, partial-update DTO `string \| null`   |
| `references/mappers.md`           | Mapper file structure, list mappers, `?? null`, embedded fields   |
| `references/partial-updates.md`   | Three-way field semantics — undefined vs null vs value            |

## Critical Patterns

### Controller — Thin, Returns DTOs

```typescript
@Controller('customers')
export class CustomerController {
  public constructor(private readonly _customerService: CustomerService) {}

  @Patch(':customerNo')
  public async update(
    @Param('customerNo') customerNo: string,
    @Body() dto: CustomerUpdateDto,
    @Auth() auth: AuthInfo,
  ): Promise<CustomerUpdateResponseDto> {
    return this._customerService.update(customerNo, dto, auth.sub);
  }
}
```

Controllers never load documents, never map entities, never compose business logic. Pass-through.

### Service — Owns Logic and Calls the Mapper

```typescript
@Injectable()
export class CustomerService {
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

    if (dto.firstName !== undefined) customer.firstName = dto.firstName;
    if (dto.lastName !== undefined) customer.lastName = dto.lastName;
    if (dto.email !== undefined) customer.email = dto.email ?? undefined;

    touchIdsBaseEntity(customer, userId);
    await session.saveChanges();

    return toCustomerUpdateResponseDto(customer);
  }
}
```

### Mapper — Dedicated File, Plain Functions

```typescript
// customer.mapper.ts
import type {Customer} from './entities/customer.entity';
import type {CustomerUpdateResponseDto} from './dto/customer-update.dto';

export function toCustomerUpdateResponseDto(c: Customer): CustomerUpdateResponseDto {
  return {
    customerNo: c.customerNo,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email ?? null,        // ?? null — never ?? undefined
    locationId: c.locationId,
  };
}
```

The standards validator flags mapper functions defined inside service files and `?? undefined` in mapper files.

### Partial Update — Three-Way Semantics

```typescript
// undefined = key absent → don't touch
// null      = explicit null → clear
// value     = new value
if (dto.email !== undefined) {
  customer.email = dto.email ?? undefined;  // null clears
}
if (dto.firstName !== undefined) {
  customer.firstName = dto.firstName;       // required field; null rejected by DTO
}

// ❌ Wrong — `!dto.field` treats empty string, 0, and undefined the same
if (!dto.email) { ... }
```

The standards validator flags `if (!dto.field)` patterns in service files.

## Further Documentation

- NestJS controllers: https://docs.nestjs.com/controllers
- class-validator: https://github.com/typestack/class-validator
- Project doc: `docs/standards/coding-standards-backend.md`
