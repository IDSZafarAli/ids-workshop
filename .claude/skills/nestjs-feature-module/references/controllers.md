---
title: Controllers
description: Thin controllers that return ResponseDto types — auth context, route shape, swagger docs, and the no-mapping rule
tags: [controller, ResponseDto, Auth, swagger, route]
---

# Controllers

Controllers are HTTP boundary adapters. They parse params, validate the request shape via class-validator, attach auth context, call the service, and return its DTO.

## Anatomy

```typescript
import {Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post} from '@nestjs/common';
import {ApiBearerAuth, ApiOperation, ApiResponse, ApiTags} from '@nestjs/swagger';
import {Auth} from '../auth/auth.decorator';
import {AuthInfo} from '../auth/auth-utils';
import {CustomerCreateDto, CustomerCreateResponseDto} from './dto/customer-create.dto';
import {CustomerService} from './customer.service';

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomerController {
  public constructor(private readonly _customerService: CustomerService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({summary: 'Create customer'})
  @ApiResponse({status: 201, type: CustomerCreateResponseDto})
  @ApiResponse({status: 409, description: 'Customer already exists'})
  public async create(
    @Body() dto: CustomerCreateDto,
    @Auth() auth: AuthInfo,
  ): Promise<CustomerCreateResponseDto> {
    return this._customerService.create(dto, auth.sub);
  }
}
```

## Rules

1. **Inject the service via constructor with `_` prefix.** `_customerService` because it's a private member.
2. **Always declare access modifiers explicitly.** `public async create(...)` — never bare `async create(...)`.
3. **Return type is always a DTO.** Never `Customer`, never `Promise<unknown>`. The exact `*ResponseDto` from `./dto/...`.
4. **No mapping in the controller.** The service returns the DTO. Controllers don't transform entities.
5. **No business logic in the controller.** No validation beyond what `class-validator` does on the DTO. No queries. Pass-through.
6. **Auth via `@Auth()`.** The decorator extracts `AuthInfo` ({ sub, organizationId, … }). Pass `auth.sub` as the userId to the service.

## Forbidden in Controllers

```typescript
// ❌ Loading documents in the controller
const customer = await this._sessionFactory.openSession().load(...);

// ❌ Mapping inline
return { customerNo: customer.customerNo, name: customer.firstName + ' ' + customer.lastName };

// ❌ Returning entities
public async findOne(@Param('id') id: string): Promise<Customer> { ... }

// ❌ Hand-crafting error JSON
@Get(':id')
public async findOne(@Param('id') id: string, @Res() res: Response): Promise<void> {
  if (!customer) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(customer);
}
```

The right form for the last anti-pattern: `throw new NotFoundException(...)`. The global `ProblemDetailsFilter` shapes it into RFC 9457 JSON.

## HTTP Status Codes

| Method  | Default | Override When                             |
| ------- | ------- | ----------------------------------------- |
| `@Post` | `201`   | Async/queued operation → `@HttpCode(202)` |
| `@Patch`, `@Put` | `200` | Returning no content → `@HttpCode(204)` |
| `@Delete` | `200` | Returning no content → `@HttpCode(204)` |
| `@Get`  | `200`   | —                                         |

Use `@HttpCode(HttpStatus.CREATED)` explicitly on `@Post` even though it's the default — it documents intent and Swagger picks it up.

## Multipart / File Uploads

```typescript
@Post(':id/photos')
@UseInterceptors(FileFieldsInterceptor([{name: 'photos', maxCount: 10}], OPTIONS))
@ApiConsumes('multipart/form-data')
public async uploadPhotos(
  @Param('id') id: string,
  @UploadedFiles() files: {photos?: Express.Multer.File[]},
  @Body('payload') payloadJson: string,
  @Auth() auth: AuthInfo,
): Promise<PhotoUploadResponseDto> {
  // Parse and validate the JSON payload manually since multipart bypasses class-validator
  const parsed = JSON.parse(payloadJson);
  const dto = plainToInstance(PhotoUploadDto, parsed);
  const errors = await validate(dto);
  if (errors.length > 0) {
    throw new BadRequestException(formatValidationErrors(errors));
  }

  return this._photoService.upload(id, dto, files.photos ?? [], auth.sub);
}
```

Multipart bypasses Nest's automatic class-validator pipeline because the JSON arrives in a string field. Manual parse + validate is required at the controller boundary. See `docs/standards/file-upload-standards.md`.

## Streaming Responses

For attachments and binary downloads:

```typescript
@Get(':id/photos/:photoId')
@HttpCode(HttpStatus.OK)
public async getPhoto(
  @Param('id') id: string,
  @Param('photoId') photoId: string,
  @Res({passthrough: true}) res: Response,
): Promise<StreamableFile> {
  const result = await this._photoService.getPhoto(id, photoId);
  res.set({
    'Content-Type': result.contentType,
    'Content-Disposition': `inline; filename="${result.filename}"`,
  });
  return new StreamableFile(result.stream);
}
```

`@Res({passthrough: true})` lets you set headers without taking over the response — Nest still applies its return-value pipeline.

## Swagger Annotations

```typescript
@ApiOperation({summary: 'Update customer', description: 'Partial update.'})
@ApiResponse({status: 200, type: CustomerUpdateResponseDto})
@ApiResponse({status: 404, description: 'Customer not found'})
@ApiResponse({status: 409, description: 'Email already used by another customer'})
```

The `type:` field is critical — it's how the OpenAPI generator gets the response shape. DTO classes (with class-validator decorators) carry this metadata; bare `type` aliases don't.
