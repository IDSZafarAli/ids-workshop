---
paths:
  - "apps/client-web/app/**/*.{ts,tsx}"
---

# Frontend Folder Architecture

> **Code quality rules** (hooks, `useEffect`/`useMemo` anti-patterns, styling, naming, forms, testing) live in `docs/standards/coding-standards-frontend.md`. This file covers project-specific **architecture and structure** only.

Where code goes, named by what it *does* — not by what it *is*.

## Three scopes

```
app/core/                      ← cross-cutting infrastructure (auth, API client, query config, etc.)
app/components/                ← globally shared React components (MoneyField, Layout, DateDisplay, etc.)
app/pages/<feature>/           ← feature-scoped (used by one page only)
```

If a helper graduates from one feature to several, promote it from `app/pages/<feature>/<category>/` to `app/core/<category>/`. A component used by 2+ features belongs in `app/components/`, not inside any `pages/` feature folder.

`app/core/contexts/` is the home for shared context providers. There is no `app/contexts/` — do not create one. `app/core/config/` is the only config location; do not create `app/config/`.

## Folder vocabulary

Both scopes share the same category names:

| Category | What goes inside |
|---|---|
| `components/` | React components (`.tsx`) |
| `hooks/` | `useQuery`/`useMutation` wrappers and other React hooks (thin glue; logic lives in a `.ts` category) |
| `mappers/` | DTO ↔ form data conversion (used by `clientAction` and RHF form reset) |
| `formatters/` | parse / format / normalize / display value formats |
| `queries/` | Plain async API fetch functions (`*Queries.ts`) and query key factories (`*QueryKey.ts`) — **not hooks** |
| `schemas/` | Valibot validation schemas (used by React Hook Form via `valibotResolver`) |
| `types/` | TypeScript types and DTO contracts |
| `constants/` | constants (see note on `constants/constants.ts` below) |
| `styles/` | extracted MUI `sx` objects — use when an `sx` prop grows too large for inline |
| `services/` | apiClient, networkMonitor, and other HTTP/network infrastructure (`app/core/` only) |
| `contexts/` | React context providers (`app/core/` only for shared context) |
| `middleware/` | router middleware (`app/core/` only) |
| `storage/` | local/session storage adapters (`app/core/` only) |
| `kernel/` | singleton state machines that manage auth/location state **outside React** (`app/core/` only) |

If your code doesn't fit any of these, create a new specific category (`comparators/`, `calculations/`, `transforms/`, `value-objects/`, `validators/`, `parsers/`). **Never reach for `utils/`, `helpers/`, `lib/`, or `misc/`.** Those names are smells — they let unrelated code accumulate in a junk drawer that nobody can navigate six months later.

## Data fetching pattern

Data fetching has three layers. Each has a distinct responsibility.

**Layer 1 — `queries/*Queries.ts`**: plain `async` functions that call `apiClient`, plus any synchronous URL builder helpers for that same resource (e.g. `getPhotoUrl`). URL builders do NOT belong in `services/` or `formatters/` — they are resource knowledge and live alongside the fetch functions that use the same URLs. No React, no hooks. Named after the resource (e.g., `partQueries`, `unitInventoryQueries`). These are called from both `clientLoader`/`clientAction` (React Router) and from `queryFn` inside `useQuery`.

```typescript
// queries/partQueries.ts
export const partQueries = {
  fetchAll: async (criteria: PartSearchCriteria): Promise<PartListResponse> => {
    const params = new URLSearchParams({ locationId: criteria.locationId, ... });
    return apiClient.get<PartListResponse>(`${API_CONFIG.baseUrl}/parts?${params}`, { ... });
  },
};
```

**Layer 2 — `queries/*QueryKey.ts`**: query key factory objects. Pure constants/functions — no async, no React. Used in both `clientLoader` (`queryClient.ensureQueryData`) and `hooks/` to keep cache keys consistent.

```typescript
// queries/partQueryKey.ts
export const PART_QUERY_KEYS = {
  list: (locationId: string, filters?: Record<string, unknown>) =>
    ['parts', locationId, 'list', filters ?? {}] as const,
  detail: (id: string) => ['parts', 'detail', id] as const,
} as const;
```

**Layer 3 — `hooks/use*.ts`**: TanStack Query wrappers. Thin glue that combines a `*Queries` function + a `*QueryKey` + location context into a `useQuery` or `useMutation` call. Components call hooks; they never call `*Queries` or manipulate query keys directly.

