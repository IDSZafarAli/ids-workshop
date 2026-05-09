# Coding Standards — Frontend (React)

Frontend-specific standards. Core TypeScript and naming rules are in `coding-standards-core.md` (loaded separately).

> **Tactical patterns for Claude live in `.claude/skills/`** — `react-hook-form/`, `react-router-framework-mode/`, `tanstack-query/`, and `money-and-formatting/`. When a rule below changes, mirror the change in the corresponding SKILL.md so Claude's auto-loaded context stays in sync with this canonical spec.

---

## Non-Negotiable Rules

These are the hard rules. If your code violates one, it is wrong — no exceptions. Rationale and examples follow in later sections.

1. **All HTTP calls go through `apiClient`.** Never use bare `fetch()` in feature code. One infrastructure exception is documented below.
2. **API types mirror the server's DTO contract** — not backend entity shapes. Frontend state is typed with the response DTO, never with a RavenDB entity.
3. **Use `sx` prop for all MUI styling.** Never the `styled()` API.
4. **MUI imports use path imports** — `import Button from '@mui/material/Button'`. Never barrel imports.
5. **Function declarations, not arrow functions, for components.** `export function CustomerList()`, not `export const CustomerList = () =>`.
6. **One component per file.** No exceptions — even small private helpers.
7. **`.tsx` component files are PascalCase; `.ts` files (hooks, utils, types) are camelCase.** No `I` prefix on interfaces.
8. **CSS variables prefixed with `--ids-`.**
9. **Locale-aware formatting is mandatory.** Money, decimals, and dates go through `MoneyField` / `DecimalField` / `DateDisplay` (or the `useFormatCurrency` / `useFormatNumber` / `useFormatDate` hooks). Never `new Intl.NumberFormat(...)` or `.toLocaleString()` at the call site.
10. **Auto-dismissing banners use `<HideAfterDelay>`.** Default 3s. Never hand-roll `setTimeout` + `setVisible(false)` for this.
11. **`useEffect` is only for external subscriptions, timers, and DOM integrations.** Never use it for derived state, form initialisation from props, or notifying a parent of state changes. See the decision table in the Hooks section.
12. **`useMemo` and `useCallback` only when reference stability is proven necessary.** A plain variable is always preferred for simple computations (`Array.find`, `Array.filter`, mapping). The only justified uses are: stabilising a reference passed to a `React.memo`-wrapped child, or column definitions for MUI DataGrid (which compares references on every render). Premature memoisation is a violation, not a precaution.

---

## Naming Conventions

| Context | Convention | Examples |
|---|---|---|
| `.tsx` component files | PascalCase | `CustomerList.tsx`, `OrderDetailPage.tsx` |
| `.ts` files (hooks, utils, types) | camelCase | `useCustomers.ts`, `formatDate.ts`, `customerTypes.ts` |
| React components | PascalCase | `CustomerList`, `OrderDetailPage` |
| TypeScript classes | PascalCase | `CustomerService`, `OrderValidator` |
| Interfaces | PascalCase — **no `I` prefix** | `CustomerFilters`, `OrderStatus` |
| Types | PascalCase | `Customer`, `OrderSummary` |
| Hooks | camelCase, `use` prefix | `useCustomers`, `useDebounce` |
| Everything else | camelCase | `customerId`, `handleSubmit`, `isLoading` |

> **Frontend does not use the `I` interface prefix.** That convention is backend-only (NestJS repository/service contracts). Frontend interfaces are plain PascalCase, matching standard React/TypeScript community convention.

> **File naming differs from backend.** Backend uses kebab-case for all files; frontend follows React convention — PascalCase for component files, camelCase for everything else. This is intentional and consistent with the wider React ecosystem.

---

## React Component Patterns

### API Types — Use Response DTOs, Not Backend Entities

Frontend state and API types mirror the server's **response DTO shape** — not backend entity types. The backend enforces that controllers return `*ResponseDto`, so the frontend's type surface should match that contract, not the RavenDB entity it was derived from.

