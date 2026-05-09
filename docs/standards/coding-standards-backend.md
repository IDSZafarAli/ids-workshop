---
marp: true
theme: ids-training-marp-theme
header: 'Coding Standards Backened'
paginate: true
footer: '&copy; 2026 - Integrated Dealer Systems'
---
# Coding Standards — Backend (NestJS & RavenDB)

Backend-specific standards. Core TypeScript and database naming rules are in `coding-standards-core.md` (loaded separately).

> **Tactical patterns for Claude live in `.claude/skills/nestjs-feature-module/` and `.claude/skills/ravendb-queries/`.** When a rule below changes, mirror the change in the corresponding SKILL.md so Claude's auto-loaded context stays in sync with this canonical spec.

---

## Non-Negotiable Rules

These are the hard rules. If your code violates one, it is wrong — no exceptions. Rationale and examples follow in later sections.

1. **Controllers return DTOs, never entities.** Return type is `*ResponseDto`; body is a thin pass-through to the service.
2. **Mapping happens in the service** via a dedicated `<entity>.mapper.ts` file. Never map in controllers, never inline in queries.
3. **Every RavenDB query filters by `locationId`** — except queries on globally-scoped entities (e.g. `Location` itself, system tables).
4. **Paginated queries always call `.orderBy()`** before `.skip()`/`.take()`. Unordered pagination is a bug.
5. **Private variables prefixed with `_`** (including constructor-injected deps). **Private methods are plain camelCase** — no `_` prefix.
6. **Interfaces prefixed with `I`** — `ICustomer`, `ICustomerRepository`.
7. **API errors use Problem Details (RFC 9457)** — services throw NestJS exceptions; never hand-craft error JSON in controllers.
8. **Partial updates use three-way field semantics**: `undefined` = skip, `null` = clear, value = set. Never `!dto.field`.

---

## TypeScript Class Conventions

### File Naming

**All backend files use kebab-case.** This applies to services, controllers, modules, DTOs, entities, repositories, guards, interceptors, and test files.

```
// ✅ Correct
customer.service.ts
customer.controller.ts
create-customer.dto.ts
customer.mapper.ts
customer-db.repository.ts

// ❌ Incorrect
CustomerService.ts
customerService.ts
```

### Interface Naming

**Always prefix interfaces with `I`:**

```typescript
// ✅ Correct
export interface ICustomer { id: string; firstName: string; }
export interface ICustomerRepository { findById(id: string): Promise<ICustomer | null>; }

// ❌ Incorrect — no "I" prefix
export interface Customer { id: string; }
```
---
### Private Variable Naming — `_` prefix; methods exempt

**Private variables** (including constructor-injected dependencies) are prefixed with `_`. **Private methods are not** — they use plain camelCase. The `private` keyword is the access modifier signal for methods; variables get `_` because `this._foo` benefits from visual distinction from a local `foo` in the same scope.

```typescript
// ✅ Correct — `_` on variables, plain camelCase on methods
@Injectable()
export class CustomerService {
  constructor(
    @Inject(CUSTOMER_REPO)
    private readonly _customerRepository: ICustomerRepository,
    private readonly _addressService: AddressService,
  ) {}

  private async validateCustomer(customer: Customer): Promise<boolean> { ... }
}

// ❌ Incorrect — missing "_" on variable, wrong "_" on method
@Injectable()
export class CustomerService {
  constructor(
    @Inject(CUSTOMER_REPO)
    private readonly customerRepository: ICustomerRepository, // missing _
  ) {}

  private async _validateCustomer(customer: Customer): Promise<boolean> { ... } // extra _
}
```
---
### Access Modifiers

**Always explicitly declare `public`, `private`, or `protected` on all class methods:**

```typescript
// ✅ Correct
@Injectable()
export class CustomerService {
  public async findAll(): Promise<Customer[]> { ... }
  public async findOne(id: string): Promise<Customer | null> { ... }
  private async validateCustomer(customer: Customer): Promise<boolean> { ... }
}

// ❌ Incorrect — implicit (defaults to public, but intent is unclear)
@Injectable()
export class CustomerService {
  async findAll(): Promise<Customer[]> { ... }
}
```

