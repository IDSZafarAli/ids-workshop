---
title: Field Arrays
description: useFieldArray for dynamic lists — bins, vendors, append/remove with primary-item logic
tags: [useFieldArray, dynamic-fields, append, remove, update, bins, vendors]
---

# Field Arrays

`useFieldArray` manages dynamic lists within forms — bins and vendors in the Parts form.

## Basic Setup

```tsx
import { useFieldArray, useFormContext } from 'react-hook-form';

function VendorSection() {
  const { control, getValues } = useFormContext();
  const { fields, append, remove, update } = useFieldArray({
    control,
    name: 'vendors',
  });
  // ...
}
```

## Always Use field.id as React Key

Each field from `useFieldArray` gets a unique `id`. **Always** use it as the React key — never use the array index:

```tsx
// DO: field.id maintains state across reorder/remove
{fields.map((field, index) => (
  <TableRow key={field.id}>
    <Controller name={`vendors.${index}.vendorNumber`} control={control} render={...} />
    <Controller name={`vendors.${index}.cost`} control={control} render={...} />
  </TableRow>
))}

// DON'T: Index key causes state corruption on remove/reorder
{fields.map((field, index) => (
  <TableRow key={index}>
    ...
  </TableRow>
))}
```

**Why:** When you remove item at index 2, index-keyed items 3, 4, 5 all shift down — React reuses the wrong DOM nodes, causing form values to appear in wrong rows.

## Append with Complete Default Objects

Always provide every field when appending — partial objects cause validation and state bugs:

```tsx
// DO: Complete object with all fields
const addVendor = (option: VendorOption) => {
  append({
    key: `${option.vendorNumber}-${Date.now()}`,
    vendorNumber: option.vendorNumber,
    vendorName: option.name,
    cost: '',
    vendorPartNumber: '',
    isPrimary: fields.length === 0, // First vendor is primary
  });
};

// DON'T: Partial object — missing fields are undefined
append({ vendorNumber: option.vendorNumber });
```

## Primary Item Management

Both bins and vendors have a "primary" concept — one item marked as main/primary. Handle the toggle and removal carefully:

### Setting Primary

```tsx
const setPrimaryVendor = (index: number) => {
  const currentVendors = getValues('vendors');
  currentVendors.forEach((vendor, i) => {
    if (vendor.isPrimary !== (i === index)) {
      update(i, { ...vendor, isPrimary: i === index });
    }
  });
};
```

### Removing with Primary Fallback

When the primary item is removed, auto-promote the first remaining item:

```tsx
const removeVendor = (index: number) => {
  const wasPrimary = fields[index].isPrimary;
  remove(index);

  // If removed item was primary, promote index 0
  if (wasPrimary && fields.length > 1) {
    update(0, { ...fields[0], isPrimary: true });
  }
};
```

### Bins Primary with setValue

Alternative pattern using `setValue` instead of `update`:

```tsx
const handleSetBinPrimary = (index: number) => {
  const bins = watch('bins');
  for (let i = 0; i < bins.length; i++) {
    setValue(`bins.${i}.isMain`, i === index, { shouldDirty: true });
  }
};

const handleRemoveBin = (index: number) => {
  const wasMain = bins[index]?.isMain;
  removeBin(index);
  if (wasMain && bins.length > 1) {
    setValue('bins.0.isMain', true, { shouldDirty: true });
  }
};
```

## Field Array with Controller

Each dynamic row field needs `Controller` with the indexed name:

```tsx
{fields.map((field, index) => (
  <TableRow key={field.id}>
    <TableCell>
      <Controller
        name={`vendors.${index}.cost`}
        control={control}
        render={({field: costField, fieldState}) => (
          <TextField
            {...costField}
            error={!!fieldState.error}
            helperText={fieldState.error?.message}
            size="small"
          />
        )}
      />
    </TableCell>
    <TableCell>
      <IconButton onClick={() => remove(index)}>
        <DeleteIcon />
      </IconButton>
    </TableCell>
  </TableRow>
))}
```

## Watching Array Fields

Use `watch` to derive computed values from the array:

```tsx
const vendors = watch('vendors') ?? [];
const primaryVendor = vendors.find((v) => v.isPrimary);
const avgCostPreview = primaryVendor?.cost
  ? parseLocaleNumber(primaryVendor.cost, i18n.language)
  : 0;
```

## See Also

- [mui-integration.md](./mui-integration.md) — Controller patterns for MUI in rows
- [validation.md](./validation.md) — Vendor row schema with v.looseObject