```typescript
// ✅ Correct — state typed with the DTO the API actually returns
import type { CustomerResponseDto } from '~/features/customer/types';

export function CustomerList() {
  const [customers, setCustomers] = useState<CustomerResponseDto[]>([]);
  return <div>{/* JSX */}</div>;
}

// ❌ Wrong — typing state with the backend entity leaks persistence shape into the UI
import type { Customer } from '@ids/data-models'; // RavenDB entity
const [customers, setCustomers] = useState<Customer[]>([]);
```

**Why:** The entity carries audit fields, internal IDs, and persistence artifacts that are not part of the API contract. Typing with the DTO keeps the frontend aligned with what the server actually returns and catches contract drift at compile time.

---

### Functional Components

Use functional components with hooks as the standard. No class components. **Always use function declarations, not arrow functions.**

```typescript
import { useState } from 'react';
import type { CustomerResponseDto } from '~/features/customer/types';

export function CustomerList({ initialCriteria }: Props) {
  const [customers, setCustomers] = useState<CustomerResponseDto[]>([]);
  return <div>{/* JSX */}</div>;
}
```

---

### Export Patterns

| Context | Export style | Example |
|---|---|---|
| Pages & React Router routes | `export default function` | `export default function CustomerPage()` |
| Reusable components | `export function` (named) | `export function CustomerList(...)` |

```typescript
// ✅ Page / route — default export
export default function CustomerPage() {
  return <div>{/* page content */}</div>;
}

// ✅ Reusable component — named export
export function CustomerList({ customers }: Props) {
  return <ul>{/* list */}</ul>;
}

// ❌ Avoid — arrow function component
export const CustomerList: React.FC<Props> = ({ customers }) => {
  return <ul>{/* list */}</ul>;
};
```

---

### Component Organization

```typescript
export function CustomerList({ initialFilters }: Props) {
  // 1. State and custom hooks
  const [filters, setFilters] = useState(initialFilters);
  const { data, isLoading } = useCustomers(filters);

  // 2. Effects (only when needed for external systems/subscriptions)
  useEffect(() => {
    // Side effects like subscriptions, analytics
  }, []);

  // 3. Early returns
  if (isLoading) return <LoadingSpinner />;
  if (!data) return <EmptyState />;

  // 4. Event handlers
  const handleFilterChange = (newFilters: Filters) => {
    setFilters(newFilters);
  };

  // 5. Render
  return <div>{/* JSX */}</div>;
}
```

**Do not add `useCallback`/`useMemo` unless you have a concrete performance reason.** Premature memoization adds complexity with no benefit.

---

### One Component Per File

Each meaningful component belongs in its own file. Do not define multiple exported or sizeable components in a single file.

```
// ✅ Correct — each component in its own file
parts/components/PicturesTabContent.tsx
parts/components/ThumbnailRow.tsx
parts/components/PhotoPreview.tsx

// ❌ Incorrect — unrelated or sizeable components bundled together
parts/components/PicturesTabContent.tsx  ← also contains ThumbnailRow and PhotoPreview
```

No exceptions — even small, private helper components used in only one place must have their own file. Consistency matters more than the perceived overhead of creating a new file.

---

## Hooks

### useEffect — when to use and when not to

`useEffect` is for synchronising React with **external systems** — the DOM, timers, browser APIs, third-party libraries. It is not a general-purpose "run code when something changes" mechanism.

#### Decision table

| What you're tempted to do | Correct pattern |
|---|---|
| Fetch data on mount or param change | `useQuery` + `clientLoader` |
| Submit a form | `clientAction` (React Router) |
| Derive a value from props or state | Plain variable — no hook at all |
| Resolve an option object from a loaded list | Plain variable: `list.find(x => x.code === value) ?? null` |
| Reset form when a dialog opens | RHF `reset(defaultValues)` called in `onOpen`, or `key` prop to remount |
| Notify a parent when internal state changes | Pass the value in an event handler, or lift state up |
| Auto-dismiss a banner after a delay | `<HideAfterDelay>` — never hand-roll `setTimeout` + `setState` |
| DOM event listener / resize observer | `useEffect` with cleanup — this is what it's for |
| Blob URL or subscription lifecycle | `useEffect` with cleanup — this is what it's for |