---

## NestJS Patterns

### Method Syntax

**Use traditional method syntax** for all class methods in services, controllers, and providers. Never use arrow function properties.

```typescript
// ✅ Correct — traditional methods, DTO return types, mapping via `.mapper.ts`
@Injectable()
export class CustomerService {
  constructor(
    @Inject(CUSTOMER_REPO)
    private readonly _customerRepository: ICustomerRepository,
  ) {}

  public async create(dto: CreateCustomerDto): Promise<CustomerResponseDto> {
    const customer = await this._customerRepository.create(dto);
    return toCustomerDto(customer);
  }

  public async findAll(criteria: ICustomerSearchCriteria = {}): Promise<CustomerResponseDto[]> {
    const customers = await this._customerRepository.findAll(criteria);
    return customers.map(toCustomerDto);
  }
}

// ❌ Incorrect — arrow function properties
@Injectable()
export class CustomerService {
  create = async (dto: CreateCustomerDto): Promise<Customer> => { ... };
}
```

**Why:** Traditional methods live on the class prototype (memory efficient, shareable across instances), can be overridden in subclasses, and align with NestJS DI and testing conventions.

**Arrow functions are fine for:** utility functions outside classes, callbacks in array operations (`map`, `filter`), and private closure helpers.

---
### Service Organization

- Group related methods together
- Order: CRUD first, then specialized methods
- Keep methods focused and single-purpose
- Types are the documentation — avoid redundant JSDoc unless explaining non-obvious intent

### Error Handling

Use built-in NestJS exceptions:

```typescript
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

public async findOne(id: string): Promise<Customer> {
  const customer = await this._customerRepository.findById(id);
  if (!customer) {
    throw new NotFoundException(`Customer ${id} not found`);
  }
  return customer;
}
```

Common exceptions: `NotFoundException`, `BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `ConflictException`.

---
### Problem Details (RFC 9457)

All API error responses must use Problem Details (`application/problem+json`) via the global exception filter.

Required fields: `type`, `title`, `status`, `detail`, `instance`, `requestId`, `correlationId`, `timestamp`.

```typescript
// ✅ Correct — Problem Details shape
{
  type: "urn:ids:error:not-found",
  title: "Not Found",
  status: 404,
  detail: "Customer 123 not found",
  instance: "/api/customer/123",
  requestId: "...",
  correlationId: "...",
  timestamp: "2026-02-15T12:00:00.000Z"
}

// ❌ Incorrect — ad-hoc error shape
{ error: "something went wrong" }
```

Rules:
- Services throw NestJS exceptions
- Global filter translates exceptions to Problem Details
- Controllers must not hand-craft custom error JSON
- `type` must use documented IDS URNs from `docs/standards/api-problem-details.md`

---

## RavenDB Patterns

### Use Session Factory, Not Direct Injection

```typescript
// ✅ Good — using session factory in service
@Injectable()
export class CustomerService {
  constructor(
    @Inject(CUSTOMER_REPO)
    private readonly _customerRepository: ICustomerRepository,
  ) {}

  public async findAll(locationId: string): Promise<Customer[]> {
    return await this._customerRepository.findByLocation(locationId);
  }
}

// Repository uses session factory internally
@Injectable()
export class CustomerDbRepository implements ICustomerRepository {
  constructor(
    @Inject(RAVEN_SESSION_FACTORY)
    private readonly _sessionFactory: IRavenSessionFactory,
  ) {}

  public async findByLocation(locationId: string): Promise<Customer[]> {
    using session = this._sessionFactory.openSession();
    return await session
      .query<Customer>({ collection: 'customers' })
      .whereEquals('locationId', locationId)
      .all();
  }
}
```

### Use Includes to Load Related Documents

```typescript
// ✅ Good — single round trip with includes
using session = this._sessionFactory.openSession();
const customers = await session
  .query<Customer>({ collection: 'customers' })
  .include('addressIds') // Pre-loads addresses in the same round trip
  .whereEquals('locationId', locationId)
  .all();

