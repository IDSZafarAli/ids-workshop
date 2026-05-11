# IDS AI Eval

`apps/ai-eval` is the workshop evaluation app for proving that harness layers,
Doctor evidence, and plan review gates improve agent behavior.

It currently runs three automated tracks:

| Track | What it evaluates |
|---|---|
| `harness` | Claude hook and standards behavior on synthetic traps |
| `doctor` | IDS Doctor rule quality against golden telemetry evidence |
| `plan-council` | Council-style review of `.ai-plan` quality before implementation |

Run all tracks:

```bash
npm run eval:ai
```

Run one track:

```bash
npm run eval:ai -- --track doctor
```

Run the plan council against a real `.ai-plan` artifact:

```bash
npm run eval:ai -- --track plan-council --plan .ai-plan/phase-2-claude-harness-and-standards.md
```

Outputs are written under `.ai-eval/runs/` and `.ai-eval/reports/latest.html`.
The HTML report is intentionally static so it can be opened directly during the
workshop final-day exercise.

## Design

The app borrows two ideas:

- `autoresearch`: fixed task loop, deterministic score, persistent run artifact.
- `llm-council`: multiple independent reviewers, ranking, chairman synthesis.

The first implementation keeps the council deterministic so it works without
external model credentials. Real LLM judges can be plugged in later behind the
same result schema.

## Claude Plan Council Experiment

The real Claude council workflow is exposed as an experimental Claude Code command:

```text
/eval-plan-council-experiment .ai-plan/example-plan.md
```

It is intentionally not the default workshop path. It uses model-specific subagents and can be token-expensive:

| Agent | Model | Role |
|---|---|---|
| `ids-plan-council-scope-haiku` | Haiku | Fast scope/completeness review |
| `ids-plan-council-architecture-sonnet` | Sonnet | Architecture and standards review |
| `ids-plan-council-testing-sonnet` | Sonnet | Verification and gate review |
| `ids-plan-council-chair-opus` | Opus | Chairman synthesis and final decision |

The Node runner keeps a deterministic fallback so CI/workshop smoke tests can
run even when Claude Code model execution is unavailable.
