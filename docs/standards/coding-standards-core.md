---
marp: true
theme: ids-training-marp-theme
header: 'Coding Standards Core'
paginate: true
footer: '&copy; 2026 - Integrated Dealer Systems'
---
# Coding Standards — Core (TypeScript & Database)

Applies to all code in this monorepo — both backend and frontend.  
For layer-specific rules see [coding-standards-backend.md](coding-standards-backend.md) and [coding-standards-frontend.md](coding-standards-frontend.md).

---

## General Principles

1. **Consistency** — Code must be consistent across the entire codebase
2. **Readability** — Code must be easy to read and understand
3. **Maintainability** — Code must be easy to modify, extend and test
4. **Type Safety** — Leverage TypeScript's strict type system for maximum safety
5. **Performance** — Write performant code, especially in hot paths

---

## TypeScript Standards

### Strict Mode

- `strict: true` is enabled in `tsconfig.base.json` and must not be overridden
- Never use `any` — implicit or explicit
- When the type is genuinely unknown, use `unknown` (forces type checking before use)
- Ensure each code statement ends with  **Semi-Colon (;)**

---

### Types vs Interfaces

- Use `type` for data shapes, DTOs, and utility types — `type Customer = {...}`
- Use `interface` only for contracts/capabilities that a class will implement

```typescript
// ✅ Correct — type for data, interface for class contract
type Customer = { id: string; firstName: string };
interface CustomerRepository { findById(id: string): Promise<Customer | null>; }
```

> **Interface prefix conventions differ by layer.** Backend uses the `I` prefix (`ICustomerRepository`); frontend uses plain PascalCase (`CustomerFilters`). See the respective layer standards for the rule that applies to your code.
---

### Naming Conventions

Use the **singular** form of a name rather than plural. For example `WorkOrder` and `WorkOrderList`, not `WorkOrders`.

| Construct | Convention | Example |
|---|---|---|
| Classes | PascalCase | `CustomerService`, `CustomerEntity` |
| Types | PascalCase | `Customer`, `CreateCustomerDto` |
| Interfaces | PascalCase *(prefix convention is layer-specific)* | see backend / frontend standards |
| Functions / Methods | camelCase | `findAll`, `handleCustomerClick` |
| Private methods | camelCase — **no `_` prefix** | `executeRequest`, `handleResponse` |
| Constants | UPPER_SNAKE_CASE | `MAX_PAGE_SIZE` |
| Variables | camelCase | `customerId`, `searchTerm` |

> **File naming is layer-specific.** Backend uses kebab-case (`customer-service.ts`); frontend follows React convention — PascalCase for `.tsx` component files, camelCase for hooks and other `.ts` files. See backend / frontend standards for details.

> **Private methods**: TypeScript's `private` keyword is the access modifier — no underscore prefix needed or allowed.
> ```typescript
> // ✅ Correct
> private executeRequest(): void {}
> private handleResponse<T>(): T {}
>
> // ❌ Incorrect — underscore prefix is a pre-TypeScript JavaScript convention
> private _executeRequest(): void {}
> private _handleResponse<T>(): T {}
> ```

---

### Control Structures

**Always use braces `{}` for all control structures** — `if`, `for`, `foreach`, `while` — even single-line bodies.

```typescript
// ✅ Correct
if (condition) {
  doSomething();
} else {
  doSomethingElse();
}

// ❌ Incorrect
if (condition)
  doSomething();
```

---

### Import Paths

**Always import directly from the source file. Never use barrel exports (`index.ts` re-export files).**

```typescript
// ✅ Correct
import { CustomerService } from '../customer/customer.service';
import { Customer } from '../customer/entities/customer.entity';

// ❌ Incorrect — importing from a directory (barrel)
import { CustomerService } from '../customer';
import { Customer } from '../customer/entities';
```

**Never create files like this:**
```typescript
// ❌ Don't create: customer/index.ts
export { CustomerService } from './customer.service';
export { Customer } from './entities/customer.entity';
```

**Why:**
- Avoids circular dependency issues common in NestJS
- Better tree-shaking and faster TypeScript compilation
- Clearer dependency graph — IDE navigates directly to source

