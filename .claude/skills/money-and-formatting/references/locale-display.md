---
title: Locale Display
description: useFormatCurrency, useFormatNumber, useFormatDate hooks plus DateDisplay — locale-aware rendering for every numeric and temporal value
tags: [useFormatCurrency, useFormatNumber, useFormatDate, DateDisplay, Intl, locale]
---

# Locale Display

Display formatting goes through hooks that read `i18n.language`. Never call `toLocaleString` or build `Intl.NumberFormat` instances directly in feature code — the hooks center locale handling and re-render correctly when the user switches language.

## useFormatCurrency

```tsx
const formatCurrency = useFormatCurrency({maximumFractionDigits: 2}, 'USD');

formatCurrency(1234.5);    // 'en' → '$1,234.50' | 'fr' → '1 234,50 $US'
formatCurrency(null);      // → '-'
formatCurrency(undefined); // → '-'
```

Signature: `useFormatCurrency(options?, currency = 'USD')`. The first arg is `Intl.NumberFormatOptions` minus `style` and `currency` (those are fixed). `null`/`undefined` returns `-`.

### Common Patterns

```tsx
// 2 decimal places (default for prices)
const fmt = useFormatCurrency({maximumFractionDigits: 2}, 'USD');

// 4 decimal places (unit costs)
const fmt = useFormatCurrency(
  {minimumFractionDigits: 4, maximumFractionDigits: 4},
  'USD',
);

// No decimals (whole-dollar summaries)
const fmt = useFormatCurrency({maximumFractionDigits: 0}, 'USD');

// Per-row currency (multi-currency report)
{rows.map((row) => {
  const fmt = useFormatCurrency({}, row.currency);   // ⚠️ hooks must be top-level — see below
  return <td>{fmt(row.amount / 100)}</td>;
})}
```

### Multi-Currency Row Lists

Hooks can't run in a loop. For multi-currency tables, build a memoized formatter map:

```tsx
const formatters = useMemo(() => {
  const lang = i18n.language;
  const set: Record<CurrencyCode, Intl.NumberFormat> = {} as never;
  for (const c of SUPPORTED_CURRENCIES) {
    set[c] = new Intl.NumberFormat(lang, {style: 'currency', currency: c});
  }
  return set;
}, [i18n.language]);

return rows.map((r) => <td>{formatters[r.currency].format(r.amount / 100)}</td>);
```

This is the **one** place where direct `Intl.NumberFormat` is fine — driven by `i18n.language`, memoized per-language switch.

## useFormatNumber

```tsx
const formatNumber = useFormatNumber();
formatNumber(1234.5);    // '1,234.5' (en) | '1 234,5' (fr)
formatNumber(null);      // '-'

const formatQty = useFormatNumber({maximumFractionDigits: 0});
formatQty(123.7);        // '124'

const formatWeight = useFormatNumber({minimumFractionDigits: 2, maximumFractionDigits: 2});
formatWeight(22);        // '22.00'
formatWeight(22.5);      // '22.50'

const formatCompact = useFormatNumber({notation: 'compact'});
formatCompact(1500000);  // '1.5M' (en) | '1,5 M' (fr)
```

When no options pass, `minimumFractionDigits` is **inferred from the value** — pass `22` get `'22'`, pass `22.5` get `'22.5'`. When you set either bound explicitly, you take full control.

## useFormatDate

```tsx
const formatDate = useFormatDate();
formatDate(part.updatedDate);   // '5/7/2026' (en-US) | '07/05/2026' (en-GB) | '07.05.2026' (de)

const formatLong = useFormatDate({dateStyle: 'long'});
formatLong('2026-05-07');       // 'May 7, 2026' (en) | '7 mai 2026' (fr)

const formatTime = useFormatDate({dateStyle: 'short', timeStyle: 'short'});
formatTime(workOrder.createdDate);  // '5/7/2026, 2:30 PM' (en)
```

Accepts an ISO-8601 string, a `Date`, or `null`/`undefined`. Returns `-` for nullish.

## ISO Strings in State, Not Date Objects

The project rule: **dates are stored in form state and entity fields as ISO 8601 strings, never `Date` objects**.

```typescript
// ✅ Correct
type FormValues = { promiseDate: string };          // '2026-05-07'
const formatDate = useFormatDate();
formatDate(values.promiseDate);

// ❌ Wrong — flagged by validator
type FormValues = { promiseDate: Date };
```

Why: `Date` objects don't survive RHF's reset path consistently, don't serialize cleanly, and force every `useEffect`/mutation observer that reads them to re-stabilize. ISO strings are stable, comparable, and cheap.

The `useFormatDate` hook accepts strings directly.

## DateDisplay Component

For declarative use without a hook:

```tsx
<DateDisplay value={part.updatedDate} />
<DateDisplay value={workOrder.promiseDate} format="long" />
<DateDisplay value={null} fallback="—" />
```

Internally uses `useFormatDate` — same locale awareness.

## Forbidden — Raw `toLocaleString` and `Intl` in Feature Code

```typescript
// ❌ Doesn't react to i18n.language; renders in browser-default locale
return <span>{value.toLocaleString()}</span>;

// ❌ Same problem; useFormatNumber wraps this
const fmt = new Intl.NumberFormat();
return <span>{fmt.format(value)}</span>;

// ❌ Hardcoded locale
return <span>{value.toLocaleString('en-US')}</span>;
//    fr-FR users see en-US formatting — accessibility / professionalism issue
```

The standards validator flags raw `toLocaleString` and `Intl.NumberFormat` calls in `apps/client-web/app/pages/`. The hooks (and the multi-currency exception above) are the only allowed paths.

## Building a Custom Formatter

For specialized formats, layer on `Intl` options inside a hook factory — don't reinvent:

```tsx
export function useFormatPercent() {
  const {i18n} = useTranslation();
  return useMemo(() => {
    const fmt = new Intl.NumberFormat(i18n.language, {style: 'percent', maximumFractionDigits: 2});
    return (value: number | null | undefined) =>
      value == null ? '-' : fmt.format(value);
  }, [i18n.language]);
}
```

Place the hook in `app/core/hooks/` so it's discoverable and testable.

## Money + Formatter Combo

```tsx
const formatCurrency = useFormatCurrency({maximumFractionDigits: 2}, 'USD');

<Typography>{formatCurrency(part.listPrice)}</Typography>
//   `part.listPrice` from API is already a decimal (mapper divided by 100)
```

The mapper already converted cents to decimal; the formatter takes the decimal and renders. Don't divide twice.

## Format Hook Reference

| Hook                | Returns                                           | Empty value |
| ------------------- | ------------------------------------------------- | ----------- |
| `useFormatCurrency` | `(value: number \| null \| undefined) => string`  | `'-'`       |
| `useFormatNumber`   | `(value: number \| null \| undefined) => string`  | `'-'`       |
| `useFormatDate`     | `(value: string \| Date \| null \| undefined) => string` | `'-'` |

All three re-create when `i18n.language` changes — components consuming them re-render automatically on locale switch.

## Locale Switch UX

When a user switches language mid-page:

- All `useFormat*` hook outputs re-render.
- `MoneyField` and `DecimalField` re-format their stored values (the previous-locale string is parsed and reformatted).
- React state isn't lost — the same numeric values render in the new locale.

Test the switch on any number-heavy page (Parts list, Work Order details) before shipping locale-sensitive features.
