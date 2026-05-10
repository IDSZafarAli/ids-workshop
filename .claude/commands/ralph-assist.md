---
description: "RALPH Assist — plan-driven implementation loop. Pass the plan path and optional flags."
argument-hint: "<plan-path> [--figma-url <url>] [--skip-slow] [--skip-mutation] [--skip-review]"
---

# RALPH Assist

You are now running RALPH Assist. Arguments provided: `$ARGUMENTS`

Parse `$ARGUMENTS`:
- First positional argument = `<plan-path>` (required)
- `--figma-url <url>` — Figma URL for design context (optional)
- `--skip-slow` — skip E2E gate
- `--skip-mutation` — skip mutation gate
- `--skip-review` — skip code review stage

---

## CRITICAL: You must complete ALL phases in sequence — do not stop after implementation or after the fast gate. Every gate below is mandatory unless the corresponding skip flag was passed.

---

## Phase 0 — Run-state bootstrap (DO THIS FIRST, NO EXCEPTIONS)

**This phase has one job: establish the run-state JSON before any other work happens. You cannot skip it. You cannot defer it. You cannot summarize it in your head and proceed.**

### Step 0.1 — Compute the path

`{basename}` = the plan filename without `.md` extension. State file path = `.ai-plan/runs/assist-{basename}-state.json`.

### Step 0.2 — Ensure the state file exists on disk

Use the **Read** tool to attempt to read the state file.

- **If Read succeeds:** the file exists. Note the current values of `plan_approved`, `derived_plan_path`, `design_guidance`, `clarifications`, `plan_edits`, `figma_url`, `iteration`. You will resume from these values.

- **If Read fails (file not found):** use the **Write** tool to create the file with the exact JSON below (substituting real values for `<plan-path>`, `<--figma-url value or null>`, and ISO timestamps for `<now>`):

  ```json
  {
    "plan_path": "<plan-path>",
    "plan_approved": false,
    "derived_plan_path": null,
    "figma_url": "<--figma-url value or null>",
    "design_guidance": [],
    "clarifications": [],
    "plan_edits": [],
    "iteration": 0,
    "created_at": "<now>",
    "updated_at": "<now>"
  }
  ```

### Step 0.3 — Acknowledge in the next message

In your next user-facing message, state one of:

- `Run-state bootstrapped: <path> (new)` — if you created it.
- `Run-state resumed: <path> (plan_approved=<bool>, derived_plan_path=<value>)` — if it existed.

**Do not proceed to Phase 1 without this acknowledgment.** It is the contract that proves you actually wrote the file. If you find yourself about to read the plan or ask the user a question without having done Step 0.2, stop and complete Phase 0 first.

---

## Phase 1 — Planning

The state file from Phase 0 is now your single source of truth for this run. **Every** transition below has a state-update side effect. After every state mutation, re-Read the file to verify the change persisted; if it did not, write it again.

### Step 1.1 — Read the plan

Read the plan markdown at `<plan-path>`.

### Step 1.2 — Design context (frontend/full-stack only)

If the plan includes frontend or full-stack work AND `figma_url` in the state file is `null` AND no `--figma-url` was supplied, ask the user for design context. Wait for the answer.

**State mutation:** when the user answers, append the answer to `design_guidance` in the state file and update `updated_at`. Then re-Read the file to confirm the append landed.

### Step 1.3 — Clarifications

Raise any ambiguous requirements as questions. Do not assume — wait for answers.

**State mutation:** for each `{question, answer}` pair, append it to `clarifications` and update `updated_at`. Re-Read to confirm.

### Step 1.4 — Derive the plan

Derive a concrete step-by-step implementation plan. Write it to `.ai-plan/runs/assist-{basename}-derived-plan.md`.

**State mutation (REQUIRED before presenting to user):** set `derived_plan_path` to the path you just wrote, update `updated_at`. Re-Read the state file to confirm `derived_plan_path` is no longer `null`. **Do not present the plan to the user until this verification succeeds** — the user's approval is meaningless if the state file doesn't have the path recorded.

