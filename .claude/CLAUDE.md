# IDS Cloud DMS — Claude Code Instructions

@../docs/standards/coding-standards-core.md

> This file is auto-loaded every conversation. Keep it lean — detailed standards live in `docs/standards/`.

---

## Mandatory First Action — Read Standards Before Code

`coding-standards-core.md` is auto-loaded via `@` import above. **Before writing a single line of code**, read the layer-specific standards for the area you are touching. This is not optional — the standards govern every implementation decision, and the Non-Negotiable Rules at the top of each file are enforced.

| File | When | Status |
|---|---|---|
| `docs/standards/coding-standards-backend.md` | Any edit under `apps/astra-apis/**` | **Mandatory** |
| `docs/standards/coding-standards-frontend.md` | Any edit under `apps/client-web/**` | **Mandatory** |
| `docs/standards/ravendb-document-design.md` | RavenDB entities, indexes, queries, or document schema changes | **Mandatory for that work** |
| `docs/standards/file-upload-standards.md` | File uploads, binary attachments, image handling | **Mandatory for that work** |
| `docs/architecture/web-client-architecture.md` | Frontend feature modules, forms, routing, auth flow | Read when unfamiliar |
| `.ai-workflow/.ai-project-architecture.md` | Adding features or unfamiliar with structure | Read when unfamiliar |
| `.ai-workflow/.agent.md` | Planning, complex tasks | Read when unfamiliar |

**Skipping mandatory reads is the root cause of most standards violations.** If the work is trivial enough to skip the read (typo, comment edit, formatting), it is also trivial enough that no standards rule is at stake. For anything else, read first.

## Skills

When working in these areas, read the linked skill file before writing code:

| Task / Code Area | Skill |
|---|---|
| Data fetching, `useQuery`/`useMutation`, query config, cache invalidation | `.claude/skills/tanstack-query/SKILL.md` |
| Routes, `clientLoader`, `clientAction`, forms, navigation, error boundaries | `.claude/skills/react-router-framework-mode/SKILL.md` |
| React Hook Form setup, validation, field arrays, MUI integration | `.claude/skills/react-hook-form/SKILL.md` |
| RavenDB sessions, queries, indexes, `locationId` filtering, paginated queries | `.claude/skills/ravendb-queries/SKILL.md` |
| NestJS feature modules — controllers, services, DTOs, mappers, partial updates | `.claude/skills/nestjs-feature-module/SKILL.md` |
| Throwing or handling RFC 9457 Problem Details errors (backend + frontend) | `.claude/skills/problem-details-errors/SKILL.md` |
| File uploads & RavenDB attachments — multipart, validation, image variants | `.claude/skills/file-uploads-attachments/SKILL.md` |
| Money type & locale-aware formatting — cents storage, MoneyField, useFormat* | `.claude/skills/money-and-formatting/SKILL.md` |
| Playwright E2E tests — Logto auth, location selection, stable selectors, timing | `.claude/skills/playwright-e2e/SKILL.md` |
| GitHub PR interactions — posting a review, resolving open comment threads and replying | `.claude/skills/pr-review-github/SKILL.md` |
| Gate failures, tool quirks, non-obvious repairs, or repeated mistakes | `.claude/skills/case-study-memory/SKILL.md` |

---

## Plan-First Workflow

**Create a plan and get explicit approval before implementing for:**

- Changes affecting 2+ files
- Any database / RavenDB changes (schema, queries, indexes)
- New features or significant modifications
- Business logic, service, or handler changes
- API endpoint changes (add, modify, remove)
- Component architecture changes (React components, pages, routing)
- Authentication, authorization, or security-related changes
- Any work where scope or approach is unclear
- Complex bug fixes spanning multiple layers

**Trivial — no plan needed:** single-line text/string changes, typos, formatting, comments, simple CSS (color, size, spacing only), single-method variable renames with no side effects.

### Workflow Steps

1. Check `.ai-plan/` for an existing plan for this feature
2. If none exists, create one using `.ai-workflow/.ai-plan-template.md` as template
3. Present the plan summary and ask: "Should I proceed?"
4. **Wait** — do not write code until explicit approval
5. If user answers questions or provides clarifications → update plan, ask again (NOT auto-approved)
6. After approval → update plan Status to "In Progress", then implement
7. If you discover additional scope mid-implementation → stop, update plan, get new approval
8. When complete → update plan Status to "Completed"

**Plans found in `.ai-plan/` from previous sessions are NOT pre-approved.** Present and ask every time.

---

## Clarification vs. Approval

