---
title: Form Setup
description: useForm configuration — mode, defaultValues, resolver, and initialization patterns
tags: [useForm, defaultValues, resolver, mode, configuration]
---

# Form Setup

## useForm Configuration

```tsx
import { useForm, FormProvider } from 'react-hook-form';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { partCreateSchema } from '../validation/partSchema';

const methods = useForm({
  resolver: valibotResolver(isEdit ? partUpdateSchema : partCreateSchema),
  defaultValues: buildDefaultValues(initialData, options),
});
```

### Configuration Options We Use

| Option | Value | Why |
|---|---|---|
| `mode` | `'onSubmit'` (default) | Validates only on submit — no re-renders on every keystroke |
| `reValidateMode` | `'onChange'` (default) | After first submit failure, revalidates as user corrects errors |
| `defaultValues` | `buildDefaultValues(...)` | Always provide — enables `reset()` and prevents undefined state |
| `resolver` | `valibotResolver(schema)` | External validation with Valibot schemas |

### Validation Mode Choice

**Always use `onSubmit` (default).** Other modes cause unnecessary re-renders:

```tsx
// DO: Default onSubmit mode — validates only when user submits
const methods = useForm({ resolver: valibotResolver(schema) });

// DON'T: onChange validates every keystroke — O(n) re-renders per field
const methods = useForm({ mode: 'onChange', resolver: valibotResolver(schema) });
```

Only use `onBlur` or `onChange` if the UX specifically requires real-time feedback (e.g., username availability check).

## Always Provide defaultValues

Omitting `defaultValues` causes undefined state bugs and breaks `reset()`. Always supply a complete object:

```tsx
// DO: Complete defaults — enables reset() and prevents undefined
const methods = useForm({
  defaultValues: buildDefaultValues(initialData, options),
});

// DON'T: No defaults — fields start as undefined, reset() breaks
const methods = useForm({
  resolver: valibotResolver(schema),
});
```

### buildDefaultValues Pattern

Map server data to form-friendly values in a dedicated mapper:

```tsx
// partFormMapper.ts
export function buildDefaultValues(
  initialData?: PartDetail,
  options?: FormOptionLookups,
): PartFormValues {
  if (!initialData) {
    return {
      ...EMPTY_DEFAULTS,
      status: findOption(options?.statusCodeOptions, 'active'),
      sellUom: findOption(options?.uomOptions, 'EA'),
    };
  }

  return {
    partNumber: initialData.partNumber,
    description: initialData.description,
    listPrice: initialData.listPrice
      ? formatDec4(moneyToDisplay(initialData.listPrice))
      : '',
    vendors: (initialData.vendors ?? []).map((v, i) => ({
      key: `init-${i}-${v.vendorNumber}`,
      vendorNumber: v.vendorNumber,
      vendorName: v.vendorName,
      cost: v.cost ? moneyToDisplay(v.cost).toFixed(4) : '',
      isPrimary: v.isPrimary,
    })),
  };
}
```

**Rules:**
- Empty strings for text fields, not `undefined`
- Resolve dropdown codes to full option objects (for Autocomplete)
- Convert Money amounts from cents to display format
- Add `key` fields for useFieldArray items
- Avoid complex objects (Moment, Luxon) — use plain objects and primitives

## useEffect Dependency Trap

Never put the `useForm` return object in a dependency array — it's unstable and causes infinite loops:

```tsx
// DON'T: methods changes every render → infinite loop
const methods = useForm({ defaultValues });
useEffect(() => {
  methods.reset(serverData);
}, [methods, serverData]);

// DO: Destructure stable references
const { reset } = useForm({ defaultValues });
useEffect(() => {
  reset(serverData);
}, [reset, serverData]);
```

RHF's destructured methods (`reset`, `setValue`, `getValues`, `trigger`) are stable references. The top-level `methods` object is not.

## FormProvider for Multi-Section Forms

When a form has multiple child components that need form access:

```tsx
export function PartForm({ initialData, options, mode }: Props) {
  const methods = useForm({
    resolver: valibotResolver(mode === 'edit' ? partUpdateSchema : partCreateSchema),
    defaultValues: buildDefaultValues(initialData, options),
  });

  return (
    <FormProvider {...methods}>
      <ValidationSummary />
      <PartIdentitySection />
      <PricingSection />
      <VendorSection />
    </FormProvider>
  );
}

// Child components access form via context
function PartIdentitySection() {
  const { control, watch, setValue } = useFormContext();
  // ...
}
```

**When to use FormProvider:** Components 2+ levels deep or shared across forms.
**When to pass props instead:** Shallow (1 level) parent-child where explicit props are clearer.

## See Also

- [validation.md](./validation.md) — Valibot schema patterns
- [mui-integration.md](./mui-integration.md) — Controller for MUI components