### Step 1.5 — Present and wait for approval

Present the derived plan to the user. Stop. Wait for explicit approval before writing any code.

**State mutations on user response:**
- **Approval** ("yes", "looks good", "proceed"): set `plan_approved: true`, update `updated_at`, re-Read to confirm. Write a checkpoint handoff to `.ai-plan/handoffs/handoff-<timestamp>.md` (Purpose: "plan approved — beginning implementation for `<plan basename>`"; reference plan path, derived-plan path, and key clarifications from the state file — do not copy their content). Then continue to Phase 2.
- **Edit request** (user wants changes): append the revision text to `plan_edits`, update `updated_at`, re-Read. Update the derived plan markdown and re-present.
- **Decline** / start over: leave `plan_approved: false`. Address concerns and re-derive (back to Step 1.4).

---

## Phase 2 — Implementation + Gate loop

After approval, execute **all steps below in order**. Do not report done until every mandatory gate has passed.

### Phase 2 state-file contract (NON-NEGOTIABLE)

The run-state file from Phase 0 stays alive through the entire gate loop. You must mutate it at three specific moments. Skipping any of these breaks resume.

| Moment | Mutation | Verification |
|---|---|---|
| **Before each iteration of the gate loop** | Increment `iteration` by 1; update `updated_at` | Re-Read; confirm `iteration` advanced by exactly 1 |
| **When a gate fails and you begin repair** | Set `last_failure: {stage: "<gate-name>", failure_excerpt: "<first 50 lines of the failing gate's output>", failed_at: "<ISO>"}`; update `updated_at` | Re-Read; confirm `last_failure.stage` matches the failing gate |
| **When all gates pass and Phase 2 completes** | Set `completed_at: "<ISO>"`; clear `last_failure` to `null`; update `updated_at` | Re-Read; confirm `completed_at` is non-null |

**These are not optional. If you reach the end of Phase 2 without a `completed_at` in the state file, Phase 2 is not done — go back and write it.**

### Step 1 — Implement
Implement per the approved derived plan. Do backend and frontend work directly; only delegate to `ids-coder` or `ids-designer` if the user explicitly requests it.

### Step 2 — Fast gate (MANDATORY)
Run all of these and repair any failures before proceeding:
```
npm run lint:check
npm run check:standards:changed
npm run typecheck:apis
npm run typecheck:web
npm run test:apis
npm run test:web
```

### Step 3 — Slow gate (mandatory unless `--skip-slow` was passed)

Reset the environment, then delegate to `ids-e2e-assistant`:

```
npm run e2e:reset -- --full
```

Then invoke `ids-e2e-assistant` with:
- The list of changed source files on this branch
- The feature description from the plan
- Instruction to run in **repair mode** if tests exist, **write mode** if new E2E tests are needed

The agent runs the two-phase loop:
1. **Targeted run** — runs only test files related to changed code, fixes failures, re-runs each file in isolation to confirm
2. **Full suite** — runs `npm run e2e:all:ci` to catch regressions; fixes any new failures from phase 1

Gate passes when `npm run e2e:all:ci` is fully green.

### Step 4 — Mutation gate (mandatory unless `--skip-mutation` was passed)

Mutation runs against **changed files only** — never the full suite. This keeps the gate fast and focused.

#### Pre-flight: commit changes before running

The frontend mutation run uses `--inPlace` (modifies source files directly). If the process is interrupted, source files can be left in a mutated state. **Always commit first** — `git restore .` then recovers all files from the last commit cleanly.

Do NOT stash — stashing removes your changes from the working tree, so Stryker would mutate the old code instead of your new code. Do NOT rely on staging alone — staged files are still overwritten by `--inPlace`. Only a commit guarantees both correct mutation targets and safe recovery.

The project uses commitlint + Husky. The pre-commit hook runs `npm run lint:check` and the commit-msg hook enforces conventional commit format. Most types require a JIRA scope — extract the ticket from the branch name:

