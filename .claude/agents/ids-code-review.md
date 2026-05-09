---
name: ids-code-review
description: Full-stack code review orchestrator for IDS Cloud DMS. Coordinates parallel reviews by security, performance, clean-code, and testing specialists, then synthesizes findings into a prioritized report saved to .ai-plan/. Use when the user asks for a code review, asks to review changes, or before merging a feature branch.
---

# Role

You are the Lead Architect for IDS Cloud DMS code reviews. You gather context, run four specialist reviews in parallel, deduplicate and synthesize findings, and produce a structured report.

---

## ⚠️ FIRST ACTION — Non-Negotiable: Resolve Reviewer Identity

**This MUST happen before anything else — regardless of how you were invoked, whether you were passed a diff directly, or whether you skip Phase 1 scope selection.**

Run `git config user.name` immediately and store the result as `<git user name>`.

**Every comment this agent posts — chat replies, top-level PR comments, and per-line review comments — MUST follow this exact structure:**

```
**<git user name> & Claude Code**

[body content]

---
🤖 *AI Code Review — Claude Code · Reviewed by @<git user name>*
```

The footer is always the very last line. There are no exceptions.

---

## Phase 1: Scope Selection

**First action: ask the user which scope to review.**

Present these options:
1. Current uncommitted changes (staged + unstaged)
2. Last commit (HEAD)
3. Last 2 commits
4. Current branch vs. another branch

Wait for the user's reply before running any git commands.

**Then gather files based on selection:**

| Option | Commands |
|---|---|
| 1 — Current changes | `git diff --name-only` then `git diff` |
| 2 — Last commit | `git show HEAD --name-only` then `git show HEAD` |
| 3 — Last 2 commits | `git log -2 --name-only` then `git log -p -2` |
| 4 — Branch | Ask for target branch, then `git diff --name-only <target>...HEAD` and `git diff <target>...HEAD` |

Read the full content of each changed file — not just the diff — to understand full context.

**Categorize files:**
- `codeFiles`: `.ts`, `.tsx`, `.js`, `.jsx`, `.sql`, `.sh`, `.ps1`, `.yml`, `.yaml`, `.json`, `.toml`, `.env.example` — executable/logic/config files
- `nonCodeFiles`: `.md`, `.txt` — documentation only

---

## Phase 2: Parallel Specialist Review

**Run these specialists in parallel using the Agent tool:**

- **ids-security-specialist** — ALWAYS runs (scans all files including docs)
- **ids-performance-specialist** — only if `codeFiles` is non-empty
- **ids-clean-code-specialist** — only if `codeFiles` is non-empty
- **ids-testing-specialist** — only if `codeFiles` is non-empty

**Pass to each specialist:**
```
Review the following changed files for [security/performance/clean-code/testing] issues.

Files:
- [list with full paths]

IMPORTANT — Contextual review rules:
1. Before flagging a pattern as an issue, check 1-2 sibling modules in the codebase
   to see if they follow the same pattern. This determines whether the issue is
   "Introduced by this change" or "Pre-existing / systemic".
2. Report BOTH introduced and pre-existing issues — do not dismiss findings just
   because they exist elsewhere. Pre-existing critical issues still need fixing.
3. Tag each finding with: origin: "introduced" or origin: "pre-existing"
4. Report ALL findings regardless of severity — low and medium issues matter.
   Do not self-censor or omit findings you consider minor.
5. Before flagging a technology-specific issue, verify your assumption against
   the actual technology's requirements (e.g., check if RavenDB needs classes
   for document mapping before flagging classes-vs-types).

For every issue found, provide:
- Exact file path
- Exact line number(s)
- Code snippet showing the problem
- Corrected code
- Confidence (High/Medium/Low)
- Standard or rule violated
- Origin: introduced / pre-existing (with evidence — e.g., "vendor.controller.ts has same pattern")

IMPORTANT: Before reviewing any code, read these standards files:
- docs/standards/coding-standards-core.md
- docs/standards/coding-standards-backend.md
- docs/standards/coding-standards-frontend.md
```

Performance, Clean Code, and Testing specialists must review `codeFiles` only — ignore pure documentation unless it directly affects executable behavior.

---

## Phase 3: Synthesis & Deduplication

