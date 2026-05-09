---
name: problem-details-errors
description: RFC 9457 Problem Details error contract — which NestJS exception maps to which URN, the global filter, validation field errors, and how the frontend consumes problem+json. Use when throwing or handling errors anywhere in apps/astra-apis or when client-web parses an error response.
license: MIT
---

# Problem Details (RFC 9457)

Every API error in this project responds with `application/problem+json` per RFC 9457. The shape is identical for every endpoint — clients can parse one schema for all errors.

## Project-Specific Context

- The global filter is `apps/astra-apis/src/common/filters/problem-details.filter.ts` (registered in `app.module.ts`).
- The shared DTO contract is `ProblemDetailDto` in `@ids/data-models` — both backend and frontend import it.
- Stable URN catalog: `PROBLEM_URN_TYPE` enum (`urn:ids:error:validation`, `…:not-found`, etc.).
- **You never hand-craft an error response.** Throw a NestJS exception; the filter shapes it.

## When to Apply

- Throwing exceptions in services, controllers, guards, or interceptors.
- Designing the validation error shape for a new endpoint.
- Parsing an error response in the frontend (`apiClient` already does most of this).
- Adding a new error class that needs a non-default URN.

## References

| Reference                            | Use When                                                       |
| ------------------------------------ | -------------------------------------------------------------- |
| `references/exceptions.md`           | Picking the right NestJS exception for a situation             |
| `references/validation-errors.md`    | Field-level errors via `BadRequestException` and the parser    |
| `references/frontend-handling.md`    | Parsing `problem+json` on the React side, surfacing to the UI  |

## The Wire Shape

```typescript
type ProblemDetailDto = {
  type: string;          // 'urn:ids:error:not-found'
  title: string;         // 'Not Found'
  status: number;        // 404
  detail?: string;       // 'Customer ABC-123 not found'
  instance?: string;     // '/api/customers/ABC-123'
  location?: string | null;
  userId?: string | null;
  requestId?: string;
  correlationId?: string;
  traceId?: string;
  timestamp?: string;
  errors?: ProblemFieldError[];   // populated for 400 validation failures
};

type ProblemFieldError = { field: string; message: string };
```

## Critical Patterns

### Throw an Exception — Don't Build JSON

```typescript
// ✅ Correct
const customer = await session.load<Customer>(`customers/${id}`);
if (!customer || customer.isDeleted) {
  throw new NotFoundException(`Customer ${id} not found`);
}

// ❌ Wrong — bypasses the global filter and produces inconsistent shape
@Get(':id')
public async findOne(@Param('id') id: string, @Res() res: Response): Promise<void> {
  if (!customer) {
    res.status(404).json({error: 'Customer not found', code: 'NOT_FOUND'});
    return;
  }
  res.json(customer);
}
```

### Standard URN Mapping

| HTTP | NestJS exception          | URN type                              |
| ---- | ------------------------- | ------------------------------------- |
| 400  | `BadRequestException`     | `urn:ids:error:validation`            |
| 401  | `UnauthorizedException`   | `urn:ids:error:unauthorized`          |
| 403  | `ForbiddenException`      | `urn:ids:error:forbidden`             |
| 404  | `NotFoundException`       | `urn:ids:error:not-found`             |
| 409  | `ConflictException`       | `urn:ids:error:conflict`              |
| 429  | `HttpException(..., 429)` | `urn:ids:error:too-many-requests`     |
| 500  | (uncaught)                | `urn:ids:error:internal`              |
| 503  | `ServiceUnavailableException` | `urn:ids:error:service-unavailable` |

The filter looks at the HTTP status, picks the URN, and writes it to `type`. No code-side configuration needed for the standard mappings.

### Field-Level Validation Errors

```typescript
// Service-level cross-field check
if (dto.shippingAddressSameAsBilling === false && !dto.shippingAddress) {
  throw new BadRequestException('shippingAddress is required when shippingAddressSameAsBilling is false');
}
```

The filter parses each message using a `field rest-of-message` regex. Class-validator messages already match this shape (`firstName must be a string`); `errors[]` is populated automatically on `BadRequestException`. See `validation-errors.md` for the format details.

### Frontend — Parse Once at the Boundary

```typescript
// apiClient already detects content-type 'application/problem+json' and throws ProblemDetailError
try {
  await apiClient.post('/customers', dto);
} catch (err) {
  if (err instanceof ProblemDetailError) {
    if (err.problem.type === 'urn:ids:error:validation') {
      surfaceFieldErrors(err.problem.errors ?? []);
    } else {
      showSnackbar(err.problem.detail ?? err.problem.title);
    }
  }
}
```

Switch on `type` (the URN), not `status` — URNs are stable across HTTP refactors.

## Further Documentation

- RFC 9457: https://datatracker.ietf.org/doc/html/rfc9457
- Project doc: `docs/standards/api-problem-details.md`
- NestJS exceptions: https://docs.nestjs.com/exception-filters#built-in-http-exceptions