#### ✅ Legitimate: external subscriptions and DOM integrations

```typescript
// ✅ DOM event subscription with cleanup
useEffect(() => {
  const onResize = () => setWidth(window.innerWidth);
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}, []);

// ✅ Blob URL cleanup on unmount
useEffect(() => {
  return () => URL.revokeObjectURL(previewUrl);
}, []);
```

#### ❌ Anti-pattern: derived state

```typescript
// ❌ useEffect to compute a value from loaded data
useEffect(() => {
  const match = laborCodes.find((lc) => lc.code === editRow.laborCode);
  if (match) setSelectedLaborCode(match);
}, [laborCodes, editRow.laborCode]);

// ✅ Just a variable — no hook, no stale closure risk
const selectedLaborCode = laborCodes.find((lc) => lc.code === editRow?.laborCode) ?? null;
```

#### ❌ Anti-pattern: form init from props

```typescript
// ❌ useEffect to initialise form state when a dialog opens
useEffect(() => {
  if (open && !prevOpen && isEdit && editRow) {
    setJobNumber(editRow.jobNumber ?? '');
    setDescription(editRow.description ?? '');
  }
}, [open, prevOpen, isEdit, editRow]);

// ✅ React Hook Form reset() in the open handler, or key prop to remount
<DialogForm key={editRow?.id ?? 'new'} defaultValues={editRow} />
```

#### ❌ Anti-pattern: dirty state notification

```typescript
// ❌ useEffect to push isDirty to parent
useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

// ✅ Call onDirtyChange in submit and reset handlers where state actually changes
```

### useMemo and useCallback

**Default: no hook.** A plain variable or inline expression is always preferred.

```typescript
// ❌ useMemo for a trivial find — adds a dependency array with no runtime benefit
const selectedCode = useMemo(
  () => codes.find((c) => c.id === selectedId),
  [codes, selectedId]
);

// ✅ Plain variable — React re-renders are fast; Array.find on small lists is nanoseconds
const selectedCode = codes.find((c) => c.id === selectedId);
```

**Justified uses:**

| Use case | Why |
|---|---|
| DataGrid column definitions | MUI compares column references; a new array on every render causes unnecessary re-computation |
| Handler passed to a `React.memo`-wrapped child | Reference stability prevents the child re-rendering when only the parent changes |
| Genuinely expensive computation (profiler-confirmed) | Rare; document why with a comment |

Everything else: skip the hook.

### Inline Arrow Functions

Use inline arrow functions for:
- Simple state updates not passed to children: `onClick={() => setCount(c => c + 1)}`
- Array operations: `items.map(item => <div key={item.id}>{item.name}</div>)`
- Handlers passed to non-memoized children — a fresh function reference is harmless when the child re-renders anyway

Only reach for `useCallback` when passing a handler to a **memoized** child (wrapped in `React.memo`) or to a dependency array where reference stability actually matters:

```typescript
// ✅ Inline is fine — ChildComponent is not memoized, new reference is harmless
<ChildComponent onAction={() => doSomething(id)} />

// ✅ useCallback here — MemoizedChild is wrapped in React.memo; stable ref prevents wasted re-renders
const handleAction = useCallback(() => doSomething(id), [id]);
<MemoizedChild onAction={handleAction} />

// ❌ Wrong — useCallback with no memoized consumer is noise
const handleAction = useCallback(() => doSomething(id), [id]);
<PlainChild onAction={handleAction} />
```

---

## HTTP Requests — Always Use `apiClient`

**Never use bare `fetch()` directly.** All HTTP calls to the IDS backend must go through `apiClient` from `core/services/apiClient.ts`.

