---
description: "RALPH Repair — verify-then-repair loop for a manual phase. Runs deterministic gates first, invokes ids-ralph-assist only if gates fail."
argument-hint: "--ticket <jira-id> --phase <phase-id> [--run-slow-gate] [--max-iterations <n>]"
---

# RALPH Repair

You are now running RALPH Repair. Arguments provided: `$ARGUMENTS`

Parse `$ARGUMENTS`:
- `--ticket <jira-id>` — required
- `--phase <phase-id>` — required (e.g. P-2)
- `--run-slow-gate` — optional, allow the verifier to also run the slow gate
- `--max-iterations <n>` — optional, max verify/repair rounds (default: 2)

If `--ticket` or `--phase` was not provided, stop and ask the user for them.

This command works only against existing manual-phase artifacts in `.ai-plan/`. It does not run intake, RAIA, or PR automation.

---

## CRITICAL: Complete ALL rounds in sequence — do not stop after the first verification run.

---

## Phase 1 — Verify

Run deterministic verification first:

```
npm run ralph:verify -- --ticket {ticket} --phase {phase}{slow_gate_flag}
```

Where `{slow_gate_flag}` = ` --run-slow-gate` if `--run-slow-gate` was passed, otherwise empty.

Report the gate results. If verification **passes**, report success and stop — no repair needed.

---

## Phase 2 — Repair loop (only if Phase 1 failed)

If verification failed, enter the repair loop. For each iteration (up to `--max-iterations`):

### Iteration step 1 — Read run state
Read `.ai-plan/runs/{ticket}-{phase}-state.json`. Extract the `fast_gate.failures` array to understand exactly which commands failed.

### Iteration step 2 — Invoke ids-ralph-assist for repair
Use the `ids-ralph-assist` agent (repair mode) with this prompt:

> This is repair iteration {n}. Run in the manual-phase verify/repair lane for ticket `{ticket}` phase `{phase}` in the current worktree. Use the existing roadmap/plan/run-state artifacts. Stop after repairing — do not attempt RAIA, Atlassian, Figma, code review, or PR steps. The fast gate state is already written to `.ai-plan/runs/{ticket}-{phase}-state.json`. Fix the actual repo until the fast gate passes, then stop.

### Iteration step 3 — Re-run verification
Run `npm run ralph:verify -- --ticket {ticket} --phase {phase}{slow_gate_flag}` again.

If it passes, report success and stop.
If it fails and this was the last iteration, report failure, show the remaining failures, and suggest the user investigate manually.

---

## Escalation rules

Stop and ask the user if:
- The same gate fails identically across all iterations
- A failure points to something outside the scope of the existing phase plan
- New ambiguity surfaces that the plan never addressed
