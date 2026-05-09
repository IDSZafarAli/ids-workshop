---
title: Validation Errors
description: BadRequestException with field-level errors — class-validator integration, the field-message parser, and manual field error construction
tags: [BadRequestException, validation, errors, ProblemFieldError, class-validator]
---

# Validation Errors

A 400 with `urn:ids:error:validation` carries an `errors[]` array — one entry per field. The frontend uses these to surface errors in form fields. The shape is consistent regardless of where the validation happened.

## The Wire Shape

```typescript
type ProblemFieldError = {
  field: string;     // 'firstName', 'address.line1', 'vendors.0.vendorId'
  message: string;   // 'should not be empty', 'must be a valid email'
};

type ProblemDetailDto = {
  type: 'urn:ids:error:validation';
  status: 400;
  // ...
  errors: ProblemFieldError[];
};
```

## Source 1: class-validator (Automatic)

When the DTO fails class-validator validation, NestJS throws `BadRequestException` with `message: string[]`. The filter parses each string into a `ProblemFieldError`.

```typescript
// DTO
export class CustomerCreateDto {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsEmail()
  email!: string;
}

// Wire response when client sends `{ firstName: '', email: 'not-an-email' }`:
{
  "type": "urn:ids:error:validation",
  "status": 400,
  "detail": "firstName should not be empty; email must be an email",
  "errors": [
    { "field": "firstName", "message": "should not be empty" },
    { "field": "email", "message": "must be an email" }
  ]
}
```

The class-validator default message format is `<fieldName> <constraint>` — the filter splits on the first space.

### Custom Validation Messages

```typescript
@IsString({message: 'firstName is required'})
firstName!: string;

@IsEmail({}, {message: 'email must be a valid email address'})
email!: string;
```

The first token is still the field name. Don't write `Email is invalid` — that becomes `field='Email', message='is invalid'` (capitalized field name, broken contract).

### Nested Field Paths

```typescript
@ValidateNested({each: true})
@Type(() => AddressDto)
addresses!: AddressDto[];
```

class-validator emits `addresses.0.line1 should not be empty` for nested array failures. The filter parses these into `field: 'addresses.0.line1'`. Frontend forms can target the same path with React Hook Form's dotted field names.

## Source 2: Cross-Field Service Validation

For invariants that class-validator can't express, throw `BadRequestException` from the service. To surface as a field error, follow the same `<field> <message>` shape:

```typescript
// ✅ Field-level — parsed into errors[]
throw new BadRequestException('endDate must be on or after startDate');

// Wire:
// "errors": [{ "field": "endDate", "message": "must be on or after startDate" }]
```

For form-wide errors (no specific field), the parser falls back to `field: '_form'`:

```typescript
throw new BadRequestException('At least one address must be provided');
// → errors: [{ field: '_form', message: 'At least one address must be provided' }]
```

## Source 3: Multi-Error Service Validation

Pass an array to throw multiple field errors at once:

```typescript
const errors: string[] = [];
if (dto.startDate > dto.endDate) {
  errors.push('endDate must be on or after startDate');
}
if (dto.shippingAddressSameAsBilling === false && !dto.shippingAddress) {
  errors.push('shippingAddress is required when shippingAddressSameAsBilling is false');
}
if (errors.length > 0) {
  throw new BadRequestException(errors);
}
```

Same field-message convention; the filter parses each string.

## Source 4: Manual Multipart Validation

Multipart endpoints bypass the automatic class-validator pipeline (the JSON arrives as a string field). Manual validation must produce the same shape:

```typescript
import {plainToInstance} from 'class-transformer';
import {ValidationError, validate} from 'class-validator';

@Post(':id/photos')
@UseInterceptors(FileFieldsInterceptor([{name: 'photos', maxCount: 10}]))
public async upload(
  @Param('id') id: string,
  @Body('payload') payloadJson: string,
  @UploadedFiles() files: {photos?: Express.Multer.File[]},
): Promise<...> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    throw new BadRequestException('payload is not valid JSON');
  }

  const dto = plainToInstance(PhotoUploadDto, parsed);
  const validationErrors = await validate(dto);
  if (validationErrors.length > 0) {
    throw new BadRequestException(formatValidationErrors(validationErrors));
  }

  return this._service.upload(id, dto, files.photos ?? []);
}

function formatValidationErrors(errors: ValidationError[], prefix = ''): string[] {
  return errors.flatMap((err) => {
    const path = prefix ? `${prefix}.${err.property}` : err.property;
    const own = err.constraints
      ? Object.values(err.constraints).map((msg) => msg)
      : [];
    const nested = err.children
      ? formatValidationErrors(err.children, path)
      : [];
    return [...own, ...nested];
  });
}
```

The `formatValidationErrors` helper preserves field paths so the wire shape matches automatic validation.

## Frontend Surfacing

```typescript
import {ProblemDetailError} from 'core/services/apiClient';

try {
  await mutate(dto);
} catch (err) {
  if (err instanceof ProblemDetailError && err.problem.type === 'urn:ids:error:validation') {
    for (const fieldErr of err.problem.errors ?? []) {
      if (fieldErr.field === '_form') {
        setFormError(fieldErr.message);
      } else {
        form.setError(fieldErr.field as Path<FormValues>, {
          type: 'server',
          message: fieldErr.message,
        });
      }
    }
    return;
  }
  // ... handle other URN types
}
```

React Hook Form's `setError` accepts dotted paths (`addresses.0.line1`) — the field paths from the backend land directly.

## Anti-Patterns

```typescript
// ❌ Building the errors array manually and returning it as a body
return { errors: [...] };  // bypasses the filter, wrong content-type

// ❌ Using a non-field-style message and expecting `errors[]` to populate
throw new BadRequestException('Validation failed');
// → errors: [{ field: '_form', message: 'Validation failed' }] — works but unhelpful

// ❌ Throwing a generic Error
throw new Error('email already exists');  // becomes 500 internal — wrong status

// ❌ Capitalizing the field token
throw new BadRequestException('Email is required');  // field becomes 'Email' — won't bind to form
```
