# Selectors — Locator Priority

Pick the most semantic locator that survives content changes, MUI upgrades, and i18n. The hierarchy below is non-negotiable.

## Priority order

```
1. getByRole          — buttons, links, headings, tabs, dialogs, anything with ARIA
2. getByLabel         — form fields associated with a <label>
3. getByPlaceholder   — inputs without a label (last resort for text inputs)
4. getByTestId        — custom-rendered cells, dynamic content, no semantic anchor
─── above this line is good. below is forbidden ───
❌ CSS class selectors  — '.MuiButton-root', '.css-xyz-123'
❌ Text-content selectors that match localized strings
❌ XPath
❌ nth-child / structural selectors that depend on DOM order
```

## Worked examples

### Buttons and links

```typescript
// ✅ Role + accessible name regex (case-insensitive, i18n-safe via aria-label or visible text mapping)
await page.getByRole('button', {name: /save/i}).click();
await page.getByRole('link', {name: /add unit/i}).click();

// ✅ When multiple buttons match, narrow with `exact` or scope to a region
await page.getByRole('button', {name: 'Save', exact: true}).click();
await page.getByRole('dialog').getByRole('button', {name: /confirm/i}).click();
```

### Form fields

```typescript
// ✅ getByLabel — the input has <label for="length">Length</label> in the DOM
await page.getByLabel('Length').fill("28'6\"");

// ✅ For Autocomplete or combobox, getByRole('combobox', {name})
await page.getByRole('combobox', {name: 'Type', exact: true}).click();
await page.getByRole('option', {name: 'RV'}).click();

// ✅ Placeholder when there's no real label
await page.getByPlaceholder('Enter stock...').fill('STOCK-001');
```

### Tables and grids

```typescript
// ✅ Find a row by its text content, then scope actions to it
const row = page.getByRole('row', {name: /STOCK-001/});
await row.getByRole('button', {name: /edit/i}).click();

// ✅ Find a cell within a row
await expect(row.getByRole('cell').nth(2)).toHaveText('Available');
```

### When `data-testid` is appropriate

Add a test ID when **no semantic anchor exists** — typically:
- Custom-rendered cells inside a `DataGrid`
- Status chips, indicator dots, badges
- Anonymous wrapper divs that contain dynamic content

```tsx
// In the React component:
<Chip
  data-testid="unit-status-chip"
  data-status={unit.status}
  label={t(`status.${unit.status}`)}
/>

// In the test:
await expect(page.getByTestId('unit-status-chip')).toHaveAttribute('data-status', 'available');
```

**Don't add `data-testid` to elements that already have a role** — `getByRole('button', {name: 'Save'})` is better than `getByTestId('save-btn')`.

## Forbidden patterns and why

### MUI auto-generated classes

```typescript
// ❌ Breaks on every MUI minor version bump
await page.locator('.MuiButton-root.MuiButton-contained').click();

// ❌ Emotion-generated, content-hashed, completely unstable
await page.locator('.css-1f7s3ux').click();
```

MUI's class names come from emotion's css-in-js compiler. The hashes are deterministic *within* a build but shift between MUI versions, theme changes, and even plugin order. Tests that rely on them are time bombs.

### Localized text content

```typescript
// ❌ Passes in en, fails in fr
await page.locator('button:has-text("Save")').click();

// ❌ Same problem
await expect(page.getByText('Available')).toBeVisible();
```

The app supports `en` and `fr`. Any test that asserts against literal English text breaks on the French run. Use:
- `getByRole('button', {name: /save/i})` — accessible-name match works in both locales when the button's `aria-label` is properly set
- `getByTestId` for status indicators
- `data-status` / `data-state` attributes for state assertions

### Structural selectors

```typescript
// ❌ Depends on DOM order — refactors break it
await page.locator('div > div:nth-child(3) > button').click();

// ❌ XPath, brittle
await page.locator('//button[contains(@class, "save")]').click();
```

If you can't find a semantic anchor, that's a signal the component needs a `data-testid`. Add it; don't reach for structural selectors.

## Adding a `data-testid` properly

When the test needs one and there's no role/label fit:

1. Add the prop in the React component
2. Use a kebab-case naming pattern: `<feature>-<element>-<purpose>` — e.g. `parts-row-edit-btn`, `unit-status-chip`
3. Reference `docs/standards/react-component-test-id-implementation.md` for the canonical naming convention
4. The change should land in the same PR as the test that uses it