// Then load the addresses (already cached from include)
for (const customer of customers) {
  const addresses = await session.load<Address>(customer.addressIds);
}

// ❌ Bad — N+1 queries (one per customer)
using session = this._sessionFactory.openSession();
const customers = await session
  .query<Customer>({ collection: 'customers' })
  .whereEquals('locationId', locationId)
  .all();

for (const customer of customers) {
  // Separate query for each customer
  const addresses = await session.load<Address>(customer.addressIds);
}
```

### Select Only Needed Fields

```typescript
// ✅ Good — select only required properties
using session = this._sessionFactory.openSession();
const customers = await session
  .query<Customer>({ collection: 'customers' })
  .selectFields<Pick<Customer, 'id' | 'firstName' | 'lastName'>>(
    ['id', 'firstName', 'lastName']
  )
  .whereEquals('locationId', locationId)
  .all();

// ❌ Bad — loads entire document when only name is needed
const customers = await session
  .query<Customer>({ collection: 'customers' })
  .whereEquals('locationId', locationId)
  .all();
```

---
### Always Order Paginated Queries

```typescript
// ✅ Good — stable ordering
using session = this._sessionFactory.openSession();

const query = session
  .query<Customer>({ collection: 'customers' })
  .whereEquals('locationId', locationId)
  .orderBy('id');

const items = await query
  .skip((page - 1) * limit)
  .take(limit)
  .all();

const stats = await query.count();

// ❌ Bad — unordered pagination gives inconsistent results
using session = this._sessionFactory.openSession();
const items = await session
  .query<Customer>({ collection: 'customers' })
  .skip((page - 1) * limit)
  .take(limit)
  .all();
```

Databases don't guarantee row order without explicit ordering. Unordered pagination causes records to appear on multiple pages or be skipped entirely.

Reference: `apps/astra-apis/src/common/QUERY_LIMIT_PROTECTION.md` for pagination patterns.

### Filter and Sort at the Database Level — Never In-Memory

**Never** load a full collection and then filter or sort the results in JavaScript. Push all filtering, sorting, and searching into the RavenDB query.

```typescript
// ❌ Bad — unbounded fetch + in-memory filter + in-memory sort
public async findAll(query: LaborStatusListQueryDto): Promise<LaborStatusListResponseDto[]> {
  using session = this._sessionFactory.openSession();

  const all: LaborStatus[] = await session
    .query<LaborStatus>({collection: 'labor-statuses'})
    .all(); // loads EVERY document — catastrophic on large collections

  let active = all.filter((s) => !s.isDeleted);              // in-memory filter
  if (query.searchTerm) {
    active = active.filter((s) => s.code.includes(query.searchTerm)); // in-memory search
  }
  active.sort((a, b) => a.code.localeCompare(b.code));        // in-memory sort

  return toLaborStatusListResponseDtoList(active);
}

// ✅ Good — all filtering and sorting at the DB level
public async findAll(query: LaborStatusListQueryDto): Promise<LaborStatusListResponseDto[]> {
  using session = this._sessionFactory.openSession();

  let q = session
    .query<LaborStatus>({collection: 'labor-statuses'})
    .whereEquals('isDeleted', false);

  if (query.searchTerm?.trim()) {
    q = q.search('query', `${query.searchTerm.trim()}*`); // full-text via static index
  }

  const results = await q.orderBy('code').all();
  return toLaborStatusListResponseDtoList(results);
}
```

**Rules:**
- `.whereEquals('isDeleted', false)` — filter deleted records in the query, not in JS
- `.search('query', term)` — use a static index with a `query` full-text field instead of `.includes()`
- `.orderBy('code')` — sort in the query, not with `.sort()`
- If you need full-text search, define a static index with a combined `query` field (see Static Indexes section)

**Why this matters:** Loading all documents and filtering in JS is a hidden time-bomb. It works fine in development with 20 seed records but degrades to seconds (or OOM crashes) when collections grow to thousands of real records.

### Use firstOrNull() When Fetching a Single Document by Query

When you only need the first match from a query, use `.firstOrNull()` instead of `.take(1).all()`. Both hit the server with the same `take=1` limit — `.firstOrNull()` just removes the manual array extraction and expresses the intent clearly.

```typescript
// ❌ Bad — take(1) + all() returns a list; you then manually extract element 0
const results = await session
  .query<CustomerUnit>({collection: 'customer-units'})
  .whereEquals('customerId', customerId)
  .whereEquals('isDeleted', false)
  .take(1)
  .all();
