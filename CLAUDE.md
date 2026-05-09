# IDS AI Skeleton — Claude Code Instructions

> This file is auto-loaded every conversation. Keep it lean — detailed standards live in `docs/`.

---

## Context Files

Load these before writing any code. Read standards **before** reading project source files — they inform how you analyze code.

| File | When |
|---|---|
| `docs/CODING_STANDARD.md` | **Always** when writing code |
| `docs/DESIGN_STANDARD.md` | Frontend work (`apps/client-web/**`) — MUI, forms, search, grid |
| `docs/ARCHITECTURE.md` | Adding features, routing, auth flow, or unfamiliar with structure |
| `docs/TECHNOLOGY_OVERVIEW.md` | Understanding the tech stack, business context, or multi-tenancy model |
| `.ai-workflow/.agent.md` | Planning, complex tasks |

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

## Commit Format

All commits must follow this format (enforced by commitlint):

```
<type>: <subject>
```

**Allowed types:** `chore` `doc` `feat` `fix` `minor` `refact` `tool` `ux`

**Subject rules:**
- Start with lowercase — `add feature` ✅, `Add feature` ❌
- 10–99 characters
- Present tense ("add" not "added")
- Space after colon — `feat: add...` ✅

When committing: always propose 2 options (concise, standard). Wait for user selection before committing.

**Never `git push` without explicit user permission.** Always stop after committing and wait to be told to push.

---

## Architecture Quick Reference

**Project**: Nx monorepo — NestJS backend (`apps/astra-apis/`), React SSR frontend (`apps/client-web/`).

**Non-obvious facts:**
- **Multi-tenancy**: A tenant = a `Location`. Data is scoped by `locationId` on every entity. Queries **must always filter by `locationId`** unless the entity is explicitly global/system-level.
- **Database**: RavenDB for application data (`ids_db`). PostgreSQL for Logto auth (`logto_db`). Both in `docker-compose.yml`.
- **Auth**: Logto (OAuth 2.0 / OIDC). Backend validates JWT via `@logto/node`. Guards check permissions; location context flows from auth into queries.
- **SSR**: React Router configured `ssr: false`. Use `clientLoader` (not `loader`) for data fetching in protected routes.
- **Shared library**: `@ids/data-models` (`libs/shared/data-models/`) — single intentional barrel export. Always import from `@ids/data-models`.
- **Navigation**: Always list `apps/astra-apis/src/` and `apps/client-web/app/` to discover module structure before making changes.

See `docs/ARCHITECTURE.md` for full folder layout, auth flow, and data flow conventions.

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
| `ids-doc-assistant` | Post-implementation feature docs — ERDs, user journeys, business rules from code |
| `ids-onboarding` | Guide new developers through local setup, troubleshooting, and architecture overview |
