# Cleanup — What Tests Own vs the Runner

Tests in this project share a backend, a database, and a Logto tenant. Cleanup is split: **the test runner resets the seed between runs**; **each test owns its own session state and any records it creates**.

## What the runner handles (don't duplicate)

- Database reset between full runs (`npm run e2e:reset`) — drops and re-seeds reference data
- Browser process lifecycle — Playwright tears down browsers automatically
- Test report generation — `playwright-report/` is rebuilt on each run

You **do not** need to drop tables, re-seed, or restart the backend in test code.

## What each test owns

### 1. Cookies and storage

Logto session cookies persist across tests in the same browser context. **Always clear them** before navigating in `beforeAll` (or `beforeEach` if tests need fresh sessions):

```typescript
test.beforeAll(async () => {
  // ...
  await sharedPage.context().clearCookies();
  await sharedPage.context().clearPermissions();
  // Then sign in
  await authenticateUser(sharedPage, TEST_USER.email, TEST_USER.password);
});
```

The `authenticateUser` helper itself clears cookies before navigating to `/sign-in`, so if you call it, cookies are already cleared. If you skip the helper for some reason, clear manually.

### 2. Created records

Tests that create a record (a unit, a part, a work order) own that record's lifetime. Two strategies:

**Strategy A — Unique identifier per run.** Generate a stock/part/wo number that won't collide across parallel runs:

```typescript
const stockNo = `E2E-${Date.now()}`;
await page.getByPlaceholder('Enter stock...').fill(stockNo);
```

This way you can leave the record in the DB — the next seed reset clears it. No cleanup code needed in the test.

**Strategy B — Explicit cleanup in `afterEach` / `afterAll`.** Only worth it if the test requires a known fixed identifier (rare). Use the API directly:

```typescript
test.afterEach(async ({page}) => {
  await page.request.delete(`/api/units/${createdUnitId}`);
});
```

Strategy A is preferred. Strategy B is fragile (cleanup runs on test failure may double-delete; ordering matters).

### 3. Browser contexts

If a test creates extra browser contexts (e.g. to test multi-user concurrency), close them in `afterEach`:

```typescript
let secondContext: BrowserContext;

test.afterEach(async () => {
  await secondContext?.close();
});
```

The shared `sharedBrowser` from `beforeAll` is closed in `afterAll` — see the skeleton in the SKILL.md.

## What tests **must not** do

- **Don't delete seed reference data** (locations, vendors, dropdown options). The runner owns these. Deleting them breaks every other test that depends on them.
- **Don't truncate database tables** from a test. Period.
- **Don't depend on test execution order** unless the file is declared `serial`. Cleanup that assumes ordering breaks under parallel execution.
- **Don't leave files in `playwright/.auth/`** — Playwright's storage state mechanism. This project doesn't use it (we re-auth via `authenticateUser`); writing to it leaks state across runs.

## Parallel safety checklist

Before merging a new test, verify:

- [ ] Any record created uses a unique identifier (timestamp, UUID, or test-name-prefixed)
- [ ] No assertions assume "exactly N records exist" against shared seed data — count what *this* test created instead
- [ ] No `afterEach` modifies shared seed data
- [ ] If the file uses `beforeAll` shared state, it declares `test.describe.configure({mode: 'serial'})`

## Failure-case cleanup

When a test fails, hooks still run. If your `afterEach` assumes the test succeeded, it may itself fail and obscure the original error. Defensive pattern:

```typescript
test.afterEach(async ({page}, testInfo) => {
  if (testInfo.status !== 'passed') {
    // Capture extra debug info on failure, don't try to clean up state
    await page.screenshot({path: `failures/${testInfo.title}.png`});
    return;
  }
  // ...normal cleanup...
});
```

Or just rely on Strategy A (unique IDs) and skip cleanup hooks entirely. Simpler is better.