return results[0] ?? null;

// ✅ Good — firstOrNull() executes take(1) internally and returns T | null directly
const result = await session
  .query<CustomerUnit>({collection: 'customer-units'})
  .whereEquals('customerId', customerId)
  .whereEquals('isDeleted', false)
  .firstOrNull();
return result;
```

**When to use `session.load(id)` instead:** If the document ID is known (e.g. `customer-units/LOC_HQ-UNIT001`), always prefer `session.load<T>(id)` — it is a direct key-value lookup (O(1)) that bypasses the index entirely and never returns stale results. Reserve `.query().firstOrNull()` for field-based lookups where only the field values, not the ID, are known.

### Use Static Indexes for Complex Queries

- Define static indexes in `apps/astra-apis/src/common/database/indexes/`
- Complex map-reduce operations
- JOIN condition columns
- Frequently queried / WHERE clause fields

---
### Repository Pattern

```typescript
@Injectable()
export class CustomerDbRepository implements ICustomerRepository {
  constructor(
    @Inject(RAVEN_SESSION_FACTORY)
    private readonly _sessionFactory: IRavenSessionFactory,
  ) {}

  public async findById(id: string): Promise<Customer | null> {
    using session = this._sessionFactory.openSession();
    return await session.load<Customer>(id);
  }

  public async searchCustomers(criteria: ISearchCriteria): Promise<Customer[]> {
    using session = this._sessionFactory.openSession();
    
    let query = session
      .query<Customer>({ collection: 'customers' })
      .whereEquals('locationId', criteria.locationId);

    if (criteria.searchTerm) {
      query = query.search('firstName', `${criteria.searchTerm}*`)
        .orElse()
        .search('lastName', `${criteria.searchTerm}*`);
    }

    return await query.all();
  }
}
```
---
### Data Seeding Patterns

RavenDB uses code-based seeding (no SQL migrations). Seed files are in `database/seeds/`. After writing a seed file, register it in `apps/astra-apis/src/admin/admin-seed.service.ts` — see [package-scripts-reference.md](../../docs/scripts/package-scripts-reference.md#ravendb-seeding) for local vs Azure/ACA seeding.

```typescript
import { createIdsBaseEntity } from '@ids/data-models';

export const seedCustomers = async (
  sessionFactory: IRavenSessionFactory,
  userId: string
): Promise<void> => {
  using session = sessionFactory.openSession();

  const customer: Customer = {
    ...createIdsBaseEntity(userId),
    id: 'customers/LOC_HQ-CUST001',
    firstName: 'John',
    lastName: 'Doe',
    locationId: 'locations/LOC_HQ',
    email: 'john@example.com',
    active: true,
  };

  await session.store(customer, customer.id);
  await session.saveChanges();
};
```

**Key points:**
- Use semantic IDs (`customers/LOC_HQ-CUST001`)
- Use `createIdsBaseEntity()` for audit fields
- Store with explicit ID via `session.store(entity, id)`
- Call `saveChanges()` to persist

---

## Dependency Injection

### Module Organization

```typescript
@Module({
  imports: [RavendbModule],
  controllers: [CustomerController],
  providers: [
    CustomerService,
    CustomerDbRepository,
    { provide: CUSTOMER_REPO, useClass: CustomerDbRepository },
  ],
  exports: [CustomerService],
})
export class CustomerModule {}
```

### Service Injection

```typescript
@Injectable()
export class CustomerService {
  constructor(
    @Inject(CUSTOMER_REPO)
    private readonly _customerRepository: ICustomerRepository,
    private readonly _addressService: AddressService,
  ) {}
}
```

---

## Controller Patterns

### REST API Design

```typescript
@Controller('customers')
@ApiTags('customers')
export class CustomerController {
  constructor(private readonly _customerService: CustomerService) {}