```typescript
// ✅ CORRECT
import {apiClient} from 'core/services/apiClient';

export async function getMyResource(token: string): Promise<MyResource[]> {
  return apiClient.get<MyResource[]>('/my-resource', {token});
}

// ❌ WRONG — bypasses error handling, timeout, and retry
const res = await fetch(`${API_CONFIG.baseUrl}/my-resource`, {
  headers: {Authorization: `Bearer ${token}`},
});
```

**Why this matters — what bare `fetch` silently misses:**

- **No typed errors**: A plain `fetch` failure throws `TypeError` or a plain `Error`, neither of which is handled by `handleGlobalError` in `queryClient.ts`. The error is silently swallowed — no banner, no sign-out, no retry.
- **No offline detection**: `apiClient` checks `networkMonitor.isOnline()` before every request and throws `NetworkOfflineError` immediately. Bare `fetch` lets the request hang or fail with an untyped error.
- **No timeout**: `apiClient` aborts requests after `API_CONFIG.timeoutMs` and throws `RequestTimeoutError`. Bare `fetch` can hang indefinitely.
- **No token refresh**: `apiClient` automatically retries a 401 response with a refreshed token. Bare `fetch` forces the user into a broken state.
- **No health check**: `apiClient` calls `networkMonitor.checkHealth()` on timeout/abort so the NetworkAlert banner activates. Bare `fetch` never triggers it.

### When Bare `fetch` Is Acceptable

There is exactly **one** legitimate exception in this codebase:

1. **`networkMonitor.ts` health-check probe** — Must use bare `fetch` to avoid a circular dependency (`apiClient` → `networkMonitor.isOnline()` → `apiClient`). This is intentional infrastructure code, not a feature API call.

**If you think you need another exception, discuss it first.** The bar is high: it must be infrastructure-level code with a documented circular-dependency or architectural reason. Any bare `fetch` found in `app/services/**` or feature code is a violation, not an exception — it should be migrated to `apiClient`.

---

## Request Cancellation

**Feature code does not write `AbortController` plumbing.** `apiClient` already composes the caller's `AbortSignal` with its own timeout and abort handling. Pass the signal through and `apiClient` does the rest.

```typescript
// ✅ Correct — pass the caller's signal to apiClient
export async function fetchCustomers(
  {token, signal}: {token: string; signal?: AbortSignal},
): Promise<CustomerResponseDto[]> {
  return apiClient.get<CustomerResponseDto[]>('/customers', {token, signal});
}

// ❌ Wrong — manual AbortController in feature code duplicates what apiClient does
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000);
const response = await fetch('/api/customers', {signal: controller.signal});
```

The manual `AbortController` + timeout + `removeEventListener` pattern belongs only inside `apiClient` itself (which already implements it) or inside the documented infrastructure exceptions. Writing it in feature code is a redundant re-implementation of something the HTTP layer already handles — and it bypasses the error handling, offline detection, and token refresh that come with `apiClient`.

---

## Styling

### CSS Variables

**Always use `--ids-` prefix** for all CSS variables:

```css
/* ✅ Correct */
:root {
  --ids-brand-primary: #1976d2;
  --ids-text-primary: rgba(0, 0, 0, 0.87);
}

/* ❌ Incorrect — missing prefix */
:root {
  --brand-primary: #1976d2;
  --text-color: rgba(0, 0, 0, 0.87);
}
```

### Material UI Styling

**Use `sx` prop for ALL component styling. Never use the `styled()` API.**

```typescript
// ✅ Correct — sx prop
<Box sx={{ p: 3, display: 'flex', gap: 2 }}>
  <Paper sx={{ width: '100%', mb: 2 }}>
    <Typography sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
      Content
    </Typography>
  </Paper>
</Box>

// ✅ Correct — nested selectors
<TableRow sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'action.hover' } }}>
  {/* content */}
</TableRow>

// ❌ Incorrect — styled() API adds performance overhead
import { styled } from '@mui/material/styles';
const StyledCard = styled(Box)(({ theme }) => ({ /* ... */ }));
```