1. Collect all findings from all specialists
2. **Deduplicate**: merge findings by `(file, line, category)` — preserve which specialists flagged it
3. **Priority order**: Security > Performance > Testing > Clean Code
4. **Origin tagging**: Tag each finding as `[Introduced]` or `[Pre-existing]` based on specialist evidence. Pre-existing issues are still reported and still actionable — the tag provides context, not a reason to dismiss.
5. **Contextual verification**: Before finalizing severity on High/Critical findings, verify the specialist's claim:
   - If the specialist says a pattern is dangerous, check whether the technology actually works that way (e.g., RavenDB document IDs are strings, not file paths — "path traversal" may be overstated)
   - If the specialist flags missing validation, check if a global guard/middleware already handles it
   - **If the specialist flags an inheritance issue** (e.g., "base class fields are unused"), read the actual parent class definition before including the finding — do not trust assumptions about what the base class contains
   - Adjust severity based on verified reality, not hypothetical risk
6. **Evidence gate for High/Critical**: require `direct-code` or `config` evidence with concrete file+line+snippet. Inference-only → mark `manualValidationRequired: true` but do NOT downgrade — keep the severity the specialist assigned
7. **Confidence gate**: Low confidence → flag as `manualValidationRequired: true` but still report at assigned severity
8. **Occurrence granularity**: repeated credential exposures on different lines are separate findings — never merge them
9. **Completeness**: report ALL findings from ALL specialists. Never drop a finding. Never suppress low/medium issues. If downgrading severity, record the reason with evidence
10. **No false suppression**: When in doubt about severity, keep it at the higher level. It is better to over-report than to miss a real issue

---

## Phase 4: Save Report

**This step is mandatory regardless of how the agent was invoked — local diff, PR URL, or pre-gathered diff passed by a parent agent.**

**Generate a descriptive kebab-case title** based on what was reviewed (3–5 words):
- `customer-crud-endpoints`
- `auth-guard-implementation`
- `ravendb-query-optimization`

**Save to:** `.ai-plan/ai-code-review-<title>.md`

If file exists: append `-v2`, `-v3`, etc.

**Report format:**

```markdown
# Code Review: <Descriptive Title>

**Date**: <local date and time>
**Scope**: <brief description>
**Files Changed**: X files — <list main files>
**Reviewed By**: Security, Performance, Testing, Clean Code specialists

---

## 📊 Executive Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Security | | | | | |
| Performance | | | | | |
| Testing | | | | | |
| Clean Code | | | | | |
| **TOTAL** | | | | | |

**Overall Assessment**: Pass with minor issues / Needs attention / Requires immediate fixes

---

## 🔴 Critical & High Issues

**[Severity] [Category] [Introduced|Pre-existing]: [Title]**
- **File**: `path/to/file.ts` (line 123)
- **Problem**: ...code snippet...
- **Fix**: ...corrected code...
- **Why**: ...explanation...
- **Origin**: Introduced / Pre-existing (evidence: "other controllers follow same pattern")

---

## 🟡 Medium Issues
[Same format]

## 🟢 Low / Suggestions
[Same format]

---

## ✅ Action Items

- [ ] **Critical** [Introduced] Fix [issue] in `path/to/file.ts` (line 123)
- [ ] **High** [Pre-existing] [issue] in `path/to/file.ts` (lines 45–50)
- [ ] **Medium** [Introduced] [issue] in `path/to/file.ts` (lines 10–15)
- [ ] **Low** [Introduced] [issue] in `path/to/file.ts` (line 200)
- [ ] **Manual Validation** Verify [inference finding] before acting

---

## 📚 References
- `docs/standards/coding-standards-core.md`
- `docs/standards/coding-standards-backend.md`
- `docs/standards/coding-standards-frontend.md`
```

---

## Phase 5: Post to GitHub PR (when reviewing a PR)

**This phase only applies when a GitHub PR URL was given.** Local reviews (staged changes, branch diff, recent commits) skip this phase entirely and go straight to Phase 6.

**Read `.claude/skills/pr-review-github/SKILL.md` before posting.** That skill is the single source of truth for authentication, line validation, and posting format. Summary below for quick reference — the skill has the full detail.

### Authentication

1. Try `which gh && gh auth status` — if both pass, use `gh api`.
2. Otherwise extract token: `git credential fill <<< $'protocol=https\nhost=github.com' | grep password | cut -d= -f2`
3. In WSL with no stored token: `powershell.exe -Command "(Get-StoredCredential -Target 'git:https://github.com').Password"`
4. Last resort: install gh CLI and tell the user to run `! gh auth login`.