  @Get()
  public async findAll(@Query() query: CustomerSearchDto): Promise<CustomerResponseDto[]> {
    return this._customerService.findAll(query);
  }

  @Get(':id')
  public async findOne(@Param('id') id: string): Promise<CustomerResponseDto> {
    return this._customerService.findOne(id);
  }

  @Post()
  public async create(@Body() dto: CreateCustomerDto): Promise<CustomerResponseDto> {
    return this._customerService.create(dto);
  }

  @Put(':id')
  public async update(@Param('id') id: string, @Body() dto: UpdateCustomerDto): Promise<CustomerResponseDto> {
    return this._customerService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async remove(@Param('id') id: string): Promise<void> {
    return this._customerService.remove(id);
  }
}
```

---

## DTO Patterns

### Validation with class-validator

```typescript
import { IsString, IsEmail, IsOptional, MaxLength, IsNotEmpty } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  lastName: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
```

### API Contract Rules — Explicit Nullable Response

- Controllers accept DTOs and return DTOs only — never return RavenDB entities from controllers
- **Response DTOs use explicit `null`, never `undefined`** — every field must be present in the response, as either a value or `null`. API consumers must never see a key silently missing.
- For string normalization use `value?.trim()`

**This rule is especially critical with RavenDB.** Unlike SQL, RavenDB documents are schema-less — a field added after a document was created is simply absent on old documents. Without `?? null` in mappers, the same endpoint returns different JSON shapes depending on when a document was created.

```typescript
// ❌ Bad — optional fields silently disappear from old documents
export function toCustomerDto(entity: Customer): CustomerResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    displayName: entity.displayName,   // undefined on old docs → key missing in JSON
    notes: entity.notes,               // undefined on old docs → key missing in JSON
  };
}

// ✅ Good — every field always present; consumers can rely on the contract
export function toCustomerDto(entity: Customer): CustomerResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    displayName: entity.displayName ?? null,   // always present, null when absent
    notes: entity.notes ?? null,               // always present, null when absent
  };
}
```

**Mapper rule:** Always use `?? null` on optional entity fields in the mapper. Never use `?? undefined` on the response side — `undefined` serialises as a missing key in JSON.

### Partial Update (PATCH) — Three-Way Field Semantics

Partial update DTOs use three-way semantics for optional fields:

| Payload value | Meaning | Service action |
|---|---|---|
| Key absent (`undefined`) | Field not included — don't touch | Skip — no change |
| `null` | Explicitly clear this field | Set to `undefined` on entity (RavenDB omits it) |
| `value` | Update with new value | Apply the value |

**Required fields** (e.g. `description`, `status`) reject `null` via DTO validation — they always need a value.

```typescript
// ✅ Correct — three-way partial update pattern
// `!== undefined` guards "was this in the payload?"
// `?? undefined` converts null → clear (RavenDB omits the field)
if (dto.comments !== undefined) {
  part.comments = dto.comments ?? undefined;
}

// ✅ Required field — null not allowed, DTO validator rejects it
if (dto.description !== undefined) {
  part.description = dto.description;
}

// ✅ Fields needing transformation — check null explicitly before transform
if (dto.listPrice !== undefined) {
  part.listPrice = dto.listPrice !== null ? toMoney(dto.listPrice, 'USD') : undefined;
}

// ❌ Wrong — !dto.field treats "", 0, false as "not provided"
if (!dto.shippingWeight) { /* skips valid 0 value */ }