**Principles:**
- `sx` prop is more performant than `styled()`
- Use MUI theme tokens (not hardcoded colors)
- Use responsive syntax: `sx={{ width: { xs: '100%', md: '50%' } }}`
- When multiple components share the same `sx` values, extract them into a `styles/` folder inside the feature module (e.g., `pages/parts/styles/partStyles.ts`). Export typed `SxProps<Theme>` constants — never put style objects in `components/`.

---

## MUI Import Optimization

Reference: [MUI — Minimizing bundle size](https://mui.com/material-ui/guides/minimizing-bundle-size)

### Avoid Barrel Imports

Modern bundlers tree-shake unused code in production, so **production bundle size is not the concern here**. The real cost is **slower dev server startup and rebuild times** caused by loading entire barrel files.

```typescript
// ✅ Preferred — path imports
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import DeleteIcon from '@mui/icons-material/Delete';

// ❌ Avoid — barrel imports (slow dev builds)
import { Button, TextField } from '@mui/material';
import { Delete } from '@mui/icons-material'; // Up to 6x slower than path import
```

This requires no extra configuration and is the pattern used in all official MUI examples.

### Migrating Existing Code

To migrate existing barrel imports to path imports, run the MUI codemod from the workspace root:

```bash
npx @mui/codemod@latest v5.0.0/path-imports apps/client-web/app
```

### Enforcement

Biome does not currently have a `noRestrictedImports` rule, so barrel imports cannot be blocked at the linter level. Enforcement relies on:

- **VS Code auto-import**: `js/ts.preferences.autoImportSpecifierExcludeRegexes` in `.vscode/settings.json` prevents VS Code from suggesting barrel imports in auto-complete.
- **Code review**: Flag any new barrel imports from `@mui/material` or `@mui/icons-material` during review.

---

## Locale-Aware Components and Hooks

All user-facing money, number, and date rendering goes through the project's locale-aware layer. Raw `Intl.NumberFormat` / `toLocaleString` / template-string date formatting in feature code is a violation — it bypasses the i18n reactivity that re-formats values when the user switches language.

### Form Inputs (RHF-bound)

| Component | Use for | Notes |
|---|---|---|
| `MoneyField` | Currency input (price, cost, amount) | Renders locale-aware currency symbol with correct position (`$1.00` vs `1,00 €`). `decimals` default 4. Stores as string; parse with `parseLocaleNumber()` before submit. |
| `DecimalField` | Plain decimal input (weight, quantity, ratio) | `decimals` default 3. Stores as string; parse with `parseLocaleNumber()` before submit. |

Both components re-format the stored value when the active language changes, so a value entered in one locale displays correctly after a locale switch — no extra wiring needed at the form layer.

### Read-Only Display

- **Dates**: use `<DateDisplay value={iso} />`. Add `showTime` for date + time. Null/undefined renders `—`.
- **Money / decimals in non-form contexts** (tables, details, tooltips): use the hooks `useFormatCurrency` and `useFormatNumber`. Do not construct `new Intl.NumberFormat(...)` inline at the call site.
- **Dates outside components** (event strings, table cells built in loaders): use `useFormatDate` / `useFormatDateTime`.

### Rules

- **Never** format money, numbers, or dates with raw `Intl` APIs in feature code. Always route through the components/hooks above so locale switches propagate.
- **Form money/decimal values are strings.** The field state holds the locale-formatted string. Convert to a number with `parseLocaleNumber(value, locale)` at the point of API submission — never `parseFloat(value)`.
- **Money in DTOs is stored as cents (integer).** Convert on the way out (divide by 100 for display) and on the way in (`toMoney()` helper on the backend). Storing or displaying raw decimals bypasses the money precision guarantee.
- **Dates are ISO 8601 strings.** Frontend never constructs or mutates dates as `Date` objects in state — keep them as strings and let the display layer handle formatting.

---

## Form Handling (React Hook Form + React Router)

Complex forms use React Hook Form with Valibot validation and React Router `clientAction` for submission. Simple forms may use plain `useState`. For detailed code examples and implementation patterns, see the `react-hook-form` skill.

### When to Use a Form Framework

- **Complex forms** (dynamic field arrays, cross-field validation, nested sections, dirty tracking across tabs) use RHF + Valibot + React Router `clientAction`.
- **Simple forms** (2–3 fields, no dynamic arrays, trivial validation) use plain `useState` and a submit handler. Don't pull in the framework for something trivial.

### Architecture

Separate concerns by complexity — not every form needs all three layers:

| Layer | Responsibility |
|---|---|
| **Page** | `clientLoader`, `clientAction`, toolbar, success/error banners, navigation guards |
| **Form** | `useForm`, `FormProvider`, validation, submit handler, dirty tracking |
| **Sections** | `useFormContext`, field rendering, `useFieldArray`, `useWatch` |

### Form Rules

- Always provide `defaultValues` to `useForm` — enables `reset()` and prevents undefined state
- Use `valibotResolver` with schemas defined at **module level** (not inside components — breaks resolver caching)
- Use separate create/update schemas when validation rules differ by mode
- Track `isDirty` via destructured `formState` and pass up to the page via callback
- Use `useNavigation().state === 'submitting'` for submission loading state (not RHF's `isSubmitting`)
- Disable form visually during submission (`pointerEvents: 'none'` + reduced opacity)

### Submission

- Form submission flows through `handleSubmit` → `transformToApiPayload()` → `useSubmit()` → React Router `clientAction`
- `clientAction` calls the API, invalidates relevant query cache, and returns `{success, error?}`
- Page reads the result via `useActionData()` and renders success/error banners
- **Auto-dismissing success banners use `<HideAfterDelay>`** (default 3s delay). Do not build one-off `setTimeout`-based auto-dismiss logic — use the component so the behavior stays consistent across the app.
- On create success: redirect to edit page. On edit success: stay on page

### Loading

- Pre-fetch all dropdown/detail data in `clientLoader` via `queryClient.ensureQueryData` — eliminates loading spinners for form options
- Show a centered `CircularProgress` while the detail query loads on edit pages
- Show an error state with a "back to list" link when the entity is not found

### Navigation Guards

Form pages with unsaved changes need **two** guards:

1. **`useUnsavedChangesGuard(isDirty)`** — blocks in-app navigation (back button, links) and browser close/refresh
2. **`useLocationChangePrompt(isDirty, redirectTo)`** — blocks location (tenant) switching

Key rules:
- Suppress guards after successful save or during submission: `isDirty = formDirty && !actionData?.success && !isSubmitting`
- Use the reusable `UnsavedChangesDialog` component for both guard dialogs
- Cancel buttons don't need manual guard logic — the navigation guards handle dirty checks automatically
- The two guards coordinate: only one dialog shows at a time

### Validation Display

- Place a `ValidationSummary` component inside `FormProvider`, above form sections — shows a banner listing fields with errors after failed submission
- Every `Controller` should display field-level errors via `fieldState.error` → `helperText`
- Server errors from `clientAction` are separate — display via `actionData.error`

---

## Accessibility

- Use semantic HTML elements
- Provide `aria-label` for icon buttons
- Ensure keyboard navigation works
- Maintain proper heading hierarchy
- Use MUI's built-in accessibility features

```typescript
<IconButton aria-label="Delete customer" onClick={handleDelete}>
  <DeleteIcon />
</IconButton>
```

---

## Testing

See `.claude/rules/frontend-testing.md` for the full policy. Summary:

- **Unit tests (Vitest):** `.ts` files only — mappers, formatters, validators, pure transforms. No React, no hooks.
- **No component tests, no `renderHook` tests.** `@testing-library/react` is not installed and must not be added.
- **UI behaviour is verified by Playwright E2E** in `apps/client-web-e2e/`. See `.claude/skills/playwright-e2e/SKILL.md`.

The design rule: non-trivial hook logic must live in a `.ts` file where it can be unit-tested in isolation. The hook itself is thin glue and is not tested directly.

---

> These standards are living documents. Propose changes via pull request with rationale.