```typescript
// hooks/useParts.ts
export function useParts(options: UsePartsOptions = {}) {
  const { currentLocation, locationToken, refreshLocationToken } = useLocation();
  return useQuery({
    queryKey: PART_QUERY_KEYS.list(currentLocation?.id ?? '', options),
    queryFn: ({ signal }) => partQueries.fetchAll({ ...options, signal, token: locationToken }),
    enabled: !!currentLocation?.id && !!locationToken,
  });
}
```

### Auth & location context in loaders

Loaders and middleware run outside React — they cannot use hooks or React context. Auth and location state are provided via **kernel singletons** (`authKernel`, `locationKernel` in `app/core/kernel/`) injected into the router via `createRouterContext()` in `entry.client.tsx`.

To access location/token inside a loader or middleware:
```typescript
const { locationToken, locationId } = context.get(RESOLVED_LOCATION_CONTEXT);
```

`RESOLVED_LOCATION_CONTEXT` is set by `authClientMiddleware` before any loader runs. Do not re-implement this — always read from context.

### Middleware

Protected routes declare middleware as a named export on the layout route file:
```typescript
// ProtectedLayout.tsx
export const clientMiddleware = [authClientMiddleware];
export default function ProtectedLayout() { return <Outlet />; }
```

Middleware runs before loaders. Auth and location resolution live here — not in individual loaders.

### React Router v7 — `clientLoader` and `clientAction`

Route files (`.tsx` pages) export `clientLoader` and `clientAction` alongside the default component. These are **not hooks** — they run outside React and call `*Queries` functions directly.

- `clientLoader` — prefetches data into the TanStack Query cache via `queryClient.ensureQueryData` before the component mounts. Always use `ensureQueryData` (not `fetchQuery`) so cached data is reused.
- `clientAction` — handles form submission. Reads `FormData` from `request.formData()`, calls a `*Queries` mutation function, then invalidates affected query keys via `queryClient.invalidateQueries`.

```typescript
// PartCreate.tsx (route file)
export async function clientLoader({ context }: ClientLoaderFunctionArgs) {
  const { locationToken } = context.get(RESOLVED_LOCATION_CONTEXT);
  await queryClient.ensureQueryData({
    queryKey: PART_QUERY_KEYS.partStatusCodes(),
    queryFn: ({ signal }) => partQueries.fetchPartStatusCodes({ signal, token: locationToken }),
  });
  return null;
}

export async function clientAction({ request, context }: ClientActionFunctionArgs) {
  const { locationToken, locationId } = context.get(RESOLVED_LOCATION_CONTEXT);
  const formData = await request.formData();
  const result = await partQueries.createMultipart(formData, locationToken);
  await queryClient.invalidateQueries({ queryKey: PART_QUERY_KEYS.all(locationId) });
  return { success: true, partNumber: result.partNumber };
}
```

Components read action results and navigation state via hooks — not via `useMutation`:
```typescript
const actionData = useActionData<typeof clientAction>();
const { state } = useNavigation();
const isSubmitting = state === 'submitting';
```

### HydrateFallback and ErrorBoundary

- `HydrateFallback` — export **only from `root.tsx`**. Never add it to individual route files.
- `ErrorBoundary` — export from `root.tsx` (global fallback) **and** from any route file that can produce a navigation-level error (404, 403). In-page errors (failed queries, mutations, validation) are shown inline — they do not go to ErrorBoundary. When an error boundary is complex, extract it to a dedicated `*ErrorBoundary.tsx` file and re-export it from the route: `export { UnitInventoryEditErrorBoundary as ErrorBoundary }`.

### DataGrid columns

Column definitions are plain functions, not components. They live in a `columns.tsx` file at the feature root (not inside `components/`):

```typescript
// pages/parts/columns.tsx
export function getPartListColumns(t: TFunction<'parts'>): GridColDef[] { ... }
```

In the component, wrap in `useMemo` — MUI DataGrid compares column references and recomputes layout on every new array reference:
```typescript
const columns = useMemo(() => getPartListColumns(tParts), [tParts]);
```

This re-computes automatically when the language changes. This is one of the few justified `useMemo` uses — see `coding-standards-frontend.md` for the full list.

### Localization (i18n)

- One translation namespace per feature, matching the feature folder name (`'parts'`, `'workOrders'`, `'unitInventory'`).
- In components: `const { t } = useTranslation('parts');`
- In column definitions: accept `t: TFunction<'namespace'>` as a parameter — do not import `i18n` directly in column files unless unavoidable.
- Translation files: `app/locales/{en,fr}/{namespace}.json`. Every user-visible string goes through `t()`.

