---
description: "Create a concise handoff document so another agent or session can continue the work."
argument-hint: "[optional: purpose or next-session goal]"
---

# Handoff

Create a concise handoff document for a fresh agent or session.

If the user passed arguments, treat them as the purpose of the next session and tailor the handoff accordingly.

## Output Path

Save to:

```
.ai-plan/handoffs/handoff-YYYY-MM-DD_hh-mm-AM.md
```

Use local time, 12-hour clock. Do not use colons in filenames. Create `.ai-plan/handoffs/` if it does not exist.

Example: `.ai-plan/handoffs/handoff-2026-05-10_09-42-PM.md`

Before writing, check whether the target path already exists. If it does, read it first — do not overwrite useful content.

## Content Rules

- Reference paths and URLs rather than copying content from plans, ADRs, commits, Doctor reports, or run-state files.
- **300–500 words maximum.** If you are writing more, you are duplicating content that already lives in a referenced artifact — stop and reference it instead.
- If a RALPH run is active (a `.ai-plan/runs/` state file exists for the current work), include its path under Relevant Artifacts.

## Template

```markdown
# Session Handoff

Created: <human-readable local date/time — e.g. "May 10, 2026, 9:42 PM">
Purpose: <next-session purpose, or inferred purpose if none provided>

## Current State
What is true now. Only facts needed to resume — 3–5 bullets.

## Key Decisions
Important decisions and tradeoffs made this session.

## Relevant Artifacts
Reference by path or URL. Do not copy content.
- Plan: <path>
- Run-state: <path, if a RALPH run is active>
- Other: <path>

## Files Touched
Key files changed or inspected this session.

## Commands Run
Only commands whose results matter for resuming.

## Open Questions
Unresolved items that block or affect the next step.

## Next Steps
Concrete ordered list of what to do next.

## Suggested Skills / Agents
Skills, commands, or agents likely useful in the next session.
```
