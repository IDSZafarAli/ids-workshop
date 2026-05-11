---
description: "Experiment: run a costly Claude model council over an .ai-plan file."
argument-hint: "<path-to-plan-md>"
---

# Eval Plan Council Experiment

Review the implementation plan at `$ARGUMENTS` using the experimental IDS Plan Council.

This is a research workflow, not the default workshop or application workflow. It spends real model tokens by spawning multiple reviewers and an Opus chair. Use it only when deliberately testing whether council-style review improves a plan enough to justify the cost.

If no path was provided, ask the user for the `.ai-plan/*.md` path and stop.

## Workflow

1. Read the plan file.
2. Spawn these reviewers in parallel:
   - `ids-plan-council-scope-haiku`
   - `ids-plan-council-architecture-sonnet`
   - `ids-plan-council-testing-sonnet`
3. Pass each reviewer the same plan text and ask for JSON only.
4. Spawn `ids-plan-council-chair-opus` with:
   - the original plan path
   - the original plan text
   - all reviewer JSON outputs
5. Save a report to `.ai-eval/runs/plan-council-YYYY-MM-DD-HH-mm-ss.json`.
6. Summarize the chairman decision to the user, including that the result came from the experimental council path.

## Required Behavior

- This command is advisory. It must not become a required implementation gate unless the user explicitly says so.
- If the chairman decision is `approve`, implementation may proceed only if the normal harness approval rules are also satisfied.
- If the decision is `revise` or `block`, recommend plan updates, but treat the result as experimental evidence rather than policy.
- Do not edit application code during this command.
