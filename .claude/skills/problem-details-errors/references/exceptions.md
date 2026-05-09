---
title: Exceptions
description: Picking the right NestJS exception per situation, the URN catalog, custom exceptions, and what the filter does with the message
tags: [exception, NotFoundException, BadRequestException, ConflictException, URN]
---

# Exceptions

The filter inspects the thrown exception, derives an HTTP status, picks a URN from the status table, and writes a `ProblemDetailDto`. Choose the exception class for the situation; the filter handles the rest.

## Standard Exceptions

```typescript
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
```

### NotFoundException — 404

For missing documents, expired sessions, deleted soft-records.

```typescript
const part = await session.load<Part>(`parts/${partNumber}`);
if (!part || part.isDeleted) {
  throw new NotFoundException(`Part ${partNumber} not found`);
}
```

The message becomes `detail` in the response. Be specific — the message ships to the client.

### BadRequestException — 400

For validation failures (cross-field rules, semantic invariants beyond what class-validator catches).

```typescript
if (dto.endDate && dto.startDate && new Date(dto.endDate) < new Date(dto.startDate)) {
  throw new BadRequestException('endDate must be on or after startDate');
}
```

For field-level errors, use the `field rest-of-message` shape so the filter parses an `errors[]` entry — see `validation-errors.md`.

### ConflictException — 409

For duplicate-key violations, unique constraints, optimistic concurrency failures.

```typescript
const existing = await session
  .query<Customer>({indexName: 'Customers/Search'})
  .whereEquals('locationId', locationId)
  .whereEquals('email', dto.email)
  .firstOrNull();

if (existing) {
  throw new ConflictException(`A customer with email ${dto.email} already exists`);
}
```

### UnauthorizedException — 401

For missing or invalid credentials. Usually thrown by `AccessTokenGuard`, not service code. If you need to throw it manually:

```typescript
if (!auth.sub) {
  throw new UnauthorizedException('Authentication required');
}
```

### ForbiddenException — 403

For authenticated-but-not-permitted. Usually thrown by guards/decorators (`@RequiresPermission(...)`); rare in service code.

```typescript
if (!auth.permissions?.includes('parts:write')) {
  throw new ForbiddenException('Permission "parts:write" required');
}
```

### ServiceUnavailableException — 503

For transient infrastructure failures (RavenDB unreachable, Logto cluster down). Usually thrown by infrastructure code; service-level code rarely needs this.

### HttpException — Custom Status

For statuses without a built-in class (429, 422, 451):

```typescript
throw new HttpException(
  'Too many login attempts — try again in 60 seconds',
  HttpStatus.TOO_MANY_REQUESTS,  // 429 → urn:ids:error:too-many-requests
);
```

## What the Filter Does With the Message

```typescript
const customer = exception.getResponse();
// string                           → detail = string
// { message: string }              → detail = message
// { message: string[] }            → detail = message.join('; '), errors = parsed (BadRequest only)
// { message: string, error: string} → detail = message, title = error
```

So:

```typescript
throw new NotFoundException('Customer ABC-123 not found');
// → { type: 'urn:ids:error:not-found', title: 'Not Found', status: 404, detail: 'Customer ABC-123 not found', ... }

throw new BadRequestException(['firstName should not be empty', 'email must be a valid email']);
// → {
//     type: 'urn:ids:error:validation',
//     title: 'Bad Request',
//     status: 400,
//     detail: 'firstName should not be empty; email must be a valid email',
//     errors: [
//       { field: 'firstName', message: 'should not be empty' },
//       { field: 'email', message: 'must be a valid email' },
//     ],
//   }
```

## Custom Domain URNs

The `PROBLEM_URN_TYPE` catalog covers generic HTTP error categories. For domain-specific errors that need their own identity in logs (Datadog, etc.), pass a `type` field directly in the exception constructor. The filter reads `type`, `title`, and `detail` from the response object and uses them instead of the status-derived defaults.

```typescript
// Domain-specific URN — filter uses it verbatim
throw new ForbiddenException({
  type: 'urn:ids:auth:no-locations',
  title: 'No locations assigned',
});

throw new NotFoundException({
  type: 'urn:ids:inventory:unit-not-found',
  title: 'Unit Not Found',
  detail: `Unit ${vin} does not exist at this location`,
});
```

URN naming convention: `urn:ids:{domain}:{specific-error}` — e.g. `urn:ids:auth:…`, `urn:ids:inventory:…`, `urn:ids:parts:…`

Use a custom URN whenever you need to distinguish this error from others sharing the same HTTP status code — this is the primary tool for observability filtering in logs.

**When to add to `@ids/data-models`:** only for truly shared URNs used across multiple modules. Single-module URNs stay as inline strings at the point of use.

## Custom Exception Classes

Define a custom class when:

1. Multiple call sites throw the same business error and you want a single source for the message.
2. The error needs structured data beyond `detail` (e.g., a list of conflicting IDs).

```typescript
export class DuplicatePartNumberException extends ConflictException {
  public constructor(partNumber: string, locationId: string) {
    super({
      type: 'urn:ids:parts:duplicate-part-number',
      title: 'Duplicate Part Number',
      detail: `Part ${partNumber} already exists at location ${locationId}`,
    });
  }
}
```

## Logging — The Filter Already Does It

```typescript
this._logger.error('handled_exception', {
  type: problem.type,
  status: problem.status,
  path: req.originalUrl,
  requestId: req.requestId,
  // ...
  error: this.serializeLogError(exception),
});
```

Don't `_logger.error()` before throwing — that creates a duplicate log entry per error. Just throw; the filter logs once with full context.

## Forbidden Patterns

```typescript
// ❌ Hand-crafted error JSON in a controller
return res.status(404).json({error: 'Not found'});

// ❌ Returning a typed error union (`{ ok: false, code: 'NOT_FOUND' }`)
//    breaks the consistent contract clients depend on

// ❌ Catching at the controller and rethrowing a generic Error
//    loses the status mapping — the filter falls back to 500

// ❌ Manually constructing a ProblemDetailDto and returning it
//    skip the filter — and lose location, userId, requestId, traceId
```

## Edge Case: Errors From Outside Nest

For errors raised in middleware, schedulers, or background jobs that **don't** route through the global filter (no Express request available), construct the log line yourself but still preserve the URN-style classification so logs are consistent. Use the `PROBLEM_URN_TYPE` constants from `@ids/data-models`.
