---
description: "RALPH Start — full-intake autonomous lane. Invokes ids-autopilot for a real ticket from intake through PR."
argument-hint: "--ticket <jira-id> [--phase <phase-id>] [--figma-url <url>] [--force-claim] [--cleanup-stale-claims] [--max-iterations <n>]"
---

# RALPH Start

You are now running RALPH Start. Arguments provided: `$ARGUMENTS`

Parse `$ARGUMENTS`:
- `--ticket <jira-id>` — required
- `--phase <phase-id>` — optional, target a specific phase (e.g. P-2)
- `--figma-url <url>` — optional, Figma design URL for intake
- `--force-claim` — optional, force-claim the phase even if already claimed
- `--cleanup-stale-claims` — optional, clear stale claims and exit
- `--max-iterations <n>` — optional, cap on autonomous iterations (default: 15)

If `--ticket` was not provided, stop and ask the user for it.

---

## Pre-flight checks

Before invoking the agent, check the following and warn the user if any are missing:
1. `claude` CLI is available on PATH — run `which claude`
2. `gh` CLI is available — run `which gh`
3. The `RAIA_UNIVERSE_AGENT_API_KEY` env var is set
4. No manual-phase artifacts exist for this ticket in `.ai-plan/` (files matching `{ticket}-*-plan.json` with `"mode": "manual-phase"`)

If manual-phase artifacts exist for the same ticket, stop and tell the user to use `/ralph-repair` or `/ralph-verify` for those phases, or delete the manual artifacts before running the full-intake lane.

---

## Invocation

Once checks pass, invoke the `ids-autopilot` agent with the following context:

> Run in full-intake mode for ticket `{ticket}` in the current repo. Use the current local checkout as your execution environment. Proceed through the normal autopilot phases (intake → implementation → gates → review → PR) unless blocked by real missing prerequisites. Respect the autonomous overrides in `.claude/agents/ids-autopilot.md`. {phase_clause} {figma_clause} {force_claim_clause} {cleanup_clause}

Where:
- `{phase_clause}` = `Target phase: {phase}.` if `--phase` was given, otherwise omit
- `{figma_clause}` = `Figma URL override: {figma-url}.` if `--figma-url` was given, otherwise `No explicit Figma URL override was provided.`
- `{force_claim_clause}` = `Force-claim is enabled.` if `--force-claim` was given, otherwise omit
- `{cleanup_clause}` = `This invocation is cleanup-only: clear stale claims and exit.` if `--cleanup-stale-claims` was given, otherwise omit

---

## After the agent run

Report the outcome to the user:
- Success: note the PR URL if one was created
- Escalation: surface the escalation reason clearly and suggest next steps
- Failure: show the exit reason and whether retry or `/ralph-repair` is appropriate
