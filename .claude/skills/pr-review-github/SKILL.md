---
name: pr-review-github
description: GitHub PR workflows for IDS Cloud DMS — posting review results, and resolving PR comments. Covers authentication (WSL-aware, gh CLI install fallback), diff + HEAD SHA fetching, posting full report and per-line inline comments, and the resolve-and-reply workflow (fetch open comments, implement fixes, reply to each thread). Use ONLY for GitHub PR work. Local reviews (git diff, branch, staged changes) do not use this skill.
---

# GitHub PR — Workflows

Use this skill for any GitHub PR interaction: posting a review, or resolving open comments. The `ids-code-review` agent runs independently of this skill for local reviews.

**Three workflows covered:**
1. [Posting a review](#posting-a-review) — auth, diff fetch, report comment, inline comments
2. [Resolving PR comments](#resolving-pr-comments) — fetch open threads, implement fixes, reply to each
3. [Updating existing comments](#updating-existing-comments) — PATCH not DELETE

---

## Comment Format — Header and Footer

Every comment posted to GitHub — whether the top-level report comment or an individual inline comment — must open with this header and close with this footer.

**Resolve the git user name first:**
```bash
GIT_USER=$(git config user.name)   # e.g. "IDSZafarAli"
```

**Header** (first line of every comment body):
```
**IDSZafarAli & Claude Code**
```
Where `IDSZafarAli` is the value of `git config user.name`.

**Footer** (last two lines of every comment body):
```
---
🤖 *AI Code Review — Claude Code · Reviewed by @IDSZafarAli*
```
Where `IDSZafarAli` is again the value of `git config user.name`.

**Full comment structure:**
```
**{GIT_USER} & Claude Code**

{body content}

---
🤖 *AI Code Review — Claude Code · Reviewed by @{GIT_USER}*
```

Set these as shell variables once and reuse throughout:
```bash
GIT_USER=$(git config user.name)
HEADER="**${GIT_USER} & Claude Code**"
FOOTER="---
🤖 *AI Code Review — Claude Code · Reviewed by @${GIT_USER}*"
```

Build any comment body with:
```bash
BODY=$(printf '%s\n\n%s\n\n%s' "$HEADER" "$CONTENT" "$FOOTER")
```

---

## Step 1 — GitHub Authentication

### 1a. Check for gh CLI

```bash
which gh && gh auth status
```

If both succeed → skip to Step 2.

### 1b. Extract token from git credential store (WSL or Linux with `credential.helper=store`)

```bash
TOKEN=$(git credential fill <<< $'protocol=https\nhost=github.com' 2>/dev/null \
  | grep '^password=' | cut -d= -f2)
echo "TOKEN_SET=$([ -n "$TOKEN" ] && echo yes || echo no)"
```

If `TOKEN_SET=yes` → export it and use `curl` for all GitHub API calls (skip gh CLI):

```bash
export GITHUB_TOKEN="$TOKEN"
```

### 1c. WSL — try Windows Credential Manager

If the token is empty and this is WSL (`uname -r | grep -qi microsoft`):

```bash
# Windows GCM writes credentials to the Windows store; read via powershell.exe
TOKEN=$(powershell.exe -Command \
  "(Get-StoredCredential -Target 'git:https://github.com').Password" 2>/dev/null \
  | tr -d '\r')
```

If that also fails, fall through to 1d.

### 1d. Install gh CLI (last resort)

```bash
# Install
type -p curl >/dev/null || sudo apt-get install curl -y
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] \
  https://cli.github.com/packages stable main" \
  | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt-get update && sudo apt-get install gh -y

# Authenticate (interactive — tell user to run this themselves)
gh auth login
```

> **Note**: `gh auth login` is interactive. Tell the user to run it manually:
> `! gh auth login`

### API call helper

Throughout this skill, GitHub API calls use whichever method is available:

```bash
# With gh CLI:
gh api repos/{owner}/{repo}/pulls/{pr}/reviews --method POST --input - <<< "$JSON"

# With curl + token:
curl -s -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/{owner}/{repo}/pulls/{pr}/reviews" \
  -d "$JSON"
```

---

## Step 2 — Parse the PR URL

Given a URL like `https://github.com/ISMK-IDSGitOrg/ids-cloud-dms/pull/40`:

```bash
PR_URL="https://github.com/ISMK-IDSGitOrg/ids-cloud-dms/pull/40"
OWNER=$(echo "$PR_URL" | cut -d/ -f4)
REPO=$(echo  "$PR_URL" | cut -d/ -f5)
PR=$(echo    "$PR_URL" | cut -d/ -f7)
```

Fetch PR metadata and diff:

```bash
# Metadata (title, branch, head SHA, description)
gh api repos/$OWNER/$REPO/pulls/$PR          # with gh
# or
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/$OWNER/$REPO/pulls/$PR"

# Full diff
gh api repos/$OWNER/$REPO/pulls/$PR \
  -H "Accept: application/vnd.github.v3.diff" > /tmp/pr-$PR.diff
# or
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3.diff" \
  "https://api.github.com/repos/$OWNER/$REPO/pulls/$PR" > /tmp/pr-$PR.diff

HEAD_SHA=$(gh api repos/$OWNER/$REPO/pulls/$PR --jq '.head.sha')
# or via curl + python:
HEAD_SHA=$(curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/$OWNER/$REPO/pulls/$PR" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['head']['sha'])")
```

---

## Step 3 — Run ids-code-review

Delegate to the `ids-code-review` agent. Pass:
- The full diff content from `/tmp/pr-$PR.diff`
- The HEAD SHA
- The owner, repo, PR number
- Instruction to **skip GitHub posting** — this skill handles posting

```
Review PR #{pr} ({owner}/{repo}).
HEAD SHA: {head_sha}
Diff: <contents of /tmp/pr-{pr}.diff>

Save the report to .ai-plan/ as normal.
Do NOT post to GitHub — return the report content and all per-line findings
(file, line, severity, category, origin, body text) so the caller can post them.
```

Collect from the agent:
- The report markdown (or read it from `.ai-plan/`)
- A structured list of per-line findings: `{ path, line, severity, category, origin, body }`

---

## Step 4 — Validate line numbers before posting

GitHub's PR review API only accepts lines that appear in the diff. Before building the review payload, validate each finding's line:

```bash
# Test a single line is valid (returns 201 = valid, 422 = not in diff)
jq -n --arg path "$PATH" --argjson line $LINE --arg body "probe" \
  '{commit_id: $ENV.HEAD_SHA, event: "COMMENT",
    comments: [{path: $path, line: $line, side: "RIGHT", body: $body}]}' \
  | gh api repos/$OWNER/$REPO/pulls/$PR/reviews --method POST --input -
```

If a line is not in the diff:
- Try the nearest diff-visible line (e.g. if the changed hunk starts at line 119 and your target is 118, use 119)
- If no nearby diff line exists, include the finding in the top-level report body only — do **not** post a probe comment or a placeholder

**Never post "test" comments.** Validate silently or skip.

---

## Step 5 — Post the full report (top-level PR comment)

Post the entire `.ai-plan/` report as a single issue comment. `HEADER` and `FOOTER` are the variables defined in the Comment Format section above.

```bash
REPORT=$(cat .ai-plan/ai-code-review-*.md)
BODY=$(printf '%s\n\n%s\n\n%s' "$HEADER" "$REPORT" "$FOOTER")

# With gh:
gh pr comment $PR --repo $OWNER/$REPO --body "$BODY"

# With curl:
jq -n --arg body "$BODY" '{body: $body}' | curl -s -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/$OWNER/$REPO/issues/$PR/comments" \
  --data-binary @-
```

Post the report exactly as written — no extra preamble, no links to `.ai-plan/`, nothing between the header and the report content.

---

## Step 6 — Post all inline comments in one review

Build **one** review containing all per-line findings. Never post multiple reviews or individual per-comment API calls — that creates review spam.

Each comment body must follow the exact format:

```
**{git user name} & Claude Code**

**[{Severity}] [{Category}] [{Introduced|Pre-existing}]**: {title}

{finding body — problem description, code snippet, fix}

---
🤖 *AI Code Review — Claude Code · Reviewed by @{git user name}*
```

Rules:
- **No filler text** like "inline comment", "see above", "as mentioned"
- **No file paths or links** in the body — GitHub already shows the file and line
- **No redundant severity prefix** if already in the title
- The finding body should be self-contained: problem, why it matters, and the fix with a code snippet where relevant

Build and post using `jq` (handles newlines correctly — never use `-f body=` for multi-line). `HEADER` and `FOOTER` are the variables defined in the Comment Format section above.

```bash
# Build one body per finding
C1=$(printf '%s\n\n%s\n\n%s' "$HEADER" "<finding 1 text>" "$FOOTER")
C2=$(printf '%s\n\n%s\n\n%s' "$HEADER" "<finding 2 text>" "$FOOTER")
REVIEW_BODY=$(printf '%s\n\n%s' "$HEADER" "$FOOTER")

jq -n \
  --arg commitId  "$HEAD_SHA" \
  --arg body      "$REVIEW_BODY" \
  --arg c1        "$C1" \
  --arg c2        "$C2" \
  '{
    commit_id: $commitId,
    body:      $body,
    event:     "REQUEST_CHANGES",
    comments: [
      {path: "apps/astra-apis/src/foo/foo.service.ts", line: 42, side: "RIGHT", body: $c1},
      {path: "apps/client-web/app/pages/foo/Foo.tsx",  line: 17, side: "RIGHT", body: $c2}
    ]
  }' | gh api repos/$OWNER/$REPO/pulls/$PR/reviews --method POST --input -
```

Use `event: "REQUEST_CHANGES"` when there are High or Critical findings. Use `"COMMENT"` for Low/Medium only reviews.

---

## Resolving PR Comments

Use this workflow when asked to "pull comments on the PR, resolve them, and reply".

### Step 1 — Fetch all open review comments

```bash
# With gh:
gh api repos/$OWNER/$REPO/pulls/$PR/comments --paginate

# With curl:
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/$OWNER/$REPO/pulls/$PR/comments?per_page=100"
```

Each comment object contains:
- `id` — comment ID (use this to reply)
- `body` — the comment text
- `path` — file the comment is on
- `line` — line number
- `in_reply_to_id` — set if this is a reply (null = root of a thread)
- `pull_request_review_id` — which review it belongs to

**Filter to root comments only** (those with `in_reply_to_id == null`) — these are the actionable items. Replies are context, not new tasks.

```bash
# Extract root comments with jq
gh api repos/$OWNER/$REPO/pulls/$PR/comments --paginate \
  | jq '[.[] | select(.in_reply_to_id == null)]'
```

### Step 2 — Understand and implement each fix

For each root comment:

1. Read the comment body carefully — understand what change is being requested
2. Read the full file at `comment.path` to get context
3. Implement the fix following project coding standards
4. Note a one-sentence description of what was changed (used in the reply)

Work through all comments before replying — batch the code changes into as few commits as possible.

### Step 3 — Reply to each comment thread

Reply to **each root comment** after its fix is implemented. Use the reply endpoint:

```bash
# Reply to a specific review comment
REPLY_BODY=$(printf '%s\n\n%s\n\n%s' "$HEADER" "$REPLY_CONTENT" "$FOOTER")

# With gh:
jq -n --arg body "$REPLY_BODY" '{body: $body}' | \
  gh api repos/$OWNER/$REPO/pulls/comments/$COMMENT_ID/replies \
    --method POST --input -

# With curl:
jq -n --arg body "$REPLY_BODY" '{body: $body}' | \
  curl -s -X POST \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$OWNER/$REPO/pulls/$PR/comments/$COMMENT_ID/replies" \
    --data-binary @-
```

### Reply body format

Replies use the same `$HEADER` and `$FOOTER` variables defined in the Comment Format section above — no exceptions. Build every reply body the same way:

```bash
REPLY_CONTENT="Replaced Object.assign(customer, dto) with explicit if (dto.field !== undefined) guards
for all address fields. Prevents partial updates from overwriting stored data with undefined."

REPLY_BODY=$(printf '%s\n\n%s\n\n%s' "$HEADER" "$REPLY_CONTENT" "$FOOTER")
```

The rendered comment will look like:

```
**IDSZafarAli & Claude Code**

Replaced Object.assign(customer, dto) with explicit if (dto.field !== undefined) guards
for all address fields. Prevents partial updates from overwriting stored data with undefined.

---
🤖 *AI Code Review — Claude Code · Reviewed by @IDSZafarAli*
```

The content between header and footer should be concise — state what was changed, not what the problem was (the original comment already describes the problem). Include a before/after snippet for non-trivial changes.

**Good:**
```
Extracted NoRowsOverlay and LoadingOverlay to pages/customers/components/.
CustomerList.tsx now imports them.
```

**Bad:**
- "Fixed as requested" — says nothing about what changed
- "Done" — same
- Repeating the original comment back
- "Great catch!" or any filler

### Step 4 — Resolving threads (REST limitation)

The GitHub REST API does **not** support marking a review thread as resolved — that requires the GraphQL API. After replying, the thread remains visually "unresolved" in the GitHub UI until the PR author manually resolves it, or until a new push is made and the reviewer resolves it.

To resolve via GraphQL (optional, requires a `GITHUB_TOKEN` with `pull_requests` write scope):

```bash
# Get the thread ID first (GraphQL only)
gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes { id isResolved comments(first:1){nodes{databaseId}} }
        }
      }
    }
  }' -f owner=$OWNER -f repo=$REPO -F pr=$PR

# Resolve a thread
gh api graphql -f query='
  mutation($threadId: ID!) {
    resolveReviewThread(input: {threadId: $threadId}) {
      thread { isResolved }
    }
  }' -f threadId="<thread_node_id>"
```

If GraphQL resolution is not required, replying to each thread is sufficient — the replies signal the fix is in place.

---

## Updating existing comments (PATCH — not DELETE)

GitHub does not allow deleting submitted (non-pending) reviews. If a comment needs correction:

```bash
# Update an inline review comment
curl -s -X PATCH \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/$OWNER/$REPO/pulls/comments/{comment_id}" \
  -d "$(jq -n --arg body "$NEW_BODY" '{body: $body}')"

# Update a review's top-level body
curl -s -X PUT \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/$OWNER/$REPO/pulls/$PR/reviews/{review_id}" \
  -d "$(jq -n --arg body "$NEW_BODY" '{body: $body}')"
```

---

## Quick Reference

| Goal | API |
|---|---|
| Get token (credential store) | `git credential fill <<< $'protocol=https\nhost=github.com'` |
| Get token (WSL Windows store) | `powershell.exe -Command "(Get-StoredCredential -Target 'git:https://github.com').Password"` |
| Fetch PR diff | `GET /pulls/{pr}` with `Accept: application/vnd.github.v3.diff` |
| Fetch PR head SHA | `GET /pulls/{pr}` → `.head.sha` |
| Post top-level report | `POST /issues/{pr}/comments` |
| Post inline review | `POST /pulls/{pr}/reviews` with `comments` array via `jq --arg` |
| Fetch review comments | `GET /pulls/{pr}/comments` |
| Filter to root threads | `jq '[.[] \| select(.in_reply_to_id == null)]'` |
| Reply to a comment thread | `POST /pulls/{pr}/comments/{id}/replies` |
| Resolve thread (GraphQL) | `mutation { resolveReviewThread(input:{threadId:...}) }` |
| Update inline comment | `PATCH /pulls/comments/{id}` |
| Update review body | `PUT /pulls/{pr}/reviews/{id}` |
| Validate line in diff | POST a comment — 201 = valid, 422 = not in diff |
