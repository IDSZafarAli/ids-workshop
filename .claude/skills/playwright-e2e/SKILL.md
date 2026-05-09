---
name: playwright-e2e
description: Playwright E2E test patterns for IDS Cloud DMS — authenticate via Logto OAuth, select a tenant location, write tenant-scoped tests, use stable selectors, handle TanStack-Query timing, and assert i18n-safe. Use when writing or modifying a `*.test.ts` file under apps/client-web-e2e/src/.
license: MIT
---

# Playwright E2E

E2E tests in this project are not stock Playwright. They navigate a Logto-OAuth sign-in, pick a tenant location, run against a seeded database, and assert through semantic locators that survive i18n. Generic Playwright knowledge from training is often misleading here — follow the patterns below.

## Project-Specific Context

- Tests live in `apps/client-web-e2e/src/*.test.ts` (note: `.test.ts`, not `.spec.ts`).
- Auth helpers: `src/helpers/auth.helper.ts` exports `authenticateUser(page, email, password)` and `selectLocation(page, locationName)`.
- Path constants: `src/test.constants.ts` — `SIGN_IN_PATH`, `PARTS_PATH`, `UNIT_INVENTORY_PATH`, etc. Never hardcode routes.
- Default user: `TEST_USER_EMAIL` (`alice@acme-rv.com`), `TEST_USER_PASSWORD` — overridable via env vars.
- Backend must be running: `astra-apis` on `:3000`, frontend on `:3004`, Logto on `:3001`. The auth helper fails fast with a clear error if `:3000` is unreachable.
- Seed data is loaded **before the test run**, not per-test. Tests assume reference data (locations, vendors, dropdown options) is present and may need to skip gracefully if a required option is missing.
- The standards rule (`react-component-test-id-implementation.md`) prefers `data-testid` as the primary selector; existing tests heavily use Playwright's semantic locators (`getByRole`/`getByLabel`/`getByPlaceholder`) which are equivalent quality. **Forbidden**: MUI's auto-generated CSS classes (`.MuiButton-root`, `.css-xyz-abc`) — they shift on every MUI upgrade.

## When to Apply

- Writing a new `*.test.ts` under `apps/client-web-e2e/src/`.
- Adding an additional scenario to an existing test file.
- Repairing a flaky or selector-broken test.
- Wiring a new tenant-scoped page into the E2E suite.

Skip when:
- Modifying tests for unit-level utilities (those are Vitest, not Playwright).
- Working only on the `apps/astra-apis-e2e/` API tests (those use Vitest + fetch — different patterns).

## References

| Reference                              | Use When                                                          |
| -------------------------------------- | ----------------------------------------------------------------- |
| `references/tenant-setup.md`           | Authenticating + selecting a location, beforeAll vs beforeEach    |
| `references/selectors.md`              | Locator priority, MUI traps, when to add `data-testid`            |
| `references/timing.md`                 | `waitForLoadState`, network idle, TanStack Query stabilization    |
| `references/assertions.md`             | i18n-safe expectations, role-based assertions, `toHaveURL`        |
| `references/cleanup.md`                | Cookie/storage clearing, what tests own vs the runner             |

## Critical Patterns

### Tenant-Aware Test Skeleton

Every test needs an authenticated session and a selected location before any page interaction.

```typescript
import {type Browser, type Page, chromium, expect, test} from '@playwright/test';
import {authenticateUser, selectLocation} from './helpers/auth.helper';
import {TEST_USER_EMAIL, TEST_USER_PASSWORD, UNIT_INVENTORY_PATH} from './test.constants';

const TEST_USER = {
  email: process.env['TEST_USER_EMAIL'] ?? TEST_USER_EMAIL,
  password: process.env['TEST_USER_PASSWORD'] ?? TEST_USER_PASSWORD,
};

let sharedBrowser: Browser;
let sharedPage: Page;

test.describe('Unit inventory description tab', () => {
  test.beforeAll(async () => {
    sharedBrowser = await chromium.launch();
    const context = await sharedBrowser.newContext();
    sharedPage = await context.newPage();
    await authenticateUser(sharedPage, TEST_USER.email, TEST_USER.password);
    await selectLocation(sharedPage, 'Acme RV — Headquarters');
  });

  test.afterAll(async () => {
    await sharedBrowser.close();
  });

  test('renders required fields', async () => {
    await sharedPage.goto(`${UNIT_INVENTORY_PATH}/create`);
    await sharedPage.getByPlaceholder('Enter stock...').waitFor({state: 'visible', timeout: 15_000});
    // ...
  });
});
```

