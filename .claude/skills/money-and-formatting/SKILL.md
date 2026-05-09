---
name: money-and-formatting
description: Money type and locale-aware formatting for IDS Cloud DMS — Money stored as integer cents, helpers for arithmetic (toMoney/addMoney/multiplyMoney/applyRate/allocateMoney), MoneyField/DecimalField on the frontend, useFormatCurrency/useFormatNumber/useFormatDate hooks. Use whenever you read, write, display, or compute money or numeric values that need locale-aware rendering.
license: MIT
---

# Money & Formatting

Money in this project is **always** an integer in the currency's minor unit (cents) paired with an ISO 4217 currency code. Bare floats are forbidden anywhere in the wire format, the entity, or the calculation path. The formatting layer is locale-aware end-to-end.

## Project-Specific Context

- `Money` type and helpers live in `@ids/data-models/lib/money/` — `toMoney`, `addMoney`, `subtractMoney`, `multiplyMoney`, `sumMoney`, `applyRate`, `allocateMoney`, `zeroMoney`.
- `Money.amount` is integer cents. `1299` means $12.99 USD. **Never assign decimals** to `amount`.
- Frontend boundary: `MoneyField` and `DecimalField` use locale-aware parsing/formatting via RHF `Controller`.
- Format hooks: `useFormatCurrency`, `useFormatNumber`, `useFormatDate` — all locale-aware via `react-i18next`.
- Parsing: `parseLocaleNumber()` — never `parseFloat()` directly on user input (validator-flagged).
- Backend mapper boundary: `money.amount / 100` to send a decimal in the response DTO.

## When to Apply

- Reading or writing any monetary field on an entity, DTO, or form.
- Computing money — totals, taxes, allocations, prorations.
- Displaying any number, currency, percent, or date in the UI.
- Adding a numeric form input (price, quantity, weight, mileage).
- Reviewing code for `parseFloat`, raw decimal assignment to Money, or `toLocaleString` calls.

## References

| Reference                          | Use When                                                              |
| ---------------------------------- | --------------------------------------------------------------------- |
| `references/money-type.md`         | Money type contract, helper functions, currency rules                 |
| `references/backend-money.md`      | toMoney at boundary, mapper conversion, three-way partial updates     |
| `references/frontend-input.md`     | MoneyField / DecimalField, RHF integration, parseLocaleNumber         |
| `references/locale-display.md`     | useFormatCurrency / useFormatNumber / useFormatDate, DateDisplay      |

## Critical Patterns

### Money Storage — Integer Cents Only

```typescript
import {toMoney, type Money} from '@ids/data-models';

// ✅ Correct — go through toMoney() at the boundary
const price: Money = toMoney(12.99, 'USD');   // → { amount: 1299, currency: 'USD' }

// ❌ Wrong — raw decimal in amount
const price: Money = {amount: 12.99, currency: 'USD'};   // floating-point precision bug waiting
```

### Backend Mapping — Cents → Decimal at the DTO Boundary

```typescript
// Mapper: entity → DTO
return {
  listPrice: part.listPrice ? part.listPrice.amount / 100 : null,
  cost: pv.cost ? pv.cost.amount / 100 : null,
};

// Service: DTO → entity (partial update)
if (dto.listPrice !== undefined) {
  part.listPrice = dto.listPrice !== null ? toMoney(dto.listPrice, 'USD') : undefined;
}
```

### Money Arithmetic — Helpers Only

```typescript
import {addMoney, multiplyMoney, applyRate, allocateMoney} from '@ids/data-models';

const subtotal = multiplyMoney(unitPrice, quantity);             // unitPrice × qty
const tax = applyRate(subtotal, 625);                            // 6.25% as basis points
const total = addMoney(subtotal, tax);
const shares = allocateMoney(freight, lineQuantities);           // exact-sum split

// ❌ Wrong — direct arithmetic on .amount
const total = {amount: subtotal.amount + tax.amount, currency: 'USD'};
//   Loses the currency check; silent currency mismatch bugs
```

### Frontend Inputs — MoneyField + DecimalField

```tsx
<MoneyField name="listPrice" label="List price" decimals={2} currency="USD" />
<DecimalField name="quantity" label="Quantity" decimals={4} />
```

Both wrap MUI `TextField` with `useController`. Field state holds a **locale-formatted string**; `parseLocaleNumber(value, locale)` converts to a number on submit.

### Display — Use Format Hooks

```tsx
const formatCurrency = useFormatCurrency({maximumFractionDigits: 2}, 'USD');
const formatNumber = useFormatNumber({maximumFractionDigits: 0});

return (
  <>
    <Typography>{formatCurrency(part.listPrice)}</Typography>
    <Typography>{formatNumber(part.totalOnHand)}</Typography>
  </>
);
```

Never call `toLocaleString` or build `Intl.NumberFormat` instances directly in feature code — the hooks center locale handling.

### Parsing User Input — `parseLocaleNumber`, Not `parseFloat`

```typescript
import {parseLocaleNumber} from 'core/formatters/formatMoney';
import {useTranslation} from 'react-i18next';

const {i18n} = useTranslation();
const value = parseLocaleNumber(formValue, i18n.language);
if (Number.isNaN(value)) return;

// `1 234,56` (fr) → 1234.56
// `1,234.56` (en) → 1234.56
```

The standards validator flags `parseFloat()` in frontend feature code.

## Further Documentation

- Money helpers (with rationale for basis points, allocation, and rounding): `libs/shared/data-models/src/lib/money/money.ts`
- Locale-aware formatters: `apps/client-web/app/core/hooks/useFormat*.ts`
- Project docs: `docs/standards/coding-standards-frontend.md` (locale-aware formatting section)
