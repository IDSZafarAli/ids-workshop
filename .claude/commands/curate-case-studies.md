---
description: "Review case-study memory for stale, duplicate, or promotable lessons."
argument-hint: "[optional: focus tag or topic]"
---

# Curate Case Studies

Review `.ai-memory/case-studies/` and recommend cleanup.

If the user passed an argument, treat it as a focus tag or topic and limit the review to matching entries.

## Steps

1. Read `.ai-memory/case-studies/index.md`.
2. Read active case studies relevant to the focus, or all active case studies if no focus was provided.
3. For each case study, check:
   - Referenced files still exist in the codebase
   - The lesson is not already captured in `docs/standards/`, `.claude/skills/`, or `.claude/hooks/`
   - The `Promotion Candidate` field is filled in
4. Classify each entry:
   - **Promote** — lesson belongs in a standard, skill, hook, or test; draft the promotion content
   - **Keep active** — still relevant, not yet ready for promotion
   - **Archive** — referenced code gone, framework behavior changed, or lesson already promoted elsewhere
   - **Delete** — contradicts current architecture, or one-time local noise
   - **Needs decision** — ambiguous; present options and trade-offs
5. **Sort output: Promote first, then Keep, then Archive, then Delete.**
6. **Present recommendations. Do not apply any changes until the user approves.**

## Actions (after approval only)

- Move archived entries to `.ai-memory/case-studies/archived/`
- Delete entries the user approves for deletion
- Update `index.md` with status changes
- For promoted entries, update the case study file:
  ```
  Status: promoted
  Promoted To: <path>
  ```
  Then move to `archived/`.

## Output Format

```
### Promote
- [title](path) → <destination>: <path> — <reason>

### Keep Active
- [title](path) — <reason>

### Archive
- [title](path) — <reason>

### Delete
- [title](path) — <reason>

### Needs Decision
- [title](path) — <options and trade-offs>
```
