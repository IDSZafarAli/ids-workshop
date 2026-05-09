---
name: react-hook-form
description: React Hook Form v7 patterns for building performant forms with MUI, Valibot validation, useFieldArray, and React Router integration. Use when creating or modifying forms, adding validation, working with Controller/useController, or handling form submission via clientAction.
license: MIT
---

# React Hook Form

React Hook Form manages form state with minimal re-renders using uncontrolled inputs and subscription-based updates. This project uses RHF for complex forms (Parts) while simpler forms (Locations, Users) use plain `useState`.

## Project-Specific Context

- **Validation**: Valibot with `valibotResolver` (not Zod) — schemas in `partSchema.ts`
- **UI library**: Material UI — all fields use `Controller` or `useController`
- **Form structure**: `FormProvider` + `useFormContext` for multi-section forms
- **Submission**: RHF `handleSubmit` → `useSubmit` → React Router `clientAction`
- **Default values**: Pre-built from server data via `buildDefaultValues()` mapper
- **Dynamic fields**: `useFieldArray` for bins and vendors with primary-item logic
- **Custom inputs**: `MoneyField` and `DecimalField` use `useController` for locale-aware formatting
- **Unsaved changes**: `isDirty` from `formState` feeds into `useUnsavedChangesGuard`

## When to Apply

- Creating or modifying form components
- Adding field validation (Valibot schemas)
- Integrating MUI components with Controller
- Working with dynamic field arrays (bins, vendors)
- Building custom form inputs (money, decimal, date)
- Handling form submission through React Router
- Optimizing form performance (re-renders, subscriptions)

## References

| Reference                          | Use When                                                  |
| ---------------------------------- | --------------------------------------------------------- |
| `references/form-setup.md`        | Configuring useForm, defaultValues, validation mode       |
| `references/mui-integration.md`   | Wrapping MUI components with Controller/useController     |
| `references/validation.md`        | Valibot schemas, cross-field validation, resolver caching |
| `references/field-arrays.md`      | Dynamic lists (bins, vendors), append/remove/update       |
| `references/submission.md`        | handleSubmit → useSubmit → clientAction flow              |
| `references/performance.md`       | watch vs useWatch, formState proxy, re-render isolation   |

## Critical Patterns

### Dialog Form Reset — key prop vs reset()

Dialogs that edit existing data must initialise form state from props **without `useEffect`**.

**Option A — `key` prop (preferred for simple dialogs):** Forces a full remount with fresh `defaultValues` each time the dialog opens. Zero extra code.

```tsx
// ✅ key prop remounts the form with correct defaultValues — no useEffect needed
<EditDialog
  key={editRow?.id ?? 'new'}
  open={open}
  defaultValues={editRow ? mapToFormValues(editRow) : emptyDefaults}
/>

function EditDialog({ open, defaultValues }: Props) {
  const methods = useForm({ defaultValues });
  // form is always in sync — no init effect required
}
```

**Option B — `reset()` in open handler (when remounting is too expensive):** Call `reset()` from the parent's open handler, not inside a `useEffect`.

```tsx
// ✅ reset() called in the open handler, not in useEffect
function useEditDialog() {
  const methods = useForm({ defaultValues: emptyDefaults });

  const open = useCallback((row: Row) => {
    methods.reset(mapToFormValues(row));
    setOpen(true);
  }, [methods]);

  return { methods, open };
}
```

**What NOT to do:**

```tsx
// ❌ useEffect to sync props → state — this is the pattern to eliminate
useEffect(() => {
  if (open && !prevOpen && isEdit && editRow) {
    setJobNumber(editRow.jobNumber ?? '');
    setDescription(editRow.description ?? '');
    // ... 10 more setX() calls
  }
}, [open, prevOpen, isEdit, editRow]);
```

The `useEffect` form init pattern also implies the form uses `useState` for every field — which means the entire form should be migrated to RHF.

### Dirty state — use `useFormDirtyNotifier`

Every form that accepts an `onDirtyChange` prop (for navigation guards) must use the shared hook instead of an inline `useEffect`:

```tsx
import {useFormDirtyNotifier} from 'core/hooks/useFormDirtyNotifier';

// ✅ one line — hook encapsulates the useRef + useEffect pattern correctly
const {isDirty} = methods.formState;
useFormDirtyNotifier(isDirty, onDirtyChange);

// ❌ never inline — the ref trick is easy to get wrong and duplicated across files
const onDirtyChangeRef = useRef(onDirtyChange);
onDirtyChangeRef.current = onDirtyChange;
useEffect(() => { onDirtyChangeRef.current?.(isDirty); }, [isDirty]);

// ❌ also wrong — onDirtyChange in the dep array causes the effect to re-run on every parent render
useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);
```

The hook is needed because the parent page passes `isDirty` to `useUnsavedChangesGuard` and `useLocationChangePrompt`. Without it those guards always see `false` and silently stop blocking navigation.

### FormProvider for Multi-Section Forms

```tsx
const methods = useForm({
  resolver: valibotResolver(partCreateSchema),
  defaultValues: buildDefaultValues(initialData, options),
});

<FormProvider {...methods}>
  <PartIdentitySection />
  <PricingSection />
  <VendorSection />
</FormProvider>
```

### MUI TextField with Controller

```tsx
<Controller
  name="description"
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

### Hidden Submit Button Pattern

```tsx
// Form exposes a hidden button; page-level Save triggers it
<button
  id="part-form-submit"
  type="button"
  onClick={methods.handleSubmit(handleFormSubmit)}
  style={{display: 'none'}}
/>

// Page component clicks it
document.getElementById('part-form-submit')?.click();
```

## Further Documentation

https://react-hook-form.com/docs
