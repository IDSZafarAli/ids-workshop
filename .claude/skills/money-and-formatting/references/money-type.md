---
title: Money Type & Helpers
description: Money contract, currency rules, and the helper API — toMoney, add/subtract/multiply, applyRate, allocateMoney, sumMoney
tags: [Money, currency, toMoney, addMoney, applyRate, allocateMoney, basis-points]
---

# Money Type & Helpers

```typescript
import type {Money, CurrencyCode} from '@ids/data-models';

export type Money = {
  /** Integer minor units (cents). 1299 means $12.99 USD. */
  amount: number;
  /** ISO 4217 currency code. */
  currency: CurrencyCode;
};

export type CurrencyCode = 'CAD' | 'USD' | 'EUR' | 'GBP' | 'AUD' | 'MXN';
```

## Why Integer Cents

`12.99` cannot be stored exactly as an IEEE 754 float — it's actually `12.99000000000000021…`. Sum a thousand such values and the error accumulates into real money. Stored as `1299`, the value is exact. Every monetary computation in this project goes through integer cents to eliminate float drift.

## Why Currency on Every Value

Every `Money` carries its currency. Operations that mix currencies **throw** — there's no silent fallback. This catches multi-currency bugs at the boundary instead of in the totals.

## The Helpers

### toMoney(value, currency) — Boundary Parser

```typescript
toMoney(12.99, 'USD');        // { amount: 1299, currency: 'USD' }
toMoney('12.99', 'USD');      // { amount: 1299, currency: 'USD' }
toMoney('$12.99', 'USD');     // { amount: 1299, currency: 'USD' } — strips non-numeric chars
toMoney('', 'USD');           // { amount: 0, currency: 'USD' } — NaN coerced to 0
toMoney(0.1 + 0.2, 'USD');    // { amount: 30, currency: 'USD' } — Math.round() handles drift
```

Call exactly once, at the boundary where user input or external data arrives. Never pass raw decimals across module boundaries — wrap them at the entry.

### zeroMoney(currency)

```typescript
zeroMoney('USD');             // { amount: 0, currency: 'USD' }
```

Use as a starting accumulator or default value.

### addMoney(a, b) / subtractMoney(a, b)

```typescript
addMoney(usd(100), usd(200));         // { amount: 300, currency: 'USD' }
addMoney(usd(100), cad(100));         // throws: 'Currency mismatch: USD + CAD'

subtractMoney(usd(500), usd(200));    // { amount: 300, currency: 'USD' }
subtractMoney(usd(200), usd(500));    // { amount: -300, currency: 'USD' } — negative is legal
```

Negative results are allowed (trade-in payoff exceeds allowance, returns exceed sales).

### multiplyMoney(money, scalar)

```typescript
multiplyMoney(usd(1299), 3);          // { amount: 3897, currency: 'USD' } — $38.97
multiplyMoney(usd(1299), 1.5);        // { amount: 1949, currency: 'USD' } — Math.round
```

For quantity × unit price. The scalar is a plain number (not Money); the result rounds to the nearest minor unit.

### applyRate(money, basisPoints)

```typescript
applyRate(usd(123456), 625);          // 6.25% of $1234.56 = $77.16 → { amount: 7716, currency: 'USD' }
applyRate(usd(10000), 1000);          // 10% of $100.00 = $10.00 → { amount: 1000, currency: 'USD' }
```

**Why basis points (1/10000 of a percent)?** 6.25% as a decimal is `0.0625` — non-exact in float. As basis points it's the integer `625`. The formula `amount × basisPoints / 10000` keeps integers until the final divide, then rounds.

Use for taxes, dealer fees, interest. Never use plain decimals (`* 0.0625`) — it's a float-precision bug waiting.

### allocateMoney(money, ratios)

```typescript
allocateMoney(usd(1000), [1, 1, 1]);  // [{334}, {333}, {333}] — exact sum = 1000
allocateMoney(usd(1234), [3, 5, 2]);  // weighted, exact sum = 1234
```

Splits money across N shares so the **shares sum exactly to the original**. The naive approach (`Math.round(total/n) * n`) is off by ±1 cent — unacceptable in accounting.

Use for prorating freight across line items, splitting fees, distributing rebates.

### sumMoney(values, currency)

```typescript
sumMoney([usd(100), usd(200), usd(300)], 'USD');  // { amount: 600, currency: 'USD' }
sumMoney([], 'USD');                              // { amount: 0, currency: 'USD' }
```

Total an array. Empty array returns `zeroMoney(currency)` — no NaN, no `undefined`.

## Anti-Patterns

```typescript
// ❌ Direct arithmetic on .amount
const total = { amount: a.amount + b.amount, currency: 'USD' };
//   Skips the currency check. If a is CAD and b is USD, this silently mixes.

// ❌ Floating-point operations
const tax = subtotal.amount * 0.0625;
//   Float drift in the multiplication. Use applyRate(subtotal, 625).

// ❌ Decimal in .amount
const price: Money = { amount: 12.99, currency: 'USD' };
//   Storage contract is integer cents. This is the value 0.1299 misread.

// ❌ Naive split
function split(total: Money, n: number): Money[] {
  const each = Math.floor(total.amount / n);
  return Array(n).fill({ amount: each, currency: total.currency });
  //   Sum doesn't match total — loses the remainder. Use allocateMoney().
}

// ❌ Bare number for a money field
type LineItem = { unitPrice: number; tax: number; total: number };
//   Lose currency, lose float-safety. Type as Money.

// ❌ Reading .amount as if it's the display value
return <Typography>{`$${money.amount}`}</Typography>;
//   Renders "$1299". Either / 100 then format, or use useFormatCurrency.
```

## Custom Helpers — Don't

If a calculation needs five steps and the helpers don't compose neatly, extract a domain function in the feature module — but each step still goes through a helper. Don't reach into `.amount` for arithmetic, even temporarily. The helpers are the API; bypassing them is the bug.

```typescript
// ✅ Domain function built on helpers
export function applyVendorDiscount(cost: Money, discountBp: number): Money {
  return subtractMoney(cost, applyRate(cost, discountBp));
}

// ❌ Bypass
export function applyVendorDiscount(cost: Money, discountBp: number): Money {
  return {amount: cost.amount - cost.amount * (discountBp / 10000), currency: cost.currency};
}
```

## Test References

`libs/shared/data-models/src/lib/money/__test__/money.test.ts` — 100+ unit tests covering currency mismatches, edge cases, allocation correctness. Read these when extending the helpers; they're the spec.
