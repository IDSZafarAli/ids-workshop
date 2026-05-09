---
title: MUI Integration
description: Wrapping Material UI components with Controller and useController for React Hook Form
tags: [Controller, useController, MUI, TextField, Autocomplete, controlled-components]
---

# MUI Integration

MUI components are controlled by design — they require `value` and `onChange` props. Use `Controller` or `useController` to bridge RHF with MUI.

## Controller for Standard Fields

### MUI TextField

```tsx
<Controller
  name="description"
  control={control}
  render={({field, fieldState}) => (
    <TextField
      {...field}
      label="Description"
      error={!!fieldState.error}
      helperText={fieldState.error?.message}
      fullWidth
    />
  )}
/>
```

**Pattern:** Spread `{...field}` onto TextField — it provides `value`, `onChange`, `onBlur`, `name`, and `ref`.

### MUI Autocomplete (Dropdowns)

Autocomplete needs special handling — its `onChange` signature differs from standard inputs:

```tsx
<Controller
  name="status"
  control={control}
  render={({field, fieldState}) => (
    <Autocomplete
      options={statusOptions}
      getOptionLabel={(opt) => opt.description}
      isOptionEqualToValue={(opt, val) => opt.code === val.code}
      value={field.value ?? null}
      onChange={(_, value) => field.onChange(value)}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Status"
          error={!!fieldState.error}
          helperText={fieldState.error?.message}
        />
      )}
    />
  )}
/>
```

**Key differences from TextField:**
- Don't spread `{...field}` — Autocomplete has a different API
- `value={field.value ?? null}` — Autocomplete requires `null` for empty, not `undefined`
- `onChange={(_, value) => field.onChange(value)}` — Extract the value from Autocomplete's `(event, value)` callback
- Always provide `isOptionEqualToValue` — prevents "value not in options" warnings

### MUI Checkbox

```tsx
<Controller
  name="bypassPriceUpdate"
  control={control}
  render={({field}) => (
    <FormControlLabel
      control={
        <Checkbox
          checked={!!field.value}
          onChange={(e) => field.onChange(e.target.checked)}
        />
      }
      label="Bypass Price Update"
    />
  )}
/>
```

## useController for Custom Inputs

Use `useController` (instead of `Controller`) when building reusable form field components. It isolates re-renders to just that component:

```tsx
// MoneyField.tsx — re-renders only when its own value changes
export function MoneyField({ name, label, decimals = 4, disabled }: MoneyFieldProps) {
  const { control } = useFormContext();
  const { field, fieldState } = useController({ name, control });
  const { i18n } = useTranslation();
  const formatDec = useFormatNumber({
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <TextField
      value={field.value ?? ''}
      onChange={field.onChange}
      onBlur={() => {
        // Format number on blur for locale-aware display
        const num = parseLocaleNumber(String(field.value ?? ''), i18n.language);
        if (!Number.isNaN(num)) {
          field.onChange(formatDec(num));
        }
        field.onBlur();
      }}
      error={!!fieldState.error}
      helperText={fieldState.error?.message}
      label={label}
      disabled={disabled}
      slotProps={{
        htmlInput: {
          onWheel: (e) => e.currentTarget.blur(), // Prevent scroll changing numbers
        },
      }}
    />
  );
}
```

### When to Use useController vs Controller

| Use | When |
|---|---|
| `Controller` (render prop) | Inline fields in form sections — quick, no extra component |
| `useController` (hook) | Reusable field components (MoneyField, DecimalField) — isolates re-renders |

### Re-render Isolation Benefit

With `Controller` inline, the parent re-renders when any field changes. With `useController` in a dedicated component, only that component re-renders:

```tsx
// INLINE: Parent re-renders for every field change
function PricingSection() {
  const { control } = useFormContext();
  return (
    <>
      <Controller name="listPrice" control={control} render={...} />
      <Controller name="salePrice" control={control} render={...} />
    </>
  );
}

// ISOLATED: Each MoneyField re-renders independently
function PricingSection() {
  return (
    <>
      <MoneyField name="listPrice" label="List Price" />
      <MoneyField name="salePrice" label="Sale Price" />
    </>
  );
}
```

For simple forms, inline `Controller` is fine. For forms with 10+ fields (like Parts), prefer dedicated components with `useController`.

## Value Transformation at Controller Level

When form values need type coercion (string ↔ number, locale formatting), handle it in the Controller — not in the schema or submission handler:

```tsx
<Controller
  name="quantity"
  control={control}
  render={({field}) => (
    <TextField
      value={field.value ?? ''}
      onChange={(e) => {
        // Keep as string in form state — transform on submission
        field.onChange(e.target.value);
      }}
      onBlur={() => {
        // Format on blur
        const num = parseFloat(field.value);
        if (!Number.isNaN(num)) {
          field.onChange(num.toFixed(2));
        }
        field.onBlur();
      }}
    />
  )}
/>
```

**Our pattern:** Store formatted strings in form state, convert to numbers in `transformToApiPayload()` at submission time.

## See Also

- [form-setup.md](./form-setup.md) — FormProvider for multi-section forms
- [performance.md](./performance.md) — Re-render optimization with useController