## The "are these helpers about one thing?" test

When you have a bundle of related functions, check before creating a folder:

**One concept → one file with multiple exports** (the value-object pattern):
```typescript
// app/core/value-objects/length.ts — parse, validate, normalize, format all in one file
export function normalizeLength(raw: string): string { ... }
export function isValidLengthFormat(value: string): boolean { ... }
export function formatLengthForDisplay(length: string, locale: string): string { ... }
```

**Multiple concepts → split by file, group by category folder:**
```
formatters/
  length.ts        ← all length-related
  vin.ts           ← all VIN-related
  registration.ts  ← all registration-related
```

Don't fragment a single concept across `parsers/length.ts`, `validators/length.ts`, `formatters/length.ts` — that splits cohesive code for the sake of category purity.

## When to promote (private → folder)

A function starts as a private (non-exported) helper inside its consumer file. Promote to a category folder only when:

1. A second consumer needs it, **or**
2. It has meaningful logic worth unit-testing in isolation (per `frontend-testing.md`), **or**
3. Bundling it as a module clarifies the page's architecture

Don't pre-create empty `formatters/` or `constants/` folders "for future use." Names should follow files, not anticipate them.

## Constants — name files by concept, never `constants.ts`

`constants/constants.ts` is a junk-drawer pattern (the validate-standards hook warns on it). Inside a `constants/` folder, **each file is a named concept**:

```
constants/
  pagination.ts     ← DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
  statusChipColor.ts ← STATUS_CHIP_COLOR
  formMode.ts       ← EDIT, CREATE form-mode discriminators
  billType.ts       ← BILLTYPE_WARRANTY, BILLTYPE_INTERNAL
```

**Three checks before adding a file to `constants/`:**

1. **What concept is this file about?** If you can't name it in a specific noun, the value probably belongs somewhere more specific.
2. **Is there a more specific category folder this belongs in?** Query-key discriminators belong in `queries/`, not `constants/`. Type discriminators (`'edit' | 'create'`) belong in `types/` as a real union, not in `constants/` as raw strings. The more specific category wins.
3. **Is this duplicating a constant in `core/`?** If yes, import from core instead of redefining.

A `constants/` file with a single isolated value (`taxCode.ts` containing only `TAX_EXE = 'EXE'`) is a smell unless the file is genuinely the home of a *concept* with growth potential. Otherwise the value belongs inline at the consumer or as a type literal.

## `components/` folders hold `.tsx` only

A `components/` folder is for React components. **A `.ts` file inside `components/` is a violation** — it means logic that's not a component leaked in (typically a calculation, helper, or hook utility someone dumped next to its consumer).

Move the file to a specific category:
- Math / business calculation → `calculations/`
- Parse / format / normalize → `formatters/`
- Sort / compare → `comparators/`
- Pure data transform → `transforms/`
- Domain primitive → `value-objects/`
- React hook utility → `hooks/`

The validate-standards hook and `check:standards` script both flag any `.ts` directly in `components/`.

## Types belong with their owning area, never at `app/` root

There is no `app/types/` folder.

| Type's scope | Lives in |
|---|---|
| Used inside one feature | `app/pages/<feature>/types/<concept>.ts` |
| Used inside one `core/` subfolder | the closest meaningful spot — e.g., `app/core/contexts/auth/types.ts` for auth-related types |
| Genuinely cross-cutting (used by multiple `core/` subfolders or by both `core/` and `pages/`) | `app/core/types/<concept>.ts` |

Don't preemptively create `app/core/types/` — only when a real cross-cutting type appears. Single-file `app/types/` directories are a smell ("one file is not a category").

## Forbidden

- `utils/`, `helpers/`, `lib/`, `misc/`, `common/` as folder names
- `constants/constants.ts` — name files by concept
- `.ts` files directly inside any `components/` folder
- A top-level `app/types/` folder
- `app/contexts/` — shared context belongs in `app/core/contexts/`
- `app/config/` — config belongs in `app/core/config/`
- Barrel files (`index.ts`) — see `coding-standards-core.md`. Each consumer imports the source file directly. The single intentional barrel is `@ids/data-models`.
- Single-letter or numbered category folders (`u1/`, `f/`)
- "General" category folders that aren't actually general (anything you can't name in one specific noun)
