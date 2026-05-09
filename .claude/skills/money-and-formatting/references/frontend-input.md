---
title: Frontend Input
description: MoneyField, DecimalField, locale-aware parsing, RHF integration, and the form-state-as-string contract
tags: [MoneyField, DecimalField, parseLocaleNumber, useController, RHF, locale]
---

# Frontend Input

Numeric form state is stored as a **locale-formatted string** in RHF — `'1,234.56'` (en) or `'1 234,56'` (fr). At submit, `parseLocaleNumber(value, locale)` converts to a plain number that matches the wire format.

## MoneyField

```tsx
<MoneyField
  name="listPrice"
  label={t('part.listPrice')}
  decimals={2}
  currency="USD"
/>
```

`MoneyField` wraps a MUI `TextField` with `useController`. It:

- Formats on blur (`'2'` → `'2.00'`).
- Renders the currency symbol as a locale-aware adornment (`$` prefix in en-US, `€` suffix in fr-FR).
- Re-formats the displayed value when the active i18n language changes.
- Stores the value as a string in RHF state.

### Props

| Prop          | Default | Description                                          |
| ------------- | ------- | ---------------------------------------------------- |
| `name`        | —       | RHF field name                                       |
| `label`       | —       | Input label                                          |
| `decimals`    | `4`     | Fraction digits — `2` for prices, `4` for unit costs |
| `currency`    | none    | Renders the locale-aware currency adornment          |
| `inputAlign`  | `left`  | Text alignment inside the input                      |
| `disabled`    | `false` | Standard MUI                                         |
| `data-testid` | none    | E2E selector hook                                    |

## DecimalField

```tsx
<DecimalField
  name="quantity"
  label={t('part.quantity')}
  decimals={4}
/>
```

Same shape as `MoneyField` minus the currency adornment. Use for non-currency decimals: quantities, weights, dimensions, ratios.

## Why String, Not Number, in Form State

The intuitive choice — `useState<number>` or RHF `<input type="number">` — has three problems for a locale-aware app:

1. **`<input type="number">` accepts only `.` as the decimal separator** in most browsers, regardless of locale.
2. **A typed `number` can't represent the user's intermediate input**: `'12.'`, `'12.5'`, `'12.50'`, `'-'` (about to type a negative).
3. **Rounding on every keystroke breaks the UX** — typing `12.50` becomes `12.5` after each keystroke if state is a number.

So: state is a locale-formatted string, parsed only at submit.

## Reading at Submit — `parseLocaleNumber`

```typescript
import {parseLocaleNumber} from 'core/formatters/formatMoney';
import {useTranslation} from 'react-i18next';

const {i18n} = useTranslation();

const onSubmit = form.handleSubmit((values) => {
  const listPrice = parseLocaleNumber(values.listPrice, i18n.language);
  if (Number.isNaN(listPrice)) {
    form.setError('listPrice', {message: t('errors.notANumber')});
    return;
  }
  // listPrice is now a plain number — send to API
  mutation.mutate({...values, listPrice});
});
```

`parseLocaleNumber('1,234.56', 'en')` → `1234.56`. `parseLocaleNumber('1 234,56', 'fr')` → `1234.56`.

Always `Number.isNaN` check — empty string returns `NaN` rather than throwing. The standards validator flags `parseFloat()` in feature code; the locale-aware parser is the only correct path.

## Pre-filling Edit Forms

The opposite direction — server returns `12.99`, form needs to display `'12.99'` (en) or `'12,99'` (fr):

```typescript
import {useFormatNumber} from 'core/hooks/useFormatNumber';

const formatNumber = useFormatNumber({minimumFractionDigits: 2, maximumFractionDigits: 2});

const defaultValues = {
  listPrice: part.listPrice != null ? formatNumber(part.listPrice) : '',
  // ...
};

const form = useForm({defaultValues});
```

`formatNumber(12.99)` returns the locale-formatted string with the requested precision. Pass that to `defaultValues`; `MoneyField` renders it.

## Locale Switch Mid-Edit

`MoneyField` listens to `i18n.language` and re-formats its stored value when the language changes:

```typescript
// MoneyField internally
useEffect(() => {
  const prevLang = prevLangRef.current;
  prevLangRef.current = i18n.language;
  if (prevLang === i18n.language) return;

  const val = String(fieldRef.current.value ?? '').trim();
  if (!val) return;

  const num = parseLocaleNumber(val, prevLang);     // parse with the OLD locale
  if (!Number.isNaN(num)) {
    fieldRef.current.onChange(formatDecRef.current(num));   // format with the NEW locale
  }
}, [i18n.language]);
```

Users mid-edit don't lose their input when they switch language — `'1,234.56'` becomes `'1 234,56'` automatically.

## RHF Integration — Why `useController` Internally

`MoneyField` uses `useController({name, control})` from RHF. This means the parent form must wrap the field in `FormProvider`:

```tsx
const form = useForm<PartFormValues>({defaultValues});

return (
  <FormProvider {...form}>
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <MoneyField name="listPrice" label={t('listPrice')} decimals={2} currency="USD" />
      <DecimalField name="quantity" label={t('quantity')} decimals={4} />
      <Button type="submit">{t('save')}</Button>
    </form>
  </FormProvider>
);
```

The hook reads `control` from `useFormContext()` — no explicit prop drilling needed.

## Validation

```typescript
import {object, string, pipe, transform, number, minValue} from 'valibot';

const schema = object({
  listPrice: pipe(
    string(),
    transform((v, ctx) => {
      const num = parseLocaleNumber(v, ctx.locale ?? 'en');
      return Number.isNaN(num) ? null : num;
    }),
    number('Must be a number'),
    minValue(0, 'Must be ≥ 0'),
  ),
});
```

The schema parses the string into a number, then applies number validators. Or apply validation in the `onSubmit` handler after `parseLocaleNumber` — simpler for one-off cases.

## Anti-Patterns

```typescript
// ❌ parseFloat instead of parseLocaleNumber
const value = parseFloat(formValue);
//   Breaks for fr-FR users: parseFloat('1 234,56') → 1

// ❌ Direct <input type="number">
<input type="number" {...register('price')} />
//   Won't accept fr-FR decimal `,`; breaks integration

// ❌ Format on each keystroke
onChange={(e) => setValue(formatNumber(parseFloat(e.target.value)))}
//   '12.5' becomes '12.50' mid-typing; users can't type incrementally

// ❌ Number state in RHF
const form = useForm<{price: number}>(...);
//   Loses intermediate states ('12.', '-'); needs string + parse-on-submit

// ❌ Manual symbol concat
<TextField label="Price" InputProps={{startAdornment: '$'}} />
//   Wrong locale: fr-FR puts the symbol after, with a space.
//   Use MoneyField with currency='USD' — adornment is locale-aware.

// ❌ toLocaleString in feature code
const display = value.toLocaleString();
//   Doesn't read i18n.language. Use useFormatNumber/useFormatCurrency.
```

## Component Reference

- `apps/client-web/app/components/MoneyField.tsx` — the canonical implementation.
- `apps/client-web/app/components/DecimalField.tsx` — non-currency variant.
- `apps/client-web/app/pages/parts/components/MoneyFieldWithDollar.tsx` — example of feature-specific composition.
