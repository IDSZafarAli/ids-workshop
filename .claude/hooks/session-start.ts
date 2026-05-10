// SessionStart hook — prints a concise Non-Negotiable summary into session context
// so Claude has the highest-risk rules in mind before the first edit.
// Output to stdout is injected as additional context. Exit 0.

import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const SUMMARY = `[IDS Cloud DMS — Non-Negotiable rules summary]

Backend (apps/astra-apis):
  • Controllers return *ResponseDto, never entities. Mapping lives in <entity>.mapper.ts.
  • Every RavenDB query filters by locationId (except global entities).
  • Paginated queries: .orderBy() before .skip()/.take(). Filter & sort in the query, never in JS.
  • Private vars prefixed with _ ; private methods plain camelCase.
  • Interfaces prefixed with I (backend only).
  • Partial update guard: 'if (dto.field !== undefined)', never 'if (!dto.field)'.
  • Mappers use ?? null (not ?? undefined). DTO enum fields require @IsEnum().

Frontend (apps/client-web):
  • All HTTP through apiClient — no bare fetch().
  • MUI: sx prop only (no styled()), path imports only (no barrel).
  • Components: function declarations ('export function Foo()'), one component per file.
  • .tsx PascalCase, .ts camelCase. No I prefix on interfaces.
  • Locale-aware formatting via MoneyField/DecimalField/DateDisplay or useFormat* hooks.
  • Data fetching via useQuery/useMutation — never useEffect(async ...).
  • Dates in state as ISO 8601 strings, never Date objects.
  • parseLocaleNumber() not parseFloat(); no manual AbortController.
  • useEffect only for DOM subscriptions, timers, Blob URL cleanup. Never for derived state,
    form init from props, or notifying parents. Use plain variables, RHF reset(), or key prop instead.
  • useMemo/useCallback only when reference stability is proven necessary (DataGrid columns,
    React.memo children). Plain variables for everything else — Array.find/filter are free.

Workflow:
  • Plan-first for any change spanning 2+ files, DB work, business logic, or new features.
  • "yes" alone = approval. "yes, but/and..." or any extra detail = clarification, do NOT implement.
  • Never auto-commit, push, or add Co-Authored-By trailers. Confirm per turn.
  • Never use --no-verify or any hook-bypass flag.

Full rules: docs/standards/coding-standards-{core,backend,frontend}.md
RavenDB: docs/standards/ravendb-document-design.md
`;

let caseStudyLine = '';
const csIndexPath = join(process.cwd(), '.ai-memory/case-studies/index.md');
if (existsSync(csIndexPath)) {
  const activeCount = readFileSync(csIndexPath, 'utf-8')
    .split('\n')
    .filter((l) => /^\| active /.test(l)).length;
  if (activeCount > 0) {
    caseStudyLine = `\nCase Studies: ${activeCount} active — check .ai-memory/case-studies/index.md before diagnosing repeated failures or tool quirks.`;
  }
}

process.stdout.write(SUMMARY + caseStudyLine);
process.exit(0);