// ❌ Wrong — misses the "clear" intent when null is sent
if (dto.comments) { part.comments = dto.comments; }
```

**Response side:** The mapper always returns explicit `null` for cleared/absent optional fields (e.g. `part.comments ?? null`). API consumers never see missing keys — every field is present as either a value or `null`.

---
### Mapping Standard (`.mapper.ts` Pattern)

Every entity → DTO transformation lives in a dedicated `<entity>.mapper.ts` file. No exceptions.

```typescript
// customer.mapper.ts — Naming: toDto (single), toDtoList (array), toPagedDto (paged)
export function toCustomerDto(entity: Customer): CustomerResponseDto {
  const displayName = entity.displayName?.trim();
  return {
    id: entity.id,
    name: entity.name,
    displayName: displayName?.length ? displayName : null,
  };
}
```

**Rules:**
- **Mapping happens in the service layer.** Controllers call the service and return its result — they never invoke mappers.
- **One `.mapper.ts` file per entity.** Keeps the entity ↔ DTO contract testable and reusable across endpoints.
- **Projection doesn't bypass the mapper.** When a service uses `selectFields()` for performance, the projected query output must match the DTO shape defined in the mapping file. The mapper is the contract the projection adheres to — it is not skipped.

```typescript
// ✅ Correct — query projection matches the mapper-defined DTO shape
const customers = await session
  .query<Customer>({ collection: 'customers' })
  .whereEquals('locationId', locationId)
  .selectFields<CustomerResponseDto>(['id', 'firstName', 'lastName', 'displayName'])
  .all();
return customers; // already DTO-shaped; mapper contract holds

// ❌ Incorrect — ad-hoc shape invented at the query site, no mapping file reference
const customers = await session
  .query<Customer>({ collection: 'customers' })
  .whereEquals('locationId', locationId)
  .selectFields(['id', 'firstName']) // shape drifts from the DTO contract
  .all();
```

---

## Guards and Interceptors

```typescript
@Injectable()
export class AuthGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    return !!request.user;
  }
}

@Controller('customers')
@UseGuards(AuthGuard)
export class CustomerController { ... }
```

---

## Testing (Vitest)

### Test Principles

- Test behavior, not implementation details
- Descriptive test names that explain expected behavior
- Follow AAA pattern: Arrange, Act, Assert
- Mock external dependencies at system boundaries only
- Test error paths, not just happy paths
- Place all test files inside a dedicated `__test__` folder within the module directory (e.g., `src/user/__test__/user.service.test.ts`)

### Service Unit Tests

```typescript
describe('CustomerService', () => {
  let service: CustomerService;
  let mockRepository: Mocked<ICustomerRepository>;

  beforeEach(async () => {
    mockRepository = {
      findById: vi.fn(),
      findByLocation: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as Mocked<ICustomerRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerService,
        { provide: CUSTOMER_REPO, useValue: mockRepository },
      ],
    }).compile();

    service = module.get<CustomerService>(CustomerService);
  });

  it('should find all customers', async () => {
    const mockCustomers: Customer[] = [{ id: 'customers/1', firstName: 'John', /* ... */ }];
    mockRepository.findByLocation.mockResolvedValue(mockCustomers);

    const result = await service.findAll('locations/LOC_HQ');

    expect(result).toEqual(mockCustomers);
    expect(mockRepository.findByLocation).toHaveBeenCalledWith('locations/LOC_HQ');
  });
});
```
---
### Controller Tests

```typescript
describe('CustomerController', () => {
  let controller: CustomerController;
  let service: CustomerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerController],
      providers: [{ provide: CustomerService, useValue: { findAll: vi.fn(), findOne: vi.fn() } }],
    }).compile();

    controller = module.get<CustomerController>(CustomerController);
    service = module.get<CustomerService>(CustomerService);
  });

  it('should return all customers', async () => {
    const mockCustomers = [{ id: '1', firstName: 'John' }];
    vi.spyOn(service, 'findAll').mockResolvedValue(mockCustomers);

    expect(await controller.findAll({})).toEqual(mockCustomers);
  });
});
```

### Integration Tests

- Test API endpoints with realistic scenarios
- Verify database interactions end-to-end
- Test error handling paths
- See `docs/standards/e2e-testing-best-practices.md

---

> These standards are living documents. Propose changes via pull request with rationale.