This is critical. **These are clarifications — do NOT implement:**

- "yes, but..." / "yes, and..." / "yes" + anything else
- Additional requirements, specifications, or details added after "yes"
- "we should use..." / "make sure..." / "instead of X, use Y"
- Questions about the implementation
- "also..." / "additionally..."
- User-provided code examples (a suggestion, not approval)

**These are approval — proceed:**

- "go ahead" / "proceed" / "implement"
- "looks good" / "sounds good" / "do it"
- "yes" **only** as a standalone response with nothing else

---

## Git, Commits & Push Policy

See `.claude/rules/git-policy.md` (loaded at session start) for the full commit format spec, commit/push approval policy, and Co-Authored-By rule.

---

## Commands Quick Reference

The Stop hook (`post-task-check.ts`) runs these in parallel after every task. Run them manually if you want to verify mid-task:

| Script | What it does |
|---|---|
| `npm run lint:check` | Biome lint across the workspace |
| `npm run check:standards:changed` | Standards validator on changed files |
| `npm run typecheck:apis` | `tsc --noEmit` for `apps/astra-apis` |
| `npm run typecheck:web` | `tsc --noEmit` for `apps/client-web` |
| `npm run test:apis` | Vitest unit tests — backend (`nx test astra-apis`) |
| `npm run test:web` | Vitest unit tests — frontend (utilities only; no component tests) |
| `npm run dev:apis` | Start NestJS backend in watch mode |
| `npm run dev:web` | Start React frontend dev server |

E2E tests live in `apps/astra-apis-e2e/` and `apps/client-web-e2e/` — invoke via Nx (`nx e2e <project>`), not the npm scripts above.

### Workflow Commands

| Command | What it does |
|---|---|
| `/handoff` | Create a concise session handoff for the next agent or session |
| `/resume-handoff` | Load the latest (or a specified) handoff and propose next steps |
| `/curate-case-studies` | Review case-study memory for stale, duplicate, or promotable lessons |

See `docs/commands-guide.md` for full usage, arguments, and when to use each command.

---

## Architecture Quick Reference

**Project**: Nx monorepo — NestJS backend (`apps/astra-apis/`), React frontend (`apps/client-web/`).

- **Multi-tenancy**: A tenant = a `Location`. Data is scoped by `locationId` on every entity. Queries **must always filter by `locationId`** unless the entity is explicitly global/system-level.
- **Database**: RavenDB for application data (`ids_db`). PostgreSQL for Logto auth (`logto_db`). Both in `docker-compose.yml`.
- **Auth**: Logto (OAuth 2.0 / OIDC). Backend validates JWT via `@logto/node`. Guards check permissions; location context flows from auth into queries.
- **Shared library**: Always import from `@ids/data-models` — it's the single intentional barrel export.
- **Navigation**: Always list `apps/astra-apis/src/` and `apps/client-web/app/` to discover module structure before making changes.

See `.ai-workflow/.ai-project-architecture.md` for full architecture, non-obvious facts, DTO patterns, and naming conventions.

---

## Subagents

**Default: implement directly.** For large tasks with clearly separable backend + frontend work (e.g. a full feature spanning NestJS services and React pages), ask the user if they'd like to delegate before proceeding. Single-domain tasks — even large ones — stay direct. Never auto-delegate; only delegate without asking when the user explicitly requests it (e.g., "delegate this to ids-coder", "use a subagent", "run in parallel"). Available specialists:

| Agent | Use for |
|---|---|
| `ids-coder` | Backend implementation (NestJS, RavenDB, services, DTOs, controllers) |
| `ids-designer` | Frontend implementation (React, MUI, hooks, pages, routing) |
| `ids-code-review` | Full code review (orchestrates security, performance, testing, clean-code) |
| `ids-security-specialist` | Security scan — secrets, injection, PII, auth gaps |
| `ids-performance-specialist` | Performance analysis — N+1, React renders, RavenDB queries |
| `ids-clean-code-specialist` | Standards compliance and maintainability review |
| `ids-testing-specialist` | Test coverage, quality, and testing best practices |
| `ids-git-assistant` | Git commits (propose 2 options), PR creation with full description template |
| `ids-team-lead` | Planning, architecture decisions, and orchestration of backend + frontend delegation |
| `ids-e2e-assistant` | Write and repair Playwright E2E tests — location-tenant aware, seed-data aware, two-phase repair loop |
| `ids-doc-assistant` | Post-implementation feature docs — ERDs, user journeys, business rules from code |
| `ids-onboarding` | Guide new developers through local setup, troubleshooting, and architecture overview |
