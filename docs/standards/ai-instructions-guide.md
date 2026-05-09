# AI Instruction System - Setup Guide

---
**Version**: 3.2.0 | **Updated**: 2026-02-25
---

> **📌 NOTE**: This file is for human developers to understand the AI instruction system. AI agents should focus on `.github/copilot-instructions.md` (auto-loaded) and the on-demand files in `.ai-workflow/`. Only reference this file if a user explicitly asks about the AI system setup.

---

This document explains how the AI instruction system works in this project. It's designed to help developers understand how GitHub Copilot and other AI assistants use structured context files to assist with development.

## How the AI Instruction System Works

The system uses a lean, modular set of instruction files — one auto-loaded entry point plus on-demand standards files:

1. **`.github/copilot-instructions.md`** — Entry point & workflow
   - **Purpose**: Context loading protocol, planning workflow, approval rules, state tracking, pre-implementation checklist
   - **Auto-loaded**: YES — GitHub Copilot loads this automatically

2. **`.ai-workflow/.agent.md`** — AI behavior & decision framework
   - **Purpose**: Senior engineer mindset, core behaviors, escalation triggers
   - **Auto-loaded**: NO — load for planning + implementation

3. **`.ai-workflow/.ai-project-architecture.md`** — Project structure
   - **Purpose**: Nx monorepo folder layout and non-obvious architectural facts (multi-tenancy, databases, SSR, auth)
   - **Auto-loaded**: NO — load when adding features or discussing architecture

4. **`docs/standards/coding-standards-core.md`** — Core TypeScript & database standards
   - **Purpose**: TypeScript strict mode, naming conventions, database snake_case, control structures, import paths, documentation standards
   - **Auto-loaded**: NO — ALWAYS load when coding (both backend and frontend)
---
5. **`docs/standards/coding-standards-backend.md`** — Backend standards (NestJS & RavenDB)
   - **Purpose**: NestJS patterns, RavenDB queries, DI, controllers, services, DTOs, guards, backend testing
   - **Auto-loaded**: NO — conditional, load only for backend work

6. **`docs/standards/coding-standards-frontend.md`** — Frontend standards (React)
   - **Purpose**: React hooks, performance, component patterns, styling, accessibility, frontend testing
   - **Auto-loaded**: NO — conditional, load only for frontend work

7. **`docs/standards/file-upload-standards.md`** — File upload & attachment standards
   - **Purpose**: Layered architecture, validation patterns, image processing pipeline, naming conventions, checklist, and future plans for all file/image upload features
   - **Auto-loaded**: NO — load when working on file uploads, image handling, or binary attachments

8. **`.ai-workflow/.ai-plan-template.md`** — Implementation plan template
   - **Purpose**: Standard plan structure with required sections
   - **Auto-loaded**: NO — load when creating implementation plans

9. **`.ai-workflow/.ai-ralph-plan-template.md`** — RALPH phase plan template
   - **Purpose**: Roadmap-phase plan structure for `ids-intake`, plan gates, and resume-friendly autonomous runs
   - **Auto-loaded**: NO — load when producing `.ai-plan/{ticket}-{phase}-plan.{md,json}` artifacts for `RALPH`

**Key Distinction:**
- `.github/copilot-instructions.md` = Workflow + process rules (auto-loaded, self-contained)
- `.ai-workflow/.agent.md` = Behavioral mindset and decision-making approach
- `.ai-workflow/.ai-project-architecture.md` = Project structure and organization
- `docs/standards/coding-standards-core.md` = Shared TypeScript & database standards (always load when coding)
- `docs/standards/coding-standards-backend.md` = NestJS/RavenDB patterns (conditional)
- `docs/standards/coding-standards-frontend.md` = React patterns (conditional)
- `docs/standards/file-upload-standards.md` = File upload & attachment rules (conditional)

AI agents automatically read and apply these files based on your workspace configuration and the type of work being performed.

---

### Why Separate Files?

**Each file has a distinct purpose:**
- **copilot-instructions** = Workflow engine ("Do I need a plan? Can I proceed? What files to load?")
- **agent.md** = Behavioral principles ("What should I prioritize? How should I think?")
- **ai-project-architecture** = Structural context ("What is this project? How is it organized?")
- **coding-standards-core** = Shared coding rules ("How do I write TypeScript correctly?")
- **coding-standards-backend.md/frontend** = Layer-specific patterns ("How do I write NestJS/React code?")

