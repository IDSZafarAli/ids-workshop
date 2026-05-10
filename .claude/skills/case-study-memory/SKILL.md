---
name: case-study-memory
description: Capture, retrieve, and promote reusable lessons from gate failures, tool quirks, user corrections, and non-obvious repairs. Promotion to a standard, skill, hook, or test is the primary lifecycle goal — case studies are staging, not permanent storage.
---

# Case Study Memory

Use this skill to:
- **Check** existing lessons before diagnosing a repeated or non-obvious failure
- **Capture** a lesson that future agents would need
- **Promote** a mature lesson into a standard, skill, hook, or test

**The model does not learn internally.** This skill externalizes lessons into project memory. The harness carries knowledge forward — not the weights.

---

## Token Budget

Keep this memory lean:

- Individual case study: **150–300 words max**
- Index: **one table row per study, no prose** — target under 50 active entries
- Do not bulk-load case studies. Read the index to find a match; read the individual file only if needed.

---

## Storage Layout

```
.ai-memory/case-studies/
  index.md        ← one-line table per study, never prose
  active/         ← current lessons (150–300 words each)
  archived/       ← promoted or retired lessons
```

Create missing directories and files as needed.

---

## When To CHECK Case Studies

Before diagnosing a **repeated or non-obvious failure**, read `.ai-memory/case-studies/index.md`. Match tags or title keywords against the failure area. If a match exists, read that file and try its Fix before attempting your own repair. A known fix beats rediscovery.

---

## When To CREATE A Case Study

Create one only when at least one is true:

- The user corrected an agent assumption
- A non-obvious runtime, build, framework, or tool failure was solved
- A gate failed and the repair revealed a reusable rule
- A repeated mistake occurred
- A debugging session produced a lesson that would be hard to rediscover from code alone

**Do not create** for:

- Ordinary lint/type errors, missing imports, typos, formatting issues
- One-off local environment noise
- Lessons already clearly covered by `docs/standards/`, `.claude/skills/`, or `.claude/hooks/`

---

## Lifecycle — Promotion Is The Goal

```
capture
  ↓
active  ──── referenced in 3+ sessions? ──→ promote immediately
  ↓                                          ↓
  └──────── or immediately obvious? ────→ promote immediately
  ↓
archive (one-off, no reuse value)
  ↓
delete (contradicted, merged elsewhere)
```

**A case study referenced across 3+ sessions without promotion is almost certainly a standard or skill in disguise.**

### Promotion Destinations

| Destination | When the lesson is... |
|---|---|
| `docs/standards/` | A rule that applies unconditionally to a whole layer. Should be enforced, not just consulted. |
| `.claude/skills/` | Procedural: "how to do X correctly in this codebase." Has depth, examples, workflow steps. Loaded on-demand by trigger. |
| `.claude/hooks/` | A preventable mistake detectable at edit or commit time. Can be expressed as a lint check or pre-edit reminder. |
| Test | A behavior that should be locked in by assertion so regression is impossible. |

After promotion:
1. Update the case study — set `Status: promoted`, add `Promoted To: <path>`.
2. Move the file to `archived/`.
3. Update `index.md`.

The canonical content lives in the standard/skill/hook, loaded efficiently by trigger. The archived case study is the thin pointer to its origin.

---

## Workflow

### Creating a new case study

1. Read `.ai-memory/case-studies/index.md` if it exists.
2. Search for an existing similar case study by title, tags, and keywords.
3. If a duplicate exists, update it — do not create a new file.
4. If no duplicate, create a new file under `active/` using the template below.
5. Update `index.md`.

### Filename

```
YYYY-MM-DD-short-kebab-title.md
```

Example: `2026-05-10-stryker-inplace-source-corruption.md`

---

## Case Study Template

```markdown
# <Title>

Status: active
Created: <Month D, YYYY, h:mm AM/PM>
Last Verified: <Month D, YYYY>
Review After: <Month D, YYYY — default 3 months out>
Tags: <comma-separated tags>
Applies To:
- <file path, module, or area>

## Symptom
What happened. Include key error text if useful.

## Cause
Why it happened.

## Fix
What resolved it.

## Lesson
The reusable rule. One or two sentences.

## Promotion Candidate
Where this lesson belongs if it repeats:
- [ ] standard: docs/standards/<file>.md
- [ ] skill: .claude/skills/<name>/SKILL.md
- [ ] hook: .claude/hooks/<file>.ts
- [ ] test
- [ ] none — one-off

## References
- <paths, Doctor reports, commits, or plans>
```

---

## Index Format

`index.md` is a table — no prose, no explanations, no blank rows between entries.

```markdown
# Case Study Index

| Status | Date | Tags | Lesson | File |
|---|---|---|---|---|
| active | 2026-05-10 | react-query, external-store | Defer setState from query cache callbacks | active/2026-05-10-react-query-bridge-render-warning.md |
| promoted | 2026-04-22 | ravendb, locationId | Missing locationId filter causes cross-tenant leak | archived/2026-04-22-ravendb-missing-location-filter.md |
```

---

## Staleness Rules

Archive or delete when:
- Referenced code no longer exists
- Framework or tool behavior changed
- Lesson was promoted to standards/skills/hooks/tests
- The review date has passed and the lesson was not re-encountered
- It contradicts current architecture

Do not silently delete. Use `/curate-case-studies` and present recommendations before applying changes.