**Exception:** `@ids/data-models` (`libs/shared/data-models/src/index.ts`) intentionally exposes a named public API barrel — import from there as normal.

---

## Database Naming Conventions


---

### Column Names

- Use **snake_case**
- Standard suffixes: `_id` (foreign keys), `_at` or `_date` (timestamps), `is_` (booleans)
- Examples: `customer_id`, `first_name`, `created_date`, `is_deleted`

### RavenDB Entity Mapping

RavenDB entities are **plain TypeScript classes** with no decorators. They extend `IdsBaseEntity` to inherit standard audit fields (`id`, `createdDate`, `updatedDate`, `createdBy`, `updatedBy`, `version`, `isDeleted`). TypeScript properties use **camelCase** (TypeScript convention). Document IDs follow the pattern `{collection}/{identifier}`.

```typescript
// ✅ RavenDB entity — class extending IdsBaseEntity, no decorators
import { IdsBaseEntity } from '../../common/entities/ids-base.entity';

export class Customer extends IdsBaseEntity {
  public id!: string; // Document ID: "customers/LOC_HQ-CUST001"
  public firstName!: string;
  public lastName!: string;
  public locationId!: string;
  public email!: string;
  public active!: boolean;
}

// ✅ Creating entity instances — use createIdsBaseEntity() for audit fields
import { createIdsBaseEntity } from '@ids/data-models';

const newCustomer: Customer = {
  ...createIdsBaseEntity('userId123'),
  id: 'customers/LOC_HQ-CUST001',
  firstName: 'John',
  lastName: 'Doe',
  locationId: 'locations/LOC_HQ',
  email: 'john@example.com',
  active: true,
};
```
---

### RavenDB Indexes

RavenDB uses **static indexes** defined as TypeScript classes. Indexes are map-reduce operations that pre-compute query results.

```typescript
// Static index example
import { AbstractJavaScriptIndexCreationTask } from 'ravendb';

export class Customers_ByLocation extends AbstractJavaScriptIndexCreationTask {
  constructor() {
    super();
    this.map('customers', (customer) => ({
      locationId: customer.locationId,
      email: customer.email,
      active: customer.active,
    }));
  }
}

// Using the index in a query
using session = documentStore.openSession();
const customers = await session
  .query({ indexName: 'Customers/ByLocation' })
  .whereEquals('locationId', 'locations/LOC_HQ')
  .whereEquals('active', true)
  .all();
```
---

**Index naming patterns:**
- Collection indexes: `{Collection}_By{Field(s)}` — e.g., `Customers_ByLocation`, `Parts_ByLocationAndVendor`
- Multi-collection: `{Concept}_By{Field(s)}` — e.g., `Inventory_ByLocation`

---

### Quick Reference

| Context | Convention | Example |
|---|---|---|
| Collection names | kebab-case, plural | `customers`, `work-orders`, `part-locations` |
| Document IDs | `{collection}/{identifier}` | `customers/LOC_HQ-CUST001`, `locations/LOC_HQ` |
| Entity properties | camelCase | `firstName`, `locationId`, `createdAt` |
| Indexes | `{Collection}_By{Field(s)}` | `Customers_ByLocation`, `Parts_ByVendor` |
| Foreign references | camelCase with `Id` suffix | `locationId`, `vendorId`, `customerId` |

### Best Practices

1. **Use camelCase for all entity properties** — consistent with TypeScript conventions
2. **Document IDs are strings** — always follow `{collection}/{identifier}` pattern
3. **Indexes are explicit** — define static indexes for frequently queried fields
4. **Load references explicitly** — use `session.load()` or includes in queries to fetch related documents
5. **Multi-tenancy via locationId** — every entity must have `locationId` (except global entities like Location itself)

---

## Documentation Standards

### Code Comments

- Use JSDoc for public APIs
- Explain **why**, not **what** — the code explains what; comments explain intent and trade-offs
- Keep comments up to date with code changes
- Use `// TODO:` comments sparingly and always include a ticket reference

### README Files

- Every package should have a README
- Include: purpose, setup instructions, and examples
- Keep documentation close to the code it describes

---

> These standards are living documents. Propose changes via pull request with rationale.
