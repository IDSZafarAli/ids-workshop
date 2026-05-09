# Timing — Waits, Network Idle, TanStack Query

The most common cause of flaky tests in this project is racing the data layer. Every list page is backed by TanStack Query, every form mutation triggers an invalidation + refetch. Waiting for "the page" isn't enough — you have to wait for the **right state** to be present.

## The three signals to wait for

| Signal | API | When |
|---|---|---|
| Initial navigation complete | `page.goto(url, {waitUntil: 'networkidle'})` | First load of a route |
| URL change | `page.waitForURL(/pattern/)` | After clicking a link, completing OAuth |
| Element rendered | `locator.waitFor({state: 'visible', timeout: N})` | The data-driven element you're about to assert against |

Almost every test should use signal 3 — wait for the actual element you care about, not for "the page."

## Anti-pattern: `waitForTimeout`

```typescript
// ❌ Brittle. The page may not be ready in 2s. Or it may be ready in 200ms and you waste 1.8s × N tests.
await page.waitForTimeout(2000);
```

Replace with explicit waits:

```typescript
// ✅ Wait for the heading — proves the layout rendered
await page.getByRole('heading', {name: /unit inventory/i}).waitFor({state: 'visible', timeout: 10_000});

// ✅ Wait for a specific row — proves the query resolved
await page.getByRole('row', {name: /STOCK-001/}).waitFor({state: 'visible', timeout: 10_000});

// ✅ Wait for a loading spinner to disappear
await page.getByRole('progressbar').waitFor({state: 'hidden', timeout: 10_000});
```

## TanStack Query stabilization

Pages backed by `useQuery` go through three states: pending → loading → settled. The first render is empty; the spinner appears, then the data renders. If you click into the page before the data has loaded, you'll find empty rows or stale state.

```typescript
// ✅ Navigate, then wait for the query to settle (proxy: a row exists, or empty state shows)
await page.goto(`${UNIT_INVENTORY_PATH}`);
await page.getByRole('grid').waitFor({state: 'visible'});
await Promise.race([
  page.getByRole('row', {name: /STOCK-/}).first().waitFor({timeout: 10_000}),
  page.getByText(/no units found/i).waitFor({timeout: 10_000}),
]);
```

For mutations (e.g. submit a form, expect a row to appear), use `waitFor` on the new row, not a fixed timeout:

```typescript
// ✅ After save, wait for the new row to appear in the list
await page.getByRole('button', {name: /save/i}).click();
await page.waitForURL(/unit-inventory$/);  // route navigation after save
await page.getByRole('row', {name: /E2E-12345/}).waitFor({timeout: 15_000});
```

## When `networkidle` is the right wait

`waitUntil: 'networkidle'` waits for ≥500ms of no network activity. Use it for:
- Initial page load (the one in `beforeAll` after sign-in)
- After a `goto()` to a new route, before the first interaction
- **Not** between every action — TanStack Query's background refetches keep the network busy and `networkidle` may never resolve

```typescript
// ✅ Right place
await page.goto(SIGN_IN_PATH, {waitUntil: 'networkidle'});

// ❌ Wrong place — will probably time out under TanStack background refetch
await page.click('button');
await page.waitForLoadState('networkidle');  // hangs
```

Prefer element-based waits over network-based waits past the first navigation.

## Tab activation

When clicking a tab, wait for the tab panel to render — the tab itself is just an ARIA control:

```typescript
await sharedPage.getByRole('tab', {name: 'Description'}).click();
// Tab content appears asynchronously
await sharedPage.getByLabel('Length').waitFor({state: 'visible', timeout: 5_000});
```

## Logto OAuth round-trip timing

The auth helper handles its own timing internally. You don't need additional waits around `authenticateUser()`. If you're seeing flakes there, the backend is slow — check `:3000` health, not the test.

## Default timeouts

- Default for `waitFor`: **5_000 ms** for routine elements
- Default for `waitFor`: **10_000-15_000 ms** for first render after navigation (initial query, OAuth callback)
- Default for `waitForURL`: **10_000 ms**

Use `_` separator in numeric literals (`5_000`) — it matches the project's biome config.

## Debugging timing issues

If a test is flaky under load:
1. Run it in headed mode with `npx playwright test --headed --project=chromium some-test.test.ts`
2. Add `await page.pause()` to drop into the inspector at the suspicious step
3. Look for a `<CircularProgress>` or skeleton that's still visible when you tried to assert
4. Replace the failing wait with one that targets the actual element you're about to interact with
