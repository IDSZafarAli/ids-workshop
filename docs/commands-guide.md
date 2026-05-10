# IDS Cloud DMS — Commands Guide

Slash commands live in `.claude/commands/`. They are invoked with `/command-name [args]` in Claude Code.

---

## Quick Reference

| Command | One-liner | When |
|---|---|---|
| `/handoff` | Write a session handoff document | Ending a session, before a break, handing off to another person |
| `/resume-handoff` | Load a handoff and propose next steps | Starting a fresh session to continue previous work |
| `/curate-case-studies` | Review memory for stale or promotable lessons | Periodically, before a release, when the index grows past ~20 entries |
| `/ralph-start` | Full intake → plan → implement → gates → PR | New ticket from Jira/intake with no existing plan |
| `/ralph-assist` | Plan-driven implement + gate loop | You have an approved plan and want autonomous implementation |
| `/ralph-repair` | Verify failed gates and repair | Gates failed after manual changes; you want targeted repair only |

---

## Session Continuity

### `/handoff`

Creates a concise document a fresh agent or session can use to resume your work. Output goes to `.ai-plan/handoffs/handoff-YYYY-MM-DD_hh-mm-AM.md`.

**When to use:**
- You are ending a session mid-task and want to continue in a new one
- You are handing work to another developer
- RALPH auto-creates handoffs at plan approval and gate completion — you rarely need to run this manually during a RALPH run

**Usage:**
```
/handoff
/handoff fix the billing module next session
```

The optional argument becomes the `Purpose` field in the handoff. Without it, the purpose is inferred from context.

**What it produces:**
- Current state (3–5 bullets)
- Key decisions made
- References to plan and run-state files (not copied content)
- Files touched and commands run
- Open questions and next steps
- Suggested skills/agents for the next session

**Rules:** 300–500 words max. Reference paths; do not copy content from plans, diffs, or run-state files.

---

### `/resume-handoff`

Loads a handoff document, checks that referenced artifacts still exist, and proposes concrete next steps before doing any work.

**When to use:**
- Starting a new session to continue previous work
- Picking up someone else's in-progress work
- After returning from a break when context is gone

**Usage:**
```
/resume-handoff
/resume-handoff latest
/resume-handoff .ai-plan/handoffs/handoff-2026-05-10_09-42-PM.md
```

Without an argument (or with `latest`), loads the most recent handoff file in `.ai-plan/handoffs/`.

**What it does:**
1. Reads the handoff
2. Checks that referenced plan and run-state files still exist and are current
3. Runs `git diff origin/main --name-only` to confirm actual change state
4. Summarises current goal, state, open questions, and recommended next actions
5. **Asks before implementing** — does not proceed automatically unless the handoff explicitly marks the plan as approved and you ask to proceed

---

## Memory

### `/curate-case-studies`

Reviews `.ai-memory/case-studies/` for stale entries, duplicates, and lessons ready to be promoted into standards, skills, hooks, or tests.

**When to use:**
- The case study index grows past ~20 active entries
- Before a release or sprint boundary
- When the same failure pattern has been seen several times
- Periodically as part of technical debt hygiene

**Usage:**
```
/curate-case-studies
/curate-case-studies ravendb
/curate-case-studies react-query
```

The optional argument is a focus tag or topic — limits the review to matching entries.

**Output format (always presented before any changes):**
```
### Promote   ← shown first
### Keep Active
### Archive
### Delete
### Needs Decision
```

Changes are only applied after you approve them. Promoted case studies move to `archived/` with a `Promoted To:` pointer.

**The goal is promotion, not accumulation.** A lesson in a skill or standard loads automatically by trigger and never costs retrieval budget. A case study you have to remember to check does.

---

### Case Study Memory (skill, not a slash command)

This is invoked as a skill during work, not as a standalone command. Reference: `.claude/skills/case-study-memory/SKILL.md`.

**When to CHECK:**
Before diagnosing a repeated or non-obvious failure, read `.ai-memory/case-studies/index.md`. If the tags or title match the failure area, read that file first. A known fix beats rediscovery.

**When to CREATE:**
- User corrected an agent assumption
- A non-obvious gate failure was repaired
- A tool or framework quirk was discovered
- A repeated mistake was identified

**Do NOT create for:** lint errors, missing imports, typos, or anything already in standards/skills.

---

## RALPH Workflow

RALPH is the plan-driven autonomous implementation loop. It runs through plan → derive → approve → implement → fast gates → E2E → mutation → code review.

### `/ralph-start`

Full intake lane — takes a raw ticket or requirement all the way from intake through a finished PR.

**When to use:**
- A real Jira ticket with acceptance criteria
- You want fully autonomous end-to-end execution
- The work is well-scoped and you trust the model to plan independently

**Usage:**
```
/ralph-start IDSMOD-123
/ralph-start IDSMOD-123 --skip-slow
```

Flags:
- `--skip-slow` — skip E2E gate (use when no UI changes)
- `--skip-mutation` — skip mutation gate
- `--skip-review` — skip code review stage

---

### `/ralph-assist`

Plan-driven implementation + gate loop. Takes an existing `.ai-plan/` plan file and implements it, running all mandatory gates.

**When to use:**
- You already have an approved plan in `.ai-plan/`
- You want to implement without going through intake
- Resuming an interrupted RALPH run (run-state in `.ai-plan/runs/` tracks where you left off)

**Usage:**
```
/ralph-assist .ai-plan/2026-05-10-my-feature.md
/ralph-assist .ai-plan/2026-05-10-my-feature.md --skip-slow
/ralph-assist .ai-plan/2026-05-10-my-feature.md --figma-url https://figma.com/...
```

Flags:
- `--figma-url <url>` — provide Figma design context for frontend work
- `--skip-slow` / `--skip-mutation` / `--skip-review` — skip individual gates

**What it does:**
1. Creates or resumes a run-state JSON in `.ai-plan/runs/`
2. Derives a concrete step-by-step plan and presents it for approval
3. Implements after approval
4. Runs fast gates (lint, standards, typecheck, unit tests)
5. Runs E2E gate via `ids-e2e-assistant`
6. Runs mutation gate on changed files only
7. Runs code review via `ids-autopilot-code-review`
8. Writes a completion handoff

**Auto-created handoffs:** at plan approval and at completion.  
**Case study integration:** checks `.ai-memory/case-studies/index.md` before the 3rd consecutive failure on the same gate; writes a case study after any novel non-obvious repair.

---

### `/ralph-repair`

Targeted gate repair — runs deterministic checks first and only invokes the full RALPH loop if gates are actually failing.

**When to use:**
- You made manual changes outside a RALPH run and gates are now failing
- You want to verify and fix just the failing gates, not re-run the whole plan
- CI is red and you want targeted repair without re-implementing anything

**Usage:**
```
/ralph-repair
/ralph-repair .ai-plan/2026-05-10-my-feature.md
```

---

## Choosing the Right Command

```
New ticket with no plan?
  → /ralph-start

Have a plan, want full autonomous run?
  → /ralph-assist <plan-path>

Manual changes made, gates failing?
  → /ralph-repair

Ending a session mid-task?
  → /handoff [purpose]

Starting fresh, picking up previous work?
  → /resume-handoff

Gate failed 3+ times or novel repair just succeeded?
  → Check/update .ai-memory/case-studies/ (case-study-memory skill)

Case study index is growing large?
  → /curate-case-studies
```
