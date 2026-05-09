# Tenant Setup — Authenticate + Select Location

Every E2E test runs against a tenant-scoped backend. Auth has two stages: (1) sign in via Logto OAuth, (2) select a location. Skipping stage 2 means queries return empty results because there's no `locationId` in the request.

## The auth helper signatures

```typescript
import {authenticateUser, selectLocation} from './helpers/auth.helper';

// Stage 1: OAuth round-trip — ~3-5 seconds
await authenticateUser(page, email, password);

// Stage 2: pick the tenant — synchronous on the page after a switcher click
await selectLocation(page, 'Acme RV — Headquarters');
```

Both helpers are idempotent in failure mode but not in success mode. Calling `authenticateUser` twice on an already-signed-in page may redirect to Logto and fail. Always start from a clean cookie jar.

## When to use `beforeAll` vs `beforeEach`

| Strategy | Use when |
|---|---|
| `beforeAll` + shared page | Default. Tests in the file share auth state. Logto round-trip happens once. |
| `beforeEach` + fresh page | Auth state is part of what's under test (e.g. permission denial, sign-out flow). |
| Per-test fresh context | Tests must run in parallel and not share cookies. |

```typescript
// Default pattern — sign in once, share across tests
let sharedBrowser: Browser;
let sharedPage: Page;

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
```

If you go this route, declare the file `serial`:

```typescript
test.describe.configure({mode: 'serial'});
```

Otherwise Playwright may run tests concurrently with stale shared state.

## Backend availability check

`authenticateUser` fails fast if `astra-apis` is unreachable on `:3000`:

> `Authentication aborted — backend API is unreachable. Ensure astra-apis is running on localhost:3000.`

You don't need to wrap your own check. If you see this in CI, the backend container didn't come up — fix the test infra, not the test.

## Test user override

```typescript
const TEST_USER = {
  email: process.env['TEST_USER_EMAIL'] ?? TEST_USER_EMAIL,
  password: process.env['TEST_USER_PASSWORD'] ?? TEST_USER_PASSWORD,
};
```

Always allow env override. The default `alice@acme-rv.com` works for local dev; CI may use a different seeded user.

## Location-scoped data assumption

After `selectLocation`, the location switcher cookie is set and `locationId` flows through every API request via `LocationProvider`. If a test loads data and the grid is empty, the most likely causes (in order):

1. Wrong location selected (no seeded data for that location)
2. Seed data not loaded for the run
3. The page's `clientLoader` failed silently — check the network panel
