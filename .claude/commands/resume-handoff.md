---
description: "Resume work from a handoff document."
argument-hint: "[handoff path | latest]"
---

# Resume Handoff

Resume work from a handoff document.

## Input

- If the user provides a path, read that file.
- If the user says `latest` or provides no argument, find the newest file matching `.ai-plan/handoffs/handoff-*.md`.
- If no handoff exists, say so and ask whether to inspect `.ai-plan/` instead.

## Steps

1. Read the handoff.
2. **Staleness check** — for each referenced artifact, verify it still exists. If a run-state file is referenced, read it and confirm `completed_at` status. Report any missing or stale references before continuing.
3. Read only the referenced artifacts necessary to understand the next step (plan, run-state). Skip informational-only references.
4. Run `git diff origin/main --name-only` to confirm what has actually changed since the handoff was written.
5. Summarize:
   - current goal
   - current state
   - open questions
   - next recommended actions
6. **Ask before implementing** unless the handoff explicitly marks the plan as approved and the user asks to proceed.

## Rules

- The handoff is a map, not the source of truth. When a handoff summary conflicts with the referenced plan, run-state, or current git diff, trust what you observe — not what the handoff says.
- If referenced files are missing or stale, report that before proposing any next steps.
- Do not assume work described in the handoff is still in-progress — check `git log` and the run-state before concluding anything.
