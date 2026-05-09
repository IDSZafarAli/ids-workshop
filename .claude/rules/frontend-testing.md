---
paths:
  - "apps/client-web/app/**/*.{ts,tsx}"
---

# Frontend Testing Policy

## What we test

- **`.ts` files** — mappers, formatters, validators, sort/filter functions, pure transformations. Unit-tested with Vitest. These are also the primary signal for Stryker mutation testing.
- **End-to-end flows** — Playwright E2E in `apps/client-web-e2e/` covers all user-facing behavior (forms, navigation, data round-trips, auth).

## What we do NOT test

- **React components** — no RTL, no component unit tests, no snapshot tests. UI behavior lives in E2E.
- **Hooks** — no `renderHook` tests, no `@testing-library/react`. Hooks are React glue, not algorithm.

## The design rule

**Non-trivial hook logic must live in a `.ts` file.** Hooks compose pure logic + React glue. The logic gets unit-tested in the `.ts` file; the glue is verified by E2E.

```typescript
// ✅ Hook is thin glue — not tested
// hooks/useUnitFilter.ts
export function useUnitFilter(units: Unit[], filters: Filters) {
  return useMemo(() => filterUnits(units, filters), [units, filters]);
}

// ✅ Logic is pure — unit-tested
// utils/filterUnits.ts
export function filterUnits(units: Unit[], filters: Filters): Unit[] {
  // real logic here
}
```

If a hook has logic that genuinely cannot be extracted (e.g. `useEffect` orchestration with timing, stateful reducer with non-trivial transitions), surface it for discussion before writing the test — usually it signals the architecture should be reconsidered first.

## Why

- TanStack Query / React Hook Form / context wrappers have zero unit-test value — testing them re-tests the libraries
- Mocking `apiClient` + `useQuery` + contexts to test a thin hook produces tests where mock setup exceeds hook size
- Mutation testing rewards algorithmic content; thin wrappers produce noise, pure functions produce signal
- E2E catches integration bugs (auth flow, real API contracts, navigation, RavenDB query results, multi-tenant location filtering) that hook-isolation tests can't

## Test infrastructure (minimal by design)

Currently in `package.json`:
- `vitest` + `jsdom` environment
- No `@testing-library/react`, no `@testing-library/jest-dom`, no mock providers

Adding any of those would invite component/hook tests we explicitly don't write. If a future need arises (e.g. testing a complex reusable component in `libs/shared/ui/`), discuss before adding the dep.