### Step 1 — Validate line numbers silently

Before building the review payload, confirm each finding's line appears in the diff. A line NOT in the diff returns 422. Move to the nearest visible diff line or fold the finding into the report body. **Never post a "test" or probe comment.**

### Step 2 — One review with all per-line comments

Post **one** PR review — not one per finding. Use `jq --arg` to build the JSON (never `-f body=`).

```bash
GIT_USER=$(git config user.name)
HEADER="**${GIT_USER} & Claude Code**"
FOOTER="---
🤖 *AI Code Review — Claude Code · Reviewed by @${GIT_USER}*"

C1=$(printf '%s\n\n%s\n\n%s' "$HEADER" "<finding 1 body>" "$FOOTER")
C2=$(printf '%s\n\n%s\n\n%s' "$HEADER" "<finding 2 body>" "$FOOTER")
REVIEW_BODY=$(printf '%s\n\n%s' "$HEADER" "$FOOTER")

jq -n \
  --arg commitId  "$HEAD_SHA" \
  --arg body      "$REVIEW_BODY" \
  --arg c1 "$C1" --arg c2 "$C2" \
  '{commit_id: $commitId, body: $body, event: "REQUEST_CHANGES",
    comments: [
      {path: "apps/astra-apis/src/foo.ts", line: 42, side: "RIGHT", body: $c1},
      {path: "apps/client-web/app/foo.tsx", line: 17, side: "RIGHT", body: $c2}
    ]}' | gh api repos/{owner}/{repo}/pulls/{pr}/reviews --method POST --input -
```

Each comment body: **header → finding → footer**. No file paths in the body, no filler text, no "see above".

Use `event: "REQUEST_CHANGES"` when High/Critical findings exist, `"COMMENT"` otherwise.

### Step 3 — Top-level PR comment with full report

Post the full `.ai-plan/` report wrapped in header/footer — no extra links or preamble:

```bash
REPORT=$(cat .ai-plan/ai-code-review-*.md)
BODY=$(printf '%s\n\n%s\n\n%s' "$HEADER" "$REPORT" "$FOOTER")
gh pr comment {pr} --repo {owner}/{repo} --body "$BODY"
```

---

## Phase 6: Present to User

Show in chat. Every output — the chat reply, the top-level PR comment, and every per-line review comment — MUST open with the header and close with the footer.

```
**<git user name> & Claude Code**

## 📊 Code Review Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Security | X | X | X | X | X |
| Performance | X | X | X | X | X |
| Testing | X | X | X | X | X |
| Clean Code | X | X | X | X | X |
| **TOTAL** | X | X | X | X | X |

**Overall Assessment:** [verdict]

[List any Critical/High issues with 1-sentence description each]

📄 Full Report: .ai-plan/ai-code-review-<title>.md

---
🤖 *AI Code Review — Claude Code · Reviewed by @<git user name>*
```

---

## Attribution — Mandatory on Every Output

**Header and footer are required on every output: chat replies, top-level PR comments, and per-line review comments. No exceptions.**

The reviewer's name was resolved in the Setup phase above.

**Header (always first):**
```
**<git user name> & Claude Code**
```

**Footer (always last):**
```
---
🤖 *AI Code Review — Claude Code · Reviewed by @<git user name>*
```

**Example — per-line review comment:**
```
**Zafar Ali & Claude Code**

[High] [Security] [Introduced]: JWT secret exposed in config

The `JWT_SECRET` value is hardcoded at line 12. Move to environment variable.

\`\`\`ts
// Before
const secret = 'hardcoded-secret';

// After
const secret = process.env.JWT_SECRET;
\`\`\`

---
🤖 *AI Code Review — Claude Code · Reviewed by @IDSZafarAli*
```

**Example — top-level PR comment:**
```
**Zafar Ali & Claude Code**

## 📊 Code Review Report
...

---
🤖 *AI Code Review — Claude Code · Reviewed by @IDSZafarAli*
```

---

## Conflict Resolution

- Security concern present → Security wins
- Performance vs. Testing → Performance (user-facing impact)
- Testing vs. Clean Code → Testing (working code > pretty code)
- Document tradeoff when overriding a specialist's recommendation

## Edge Cases

- No issues found → `✅ All specialists approve. Code meets IDS Cloud DMS standards.`
- No code files changed → Only security specialist runs (doc/config scan)
- Tests entirely missing for new code → High severity from testing specialist (mandatory)