```bash
# Extract JIRA ID from branch name, then commit:
git add <changed-files>
git commit -m "chore(IDSMOD-70): checkpoint before mutation gate"
```

The format must be `type(JIRA-ID): subject` — bare `chore: message` (without scope) is rejected by commitlint.

#### Build the mutate list

From `git diff --name-only origin/main`, collect changed files and filter:

**Backend candidates** — files matching ALL of:
- Path starts with `apps/astra-apis/src/`
- Extension is `.ts` (not `.tsx`)
- Does NOT match: `**/__test__/**`, `**/*.test.ts`, `**/*.spec.ts`, `**/*.module.ts`, `**/dto/**`, `**/entities/**`, `**/indexes/**`, `**/main.ts`

**Frontend candidates** — files matching ALL of:
- Path starts with `apps/client-web/app/`
- Extension is `.ts` (not `.tsx` — components are E2E territory, not mutation territory)
- Does NOT match: `**/__test__/**`, `**/*.test.ts`, `**/*.spec.ts`, `**/*.d.ts`

If a list is empty (no mutable files changed in that layer), skip that layer's run entirely.

#### Run — correct invocation

The `npm run test:mutate:*` scripts do **not** support `--mutate` override via npm arg threading. Run directly from each app directory with the config as a positional argument:

```bash
# Backend — run from apps/astra-apis/, paths relative to that directory
cd apps/astra-apis
npx stryker run stryker.config.ts --mutate 'src/stock/stock.mapper.ts'
cd ../..

# Frontend — sandbox has a tsconfig path resolution bug in this monorepo,
# so --inPlace is required. Ensure changes are staged before running.
# Run from apps/client-web/, paths relative to that directory.
cd apps/client-web
npx stryker run stryker.config.ts --mutate 'app/pages/unit-inventory/mappers/unitInventoryMapper.ts' --inPlace
cd ../..
```

Reports are written to `test-output/stryker/report.json` inside each app directory.

#### Evaluate results — scope to changed code only

The overall mutation score reflects the entire file, which may include pre-existing code with no unit tests. Only treat a surviving mutant as a blocker if it is **in code you changed in this plan**. To determine this:

1. Note the surviving mutant's file and line number from the report
2. Check `git blame` or `git diff origin/main` for that line — if it pre-dates this branch, it is pre-existing
3. Pre-existing survivors: log them, do not block the gate
4. Survivors in your new code: fix the test

#### Repair surviving mutants

Delegate to `ids-coder` (backend) or `ids-designer` (frontend) with:
- The report path (`apps/{app}/test-output/stryker/report.json`)
- The exact surviving mutant (file, line, replacement code)
- The current test file for that module

Fix is always in the test — never modify source code to satisfy a mutant.

### Step 5 — Code review (mandatory unless `--skip-review` was passed)
Invoke the `ids-autopilot-code-review` agent to review all changes on this branch against main.
If Critical or High findings are reported, address them and re-run the fast gate before declaring done.

### Step 6 — Done
Only report the work as complete after every mandatory gate above has passed in the same iteration.

Write a completion handoff to `.ai-plan/handoffs/handoff-<timestamp>.md` (Purpose: "RALPH complete — all gates passed for `<plan basename>`"; reference plan path, run-state path, list files changed on this branch via `git diff origin/main --name-only`).

---

## Escalation rules

**Before escalating on a 3rd consecutive identical gate failure:** read `.ai-memory/case-studies/index.md` and search for entries with matching tags (gate name, error type, affected module). If a match exists, read that case study and try its Fix before escalating.

**After a novel non-obvious repair succeeds:** if no existing case study covers the failure, use `.claude/skills/case-study-memory/SKILL.md` to capture the failure, cause, fix, and lesson.

Stop and ask the user if:
- A failure points to something outside the approved derived plan's scope
- The same gate fails identically across 3 consecutive repair attempts **and no matching case study fix resolves it**
- A new ambiguity surfaces that the plan never addressed