**Why `beforeAll` (sign in once) instead of `beforeEach`:** the Logto OAuth round-trip is ~3-5 seconds. Per-test sign-in adds minutes to the suite. Share the authenticated page and use `test.describe.configure({ mode: 'serial' })` if tests must run in order.

### Selectors — Priority Order

| Priority | Selector | When |
|---|---|---|
| 1 | `page.getByRole('button', {name: /save/i})` | Buttons, links, headings, tabs — anything with a clear ARIA role |
| 2 | `page.getByLabel('Length')` | Form fields with associated `<label>` |
| 3 | `page.getByPlaceholder('Enter stock...')` | Inputs without a visible label |
| 4 | `page.getByTestId('part-row-edit-btn')` | Custom-rendered cells, dynamic content where role/label fails |
| ❌ | `page.locator('.MuiButton-root')` | **Never** — MUI internals shift |
| ❌ | `page.locator('button:has-text("Save")')` | Avoid — breaks under i18n |

### Timing — Wait for Real State, Not Sleeps

Don't use `page.waitForTimeout(N)` to "let the page settle." Wait for an explicit signal:

```typescript
// ✅ Wait for the page to be navigable (initial load, route change)
await page.goto(UNIT_INVENTORY_PATH, {waitUntil: 'networkidle'});

// ✅ Wait for a key element to render — proves the data layer settled
await page.getByRole('heading', {name: 'Unit Inventory'}).waitFor({state: 'visible', timeout: 10_000});

// ✅ Wait for a specific row in a TanStack Query–backed grid
await page.getByRole('row', {name: /STOCK-001/}).waitFor({timeout: 10_000});

// ❌ Brittle — page may not be ready in 2 seconds
await page.waitForTimeout(2000);
```

### i18n-Safe Assertions

The app supports `en` and `fr`. Asserting against literal English text breaks French test runs.

```typescript
// ✅ Role + accessible name regex (case-insensitive)
await expect(page.getByRole('button', {name: /save/i})).toBeEnabled();

// ✅ Test-ID for content with no semantic anchor
await expect(page.getByTestId('unit-status-chip')).toHaveAttribute('data-status', 'available');

// ✅ Compare against a known constant, not a localized string
expect(page.url()).toContain(UNIT_INVENTORY_PATH);

// ❌ Brittle under i18n
await expect(page.getByText('Save')).toBeVisible();
```

### Graceful Skip on Missing Seed Data

Tests that depend on a dropdown option (e.g. "first available designation") should detect missing seed data and fail loud, not flake silently.

```typescript
const designationOption = page.getByRole('option').first();
const ready = await designationOption
  .waitFor({state: 'visible', timeout: 5_000})
  .then(() => true)
  .catch(() => false);
if (!ready) {
  test.skip(true, 'Designation seed data missing — run seed:e2e and retry');
}
await designationOption.click();
```

### Cleanup — What Each Test Owns

- Tests **must** clear cookies in `beforeEach` (or `beforeAll`) before navigating: `await page.context().clearCookies();`. Logto session cookies persist otherwise.
- Tests **must not** delete seed data — the seed is reset between runs by the test runner, not per-test.
- Tests that create a record (e.g. a unit with stock `E2E-{timestamp}`) should use a unique stock number to avoid collisions across parallel runs.

## Further Documentation

- Project standards: `docs/standards/e2e-testing-best-practices.md` (483 lines — selector philosophy, MUI patterns)
- Project standards: `docs/standards/react-component-test-id-implementation.md` (when and how to add `data-testid`)
- Local guide: `apps/client-web-e2e/LOGTO_AUTH_GUIDE.md` (auth helper usage)
- Playwright official: https://playwright.dev/docs/best-practices
