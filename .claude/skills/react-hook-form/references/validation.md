---
title: Validation
description: Valibot schema validation, cross-field rules, resolver caching, and error display
tags: [validation, valibot, resolver, schema, cross-field, errors]
---

# Validation

This project uses **Valibot** (not Zod) with `@hookform/resolvers/valibot` for form validation.

## Schema Definition

### Define Schemas at Module Level (Critical)

Schemas MUST be defined outside the component. Defining inside causes recreation every render, bypassing resolver caching:

```tsx
// DO: Module-level schema — created once, cached by resolver
export const partCreateSchema = v.pipe(
  v.object({
    partNumber: v.pipe(v.string(), v.minLength(1, 'Part ID is required.')),
    description: v.pipe(v.string(), v.minLength(1, 'Description is required.')),
    vendors: v.pipe(v.array(vendorRowSchema), v.minLength(1, 'At least one vendor is required.')),
    listPrice: v.optional(numericString),
  }),
  // cross-field validations...
);

// DON'T: Schema inside component — recreated every render
function PartForm() {
  const schema = v.object({ ... }); // Re-created on every render!
  const methods = useForm({ resolver: valibotResolver(schema) });
}
```

### Separate Create vs Update Schemas

Use distinct schemas when validation rules differ between modes:

```tsx
// partSchema.ts
export const partCreateSchema = v.pipe(
  v.object({
    partNumber: v.pipe(v.string(), v.minLength(1, 'Part ID is required.')),
    description: v.pipe(v.string(), v.minLength(1, 'Description is required.')),
    // ...
  }),
  ...crossFieldValidations,
);

export const partUpdateSchema = v.pipe(
  v.object({
    description: v.pipe(v.string(), v.minLength(1, 'Description is required.')),
    // partNumber not validated — read-only in edit mode
    // ...
  }),
  ...crossFieldValidations,
);

// In form component
const methods = useForm({
  resolver: valibotResolver(isEdit ? partUpdateSchema : partCreateSchema),
  defaultValues: buildDefaultValues(initialData, options),
});
```

## Cross-Field Validation

Use `v.forward()` to validate fields that depend on each other:

```tsx
export const partCreateSchema = v.pipe(
  v.object({
    shippingWeight: v.optional(v.string()),
    shippingUnit: v.optional(v.any()),
    minQty: v.optional(numericString),
    maxQty: v.optional(numericString),
  }),

  // Shipping unit required when weight is entered
  v.forward(
    v.check(
      ({ shippingWeight, shippingUnit }) => {
        const hasWeight = shippingWeight !== undefined && shippingWeight.trim() !== '';
        return !hasWeight || shippingUnit != null;
      },
      'Shipping unit is required when weight is entered.',
    ),
    ['shippingUnit'], // Error attaches to this field
  ),

  // Max Qty >= Min Qty
  v.forward(
    v.check(
      ({ minQty, maxQty }) => {
        const min = parseMoneyInput(minQty ?? '');
        const max = parseMoneyInput(maxQty ?? '');
        return max >= min;
      },
      'Max Qty must be greater than or equal to Min Qty.',
    ),
    ['maxQty'],
  ),
);
```

**Key pattern:** `v.forward()` routes the error to a specific field so it appears as that field's `helperText`, not as a form-level error.

## Custom Validation Pipes

For reusable field-level validation (e.g., numeric strings):

```tsx
const numericString = v.pipe(
  v.string(),
  v.check(
    (val) => val.trim() === '' || !Number.isNaN(parseMoneyInput(val)),
    'Must be a valid number.',
  ),
);

// Reuse across fields
const schema = v.object({
  listPrice: v.optional(numericString),
  salePrice: v.optional(numericString),
  weight: v.optional(numericString),
});
```

## Vendor Row Validation

For nested objects in field arrays, use `v.looseObject` to allow extra fields (like `key`):

```tsx
const vendorRowSchema = v.looseObject({
  vendorNumber: v.string(),
  vendorPartNumber: v.optional(v.string()),
  cost: v.optional(v.string()),
});
```

## Error Display

### Validation Summary (Top of Form)

Show a summary banner after failed submission:

```tsx
function ValidationSummary() {
  const { formState: { errors, isSubmitted } } = useFormContext();

  if (!isSubmitted || Object.keys(errors).length === 0) return null;

  const errorFields = Object.keys(errors)
    .map((key) => fieldLabels[key] ?? key)
    .join(', ');

  return (
    <Alert severity="error">
      Validation errors in: {errorFields}
    </Alert>
  );
}
```

### Field-Level Errors

Every Controller displays its own error via `fieldState`:

```tsx
<Controller
  name="partNumber"
  control={control}
  render={({field, fieldState}) => (
    <TextField
      {...field}
      error={!!fieldState.error}
      helperText={fieldState.error?.message}
    />
  )}
/>
```

### Server Errors (Post-Submission)

Errors from `clientAction` are separate from RHF validation:

```tsx
const actionData = useActionData<typeof clientAction>();

{actionData?.error && (
  <Alert severity="error">{actionData.error}</Alert>
)}
```

## See Also

- [form-setup.md](./form-setup.md) — Resolver configuration in useForm
- [submission.md](./submission.md) — How validated data reaches the server