**Analogy:**
- **copilot-instructions** = Company handbook (procedures, workflows, rules)
- **agent.md** = Company values (principles, mindset, culture)
- **ai-project-architecture** = Office floor plan (where things are, how they're organized)
- **coding-standards-core** = Technical manual (how to do the work)
- **coding-standards-backend.md/frontend** = Department-specific manuals (how to do specialized tasks)

**Best Practice: Keep Context Focused**
- ✅ Structured, modular files that load on-demand
- ✅ Clear separation of concerns (no duplicate content)
- ✅ **Conditional loading based on work context** (see below)
- ❌ Don't create 1000+ line mega-files that AI must process every time
- ❌ Avoid feeding irrelevant context

---
**Conditional Loading Strategy (IMPORTANT):**
The system implements smart context loading based on where you're working:

| Work Context | Files Loaded (on-demand) |
|--------------|--------------------------|
| **Backend work** (`apps/astra-apis/`) | Auto + Agent + Core Standards + Backend |
| **Frontend work** (`apps/client-web/`) | Auto + Agent + Core Standards + Frontend |
| **Full-stack work** (both layers) | Auto + Agent + Core + Backend + Frontend |
| **Planning only** (no code yet) | Auto + Agent + Architecture |

**Why this matters:**
- ✅ Frontend-only work doesn't load irrelevant NestJS/RavenDB patterns
- ✅ Backend-only work doesn't load irrelevant React/hooks patterns
- ✅ Core standards are ALWAYS loaded when coding (TypeScript + database naming shared across layers)
- ✅ Architecture file loads only when adding features or understanding structure
- ✅ Prevents context pollution and token waste

**Example Scenario:**
```
❌ BAD: Loading everything every time — backend patterns pollute a frontend fix
✅ GOOD: React component fix — loads Auto + Agent + `docs/standards/coding-standards-core.md` + `docs/standards/coding-standards-frontend.md` only
✅ GOOD: NestJS service fix — loads Auto + Agent + `docs/standards/coding-standards-core.md` + `docs/standards/coding-standards-backend.md` only
✅ GOOD: Planning only — no coding standards loaded yet
```

**Result:** ~30-55% reduction in loaded context for focused work, improving AI response quality and speed.

---
## Development Environments
This project uses VS Code as the primary development environment with GitHub Copilot integration.

### Single Workspace Configuration

The project is a single Nx monorepo workspace containing:
- Backend (NestJS) in `apps/astra-apis`
- Backend E2E tests (Vitest) in `apps/astra-apis-e2e`
- Frontend (React) in `apps/client-web`
- Frontend E2E tests (Playwright) in `apps/client-web-e2e`
- Shared libraries in `libs/shared`

All AI context files work seamlessly with VS Code and GitHub Copilot.

---

## Custom Agents (`.github/agents/`)

This project uses **custom GitHub Copilot agents** to separate concerns and optimize the AI context window. Each agent runs in its own context, meaning its instructions, conversation history, and loaded files don't consume tokens from other agents.

### Feature Work: Direct Agent vs. Team Lead Orchestration

For **feature building and coding**, there are two approaches:

1. **Direct Copilot agent** — You invoke the default agent (or a single agent with full tool access). It follows the same plan-first protocol from `copilot-instructions.md`, but it loads everything into one context: architecture, planning rules, coding standards, conversation history. This works for small tasks but becomes **context-heavy** as the session grows.

2. **Team Lead orchestration (recommended)** — You invoke `@ids-team-lead`, which acts as a **software architect**. It designs the solution, creates the plan, gets approval, then delegates implementation to specialist subagents (`@ids-coder` for backend, `@ids-designer` for frontend). Each subagent gets a **fresh, focused context window** — it only loads coding standards relevant to its domain, not the planning overhead. The team lead never loads coding standards, and subagents never load planning rules.

> [!TIP]
> **Use `@ids-team-lead` for all feature work.** It is significantly more context-efficient because planning context and implementation context are separated into independent context windows.
---
### Specialized Task Agents

Beyond feature work, the project has **specialized agents for specific recurring tasks**:

| Agent | File | Purpose |
|-------|------|---------|
| **Git Assistant** | `ids-git-assistant.agent.md` | Assists with consistent Git commit messages by analyzing changes and presenting 2 options (concise, standard). Also generates professional PR titles and descriptions. |
| **Code Review** | `ids-code-review.agent.md` | Runs a thorough local code review **before creating a PR**. Orchestrates 4 specialist subagents (security, performance, clean code, testing) in parallel, then synthesizes their findings into one actionable report. |
| **Doc Assistant** | `ids-doc-assistant.agent.md` | Post-implementation feature documentation generator. Reads the codebase to produce feature docs with user journeys, ERDs, business rules, and Marp presentation slides. |
| **Onboarding** | `ids-onboarding.agent.md` | Guides new developers through environment setup — prerequisites, Docker services, database initialization, dev servers, and first login. |

---
### Subagents (Not Directly Invokable)

These agents are invoked only by their orchestrator — users do not invoke them directly:

**Team Lead subagents:**

| Agent | File | Purpose |
|-------|------|---------|
| **Coder** | `ids-coder.agent.md` | Backend & full-stack implementation. Receives tasks from team lead, loads backend standards, executes, and reports. |
| **Designer** | `ids-designer.agent.md` | Frontend & UI implementation. Receives tasks from team lead, loads frontend standards, executes, and reports. |

**Code Review subagents:**

| Agent | File | Purpose |
|-------|------|---------|
| **Security Specialist** | `ids-security-specialist.agent.md` | Deep security analysis across all file types (code, docs, configs). |
| **Performance Specialist** | `ids-performance-specialist.agent.md` | RavenDB query optimization, React rendering, bottleneck detection. |
| **Clean Code Specialist** | `ids-clean-code-specialist.agent.md` | IDS coding standards compliance and maintainability. |
| **Testing Specialist** | `ids-testing-specialist.agent.md` | Test coverage, quality, and testing best practices. |
---
### How It Works

**Feature work (`@ids-team-lead`):**
```
User invokes @ids-team-lead
  → Architect creates plan, gets approval
  → Delegates backend steps to @ids-coder (separate context)
  → Waits for completion, reports to user
  → Delegates frontend steps to @ids-designer (separate context)
  → Reports final results
```

**Local code review (`@ids-code-review`):**
```
User invokes @ids-code-review
  → Analyzes git diff, categorizes files
  → Triggers 4 specialists in parallel (each in own context)
  → Synthesizes, deduplicates, and saves report
  → Presents summary before PR is created
```

### Context Window Savings

| Scenario | Direct Agent (one context) | Team Lead Orchestration |
|----------|---------------------------|------------------------|
| **Full-stack feature** | All planning + coding context in one window | Lead + Coder + Designer — each in a separate, focused window |
| **Code review** | All 4 disciplines in one window | Each specialist gets only their focused rules |
| **Bug investigation + fix** | Everything in one window | Lead investigates, delegates fix to Coder — separate windows |
---
### When to Create New Agents

> [!CAUTION]
> **Avoid the Swiss Army knife anti-pattern.** Do not create a subagent for every domain (e.g., a database agent, an auth agent, a logging agent). The `@ids-coder` and `@ids-designer` already cover these domains — they receive focused tasks from the team lead and apply the relevant standards. Over-fragmenting into many narrow subagents creates coordination overhead that outweighs any context savings.

**Create a new agent only when:**
- A task requires a **completely different workflow** from coding/designing (e.g., Git operations, onboarding have unique step-by-step protocols)
- You need **parallel execution** with different expertise (e.g., the 4 code review specialists run simultaneously)
- The task is **frequently repeated** and benefits from a dedicated, consistent protocol (e.g., commit message formatting)

**Do NOT create a new agent when:**
- The existing coder/designer can handle it with the right delegation prompt — this covers most domain-specific work (database, auth, API, etc.)
- The task is a one-off that doesn't justify the setup overhead
- Adding the agent creates more coordination complexity than it saves in context

**Rule of thumb:** The current agent setup covers the vast majority of use cases. Before creating a new agent, ask: *"Can the team lead just delegate this to the coder/designer with clear instructions?"* If yes, you don't need a new agent.

---

## Critical Planning Requirements

Before implementing complex changes, AI agents **must create an implementation plan** in the `.ai-plan/` folder for:
- Changes affecting 2+ files or classes
- Database/RavenDB changes
- New features or significant modifications
- Business logic or service changes
- Authentication, authorization, or security changes
- API endpoint changes
- Component architecture changes
- Complex bug fixes across multiple layers

**Plans must be approved** by explicit user confirmation ("go ahead", "proceed", "implement") before implementation begins.

See `.github/copilot-instructions.md` for the complete planning trigger list, approval workflow, and state tracking rules.

---

## Key Principles: What to Include in System Instructions

### Core Principle: Document Only Decided Patterns

**DO INCLUDE in system instructions:**
- ✅ Patterns currently implemented in the codebase
- ✅ Team-agreed architectural decisions
- ✅ Established coding standards and conventions
- ✅ Real-world problems encountered and their solutions
- ✅ Technology stack decisions (frameworks, libraries, versions)
- ✅ Project-specific rules (e.g., `--ids-` CSS prefix, snake_case database naming)

**DO NOT INCLUDE in system instructions:**
- ❌ Testing strategies (until team decides on approach)
- ❌ Observability patterns (until monitoring tools selected)
- ❌ Caching strategies (until caching approach decided)
- ❌ Logging frameworks (until team standardizes)
- ❌ Error handling patterns (until team agrees on approach)
- ❌ Performance monitoring (until tools and metrics decided)
- ❌ Background job patterns (until implementation chosen)
- ❌ API versioning strategy (until team designs approach)
- ❌ Security patterns beyond current implementation
- ❌ Deployment or CI/CD specifics (unless standardized)

---
### Why This Matters

**Prevents AI-Induced Technical Debt:**
- AI won't invent testing frameworks that conflict with future team decisions
- Avoids creating observability code that doesn't match eventual monitoring strategy
- Prevents inconsistent caching implementations across handlers
- Stops AI from making architectural decisions that belong to the team

**Example Scenario:**
```
❌ BAD: AI includes this in instructions without team decision:
"Always use Redis for caching with 5-minute TTL"
- Team might choose different caching (memory, distributed, none)
- Hard-coded TTL might not fit all scenarios
- Creates technical debt when team decides differently

✅ GOOD: Current approach:
Instructions say nothing about caching
- Team decides caching strategy when needed
- AI asks for guidance instead of assuming
- Consistent implementation once decided, then documented
```
---
### Living Documentation Principle

**Instructions are updated when:**
1. Real problems are solved (e.g., RavenDB query optimization patterns)
2. Team makes architectural decisions (e.g., choosing Material UI components)
3. Patterns are consistently implemented (e.g., Service pattern established)
4. Standards need clarification (e.g., explicit braces requirement)

**Instructions are NOT updated for:**
1. Speculative future features
2. Undecided architectural approaches
3. Theoretical best practices not yet adopted
4. Individual preferences without team consensus

---

## How to Use This System

### For VS Code
1. Open the IDS Cloud DMS workspace
2. GitHub Copilot automatically loads AI context from `.github/copilot-instructions.md`
3. Start coding - AI assistance is automatically configured

### Working with AI Assistants

AI agents automatically use the instruction files - you don't need to reference them explicitly. However, you can be specific in prompts:

**Examples:**
- "Create a new React component following project standards"
- "Add a new RavenDB entity using project conventions"
- "Create a NestJS service with proper error handling"

The AI will automatically apply the relevant coding standards and patterns from the instruction files.

---

## Maintaining the AI Instruction System

When project standards evolve, update the relevant instruction files:

**For coding standard changes:**
- Update appropriate standards file (core, backend, or frontend)
- **Core changes** (TypeScript, database naming): `docs/standards/coding-standards-core.md`
- **Backend changes** (NestJS, RavenDB): `docs/standards/coding-standards-backend.md`
- **Frontend changes** (React, hooks): `docs/standards/coding-standards-frontend.md`
- **DO NOT** duplicate across files

**For architecture changes:**
- Update `.ai-workflow/.ai-project-architecture.md` with new structure or patterns
- Examples: new apps added, folder reorganization, architecture pattern changes

**For workflow/process changes:**
- Update `.github/copilot-instructions.md` for planning triggers, approval rules, or state tracking
- Update `.ai-workflow/.agent.md` for decision-making frameworks and behavioral guidance

---
**Best practices:**
- **Always update version headers** when modifying instruction files
  - Increment version number (major.minor.patch)
  - Update "Last Updated" date
- **Keep instructions current** - actively maintain, don't just append
  - Remove outdated rules when patterns change
  - Update examples when better approaches are found
  - Delete deprecated patterns or mark them clearly
- **Single source of truth** - each standard lives in exactly one file
- **Respect file boundaries** - core vs backend vs frontend
- **Test AI behavior** after updates to ensure instructions work as intended
