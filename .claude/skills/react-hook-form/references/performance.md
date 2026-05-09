---
title: Performance
description: Re-render optimization — watch vs useWatch, formState proxy, useController isolation
tags: [performance, re-renders, watch, useWatch, formState, proxy, optimization]
---

# Performance

React Hook Form minimizes re-renders through uncontrolled inputs and proxy-based subscriptions. These patterns preserve that performance.

## watch() vs useWatch()

### The Problem with watch()

`watch()` triggers re-renders at the `useForm` hook level — the **entire form component** and all its children re-render when any watched field changes:

```tsx
// This re-renders PartForm + all child sections when ANY watched field changes
function PartForm() {
  const methods = useForm({ ... });
  const vendors = methods.watch('vendors');  // Triggers full re-render
  const status = methods.watch('status');    // Another full re-render source

  return (
    <FormProvider {...methods}>
      <PartIdentitySection />  {/* Re-renders even if unrelated */}
      <PricingSection />       {/* Re-renders even if unrelated */}
      <VendorSection />        {/* Re-renders even if unrelated */}
    </FormProvider>
  );
}
```

### The Solution: useWatch()

`useWatch` isolates re-renders to the component where it's called:

```tsx
// Only PricingSection re-renders when vendors change
function PricingSection() {
  const { control } = useFormContext();
  const vendors = useWatch({ control, name: 'vendors' }) ?? [];
  const primaryVendor = vendors.find((v) => v.isPrimary);
  const avgCost = primaryVendor?.cost ? parseLocaleNumber(primaryVendor.cost) : 0;

  return <Typography>Average Cost: {avgCost}</Typography>;
}
```

### When to Use Each

| Use | When |
|---|---|
| `useWatch` | Subscribing to values for derived state / conditional rendering |
| `watch` | Quick reads inside event handlers (no re-render concern) |
| `getValues` | One-time reads (no subscription, no re-render) |

```tsx
// useWatch: Subscribes — re-renders component when value changes
const status = useWatch({ control, name: 'status' });

// watch inside handler: No subscription overhead
const handleSave = () => {
  const currentStatus = watch('status'); // Read once, no subscription
};

// getValues: Snapshot read — no subscription, no re-render
const handleBlur = () => {
  const currentGl = getValues('glGroup');
  if (!currentGl) setValue('glGroup', defaultGl);
};
```

### Combining useWatch with getValues

`useWatch` subscription must be established before `setValue` fires. For safety, combine both:

```tsx
function useFormValues() {
  const { getValues } = useFormContext();
  return { ...useWatch(), ...getValues() };
}
```

## formState Proxy — Destructure Before Render

`formState` uses a Proxy that tracks which properties you access. Only destructure what you need — accessing the entire object subscribes to everything:

```tsx
// DO: Destructure specific properties — subscribe only to isDirty and errors
const { formState: { isDirty, errors } } = useFormContext();

// DON'T: Access formState as object — subscribes to ALL properties
const { formState } = useFormContext();
// formState.isDirty  // Now subscribed to everything
```

This applies to both `useForm` and `useFormContext`. The Proxy only triggers re-renders for properties you destructure.

### Common formState Properties

| Property | Re-render trigger | Use for |
|---|---|---|
| `isDirty` | Any field changes from default | Unsaved changes guard |
| `errors` | Validation errors change | Error display |
| `isSubmitted` | After first submit attempt | Show validation summary |
| `isSubmitting` | During async submission | Disable submit button |
| `dirtyFields` | Specific fields change | Partial update payloads |

## useController Isolation

`useController` in a dedicated component only re-renders that component when its specific field changes:

```tsx
// Isolated: Only MoneyField re-renders when listPrice changes
function MoneyField({ name, label }: Props) {
  const { control } = useFormContext();
  const { field, fieldState } = useController({ name, control });
  return <TextField {...field} error={!!fieldState.error} />;
}

// Not isolated: Inline Controller in parent — parent re-renders too
function PricingSection() {
  return (
    <Controller
      name="listPrice"
      render={({field}) => <TextField {...field} />}
    />
  );
}
```

**Impact:** For forms with 10+ fields, using `useController` in dedicated components reduces re-renders from O(n) to O(1) per field change.

## Anti-Patterns

```tsx
// DON'T: useForm return object in useEffect deps — infinite loop
const methods = useForm({ ... });
useEffect(() => { ... }, [methods]); // methods is unstable!

// DON'T: watch() entire form — re-renders on every field change
const allValues = watch(); // Subscribes to everything

// DON'T: formState without destructuring
const { formState } = useForm();
if (formState.isDirty) { ... } // Subscribed to ALL state

// DON'T: useCallback/useMemo wrapping watch — doesn't help
const memoized = useMemo(() => watch('field'), [watch]); // watch isn't stable
```

## See Also

- [mui-integration.md](./mui-integration.md) — useController for MUI components
- [form-setup.md](./form-setup.md) — FormProvider and useFormContext
