# Assertions — i18n-Safe, Role-First

Assertions break the most under i18n changes (en ↔ fr) and DOM refactors. Stick to semantic checks.

## The hierarchy

```
1. Role + accessible name regex     — `getByRole('button', {name: /save/i})`
2. Test ID + data attribute         — `getByTestId('chip').toHaveAttribute('data-status', 'available')`
3. URL / route assertion            — `expect(page.url()).toContain(PATH_CONSTANT)`
4. Number/structure assertion       — `expect(rows).toHaveCount(10)`
─── below this line is fragile ───
❌ Literal localized text matches
❌ `toHaveText` against translated strings
❌ `getByText` for status indicators
```

## Worked patterns

### Visibility + state

```typescript
// ✅ Element exists and is visible
await expect(page.getByRole('heading', {name: /unit inventory/i})).toBeVisible();

// ✅ Button is enabled / disabled
await expect(page.getByRole('button', {name: /save/i})).toBeEnabled();
await expect(page.getByRole('button', {name: /save/i})).toBeDisabled();

// ✅ Form field has a value
await expect(page.getByLabel('Stock Number')).toHaveValue('STOCK-001');
```

### URL and navigation

Always assert against constants from `test.constants.ts`, never against literal paths:

```typescript
import {UNIT_INVENTORY_PATH, SIGN_IN_PATH} from './test.constants';

// ✅
expect(page.url()).toContain(UNIT_INVENTORY_PATH);
await expect(page).toHaveURL(SIGN_IN_PATH);

// ❌ Hardcoded path drifts when routes change
expect(page.url()).toContain('/unit-inventory');
```

### Status and state — use `data-*` attributes

The frontend renders status chips with localized text but exposes the canonical state on a `data-*` attribute. Assert against the attribute, not the text:

```tsx
// Component renders:
<Chip data-testid="unit-status-chip" data-status={unit.status} label={t(`status.${unit.status}`)} />
```

```typescript
// ✅ Asserts the underlying state, not the localized label
await expect(page.getByTestId('unit-status-chip')).toHaveAttribute('data-status', 'available');

// ❌ Fails on French run where label is "Disponible"
await expect(page.getByText('Available')).toBeVisible();
```

If the component you're testing doesn't have a `data-status` attribute, **add it** rather than asserting against text. The component change ships in the same PR as the test.

### Counts and lists

```typescript
// ✅ Count rows in a grid
const rows = page.getByRole('row').filter({hasNot: page.getByRole('columnheader')});
await expect(rows).toHaveCount(10);

// ✅ A specific row exists
await expect(page.getByRole('row', {name: /STOCK-001/})).toBeVisible();

// ✅ A specific row is gone after delete
await expect(page.getByRole('row', {name: /STOCK-001/})).toHaveCount(0);
```

### Validation errors

Form validation errors are localized too. Don't assert against the message text — assert against the `aria-invalid` state or the error region's existence:

```typescript
// ✅ Field is marked invalid (works in any locale)
await expect(page.getByLabel('Stock Number')).toHaveAttribute('aria-invalid', 'true');

// ✅ Error region is shown (no text match)
await expect(page.getByRole('alert')).toBeVisible();

// ⚠️ Acceptable — regex-based, but only if the message is short and unique
await expect(page.getByRole('alert')).toContainText(/required/i);

// ❌ Fragile across i18n
await expect(page.getByText('Stock number is required')).toBeVisible();
```

### Negative assertions

```typescript
// ✅ Element does not exist
await expect(page.getByRole('button', {name: /delete/i})).toHaveCount(0);

// ✅ Element is hidden
await expect(page.getByRole('progressbar')).toBeHidden();

// ❌ Brittle — relies on exact rendering
await expect(page.locator('.delete-btn')).not.toBeVisible();
```

## What NOT to assert

- **Pixel positions, widths, heights** — break on responsive design changes
- **CSS class names** — emotion-generated, content-hashed, unstable
- **Computed styles** — use the underlying state attribute instead
- **Exact translation strings** — locale-dependent
- **DOM structure depth** — nth-child assertions break on every refactor

## Soft assertions

Playwright supports soft assertions (`expect.soft`) that record failures but continue the test. Useful for collecting multiple field-level errors in one go:

```typescript
await expect.soft(page.getByLabel('Stock Number')).toHaveValue('STOCK-001');
await expect.soft(page.getByLabel('Year')).toHaveValue('2024');
await expect.soft(page.getByLabel('Manufacturer')).toHaveValue('E2E Mfr');
// All three are checked even if the first fails. Test fails at the end if any did.
```

Don't overuse — they make failures harder to read. Reserve for cases where you genuinely want to see all problems at once.
