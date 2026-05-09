---
title: Form Submission
description: handleSubmit → useSubmit → clientAction flow, payload transformation, and success/error handling
tags: [submission, handleSubmit, useSubmit, clientAction, useActionData, transform]
---

# Form Submission

Forms follow a pipeline: RHF validates → transforms to API payload → React Router submits → clientAction calls API.

## Submission Flow

```
User clicks Save
  → handleSubmit(onValid) validates via Valibot resolver
  → onValid receives validated form data
  → transformToApiPayload() converts to API format
  → useSubmit() sends to React Router clientAction
  → clientAction calls API via apiClient
  → useActionData() returns success/error to component
```

## Step 1: handleSubmit + Transform

```tsx
const submit = useSubmit();

const handleFormSubmit = (data: Record<string, unknown>) => {
  const payload = transformToApiPayload(
    data as PartFormValues,
    mode,
    i18n.language,
  );
  submit(
    { payload: JSON.stringify(payload) },
    { method: 'post', encType: 'application/x-www-form-urlencoded' },
  );
};
```

### Payload Transformation

Convert form-friendly values (strings, option objects) to API-friendly values (numbers, codes):

```tsx
// partFormMapper.ts
export function transformToApiPayload(
  values: PartFormValues,
  mode: 'create' | 'edit',
  locale: string,
): PartCreateInput | PartUpdateInput {
  return {
    partNumber: values.partNumber,
    description: values.description,
    status: values.status?.code ?? 'active',
    listPrice: values.listPrice
      ? toMoney(parseLocaleNumber(values.listPrice, locale))
      : undefined,
    vendors: values.vendors.map((v) => ({
      vendorNumber: v.vendorNumber,
      cost: v.cost ? toMoney(parseLocaleNumber(v.cost, locale)) : undefined,
      isPrimary: v.isPrimary,
    })),
  };
}
```

**Key transformations:**
- Option objects → code strings (`values.status?.code`)
- Locale-formatted strings → Money objects (`toMoney(parseLocaleNumber(...))`)
- Empty strings → `undefined` (omit from payload)

## Step 2: clientAction

```tsx
export async function clientAction({ request, params, context }: ClientActionFunctionArgs) {
  const formData = await request.formData();
  const payload = JSON.parse(formData.get('payload') as string);

  const { locationToken, locationId } = context.get(RESOLVED_LOCATION_CONTEXT);

  try {
    const result = await partQueries.create(
      { ...payload, locationId },
      locationToken,
    );
    // Invalidate cache so list reflects new item
    await queryClient.invalidateQueries({
      queryKey: PART_QUERY_KEYS.all(locationId),
    });
    return { success: true, partNumber: result.partNumber };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
```

## Step 3: Handle Response

```tsx
const actionData = useActionData<typeof clientAction>();
const navigation = useNavigation();
const isSubmitting = navigation.state === 'submitting';

// Success: show alert then redirect
useEffect(() => {
  if (actionData?.success) {
    showSuccessAlert('Part created');
    navigate(`/parts/${actionData.partNumber}`);
  }
}, [actionData]);

// Error: show inline alert
{actionData?.error && (
  <Alert severity="error">{actionData.error}</Alert>
)}
```

## Hidden Submit Button Pattern

The form component exposes a hidden button. The page component (which owns the toolbar/Save button) triggers it:

```tsx
// PartForm.tsx — inside FormProvider
<button
  id="part-form-submit"
  type="button"
  onClick={methods.handleSubmit(handleFormSubmit)}
  disabled={isSubmitting}
  style={{ display: 'none' }}
/>

// PartCreate.tsx — page component
<Button
  onClick={() => document.getElementById('part-form-submit')?.click()}
  disabled={isSubmitting}
>
  Save
</Button>
```

**Why:** The Save button lives in the page toolbar (outside the form). The hidden button bridges the gap without lifting all form state to the page level.

## Unsaved Changes Guard

Track `isDirty` from formState and feed it to the navigation guard:

```tsx
// PartForm exposes dirty state
const { isDirty } = methods.formState;
useEffect(() => {
  onDirtyChange?.(isDirty);
}, [isDirty, onDirtyChange]);

// Page component uses guard
const [formDirty, setFormDirty] = useState(false);
const isDirty = formDirty && !actionData?.success && !isSubmitting;
const { showDialog, confirm, cancel } = useUnsavedChangesGuard(isDirty);
```

## See Also

- [form-setup.md](./form-setup.md) — useForm configuration
- [validation.md](./validation.md) — Validation before submission
