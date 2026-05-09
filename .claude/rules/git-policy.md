# Git Policy — Commits, Pushes, Co-Authors

Loaded at session start (no `paths:` frontmatter). Applies to every commit and push regardless of which file is being edited.

---

## Commit Format

All commits must follow this format (enforced by commitlint):

```
<type>(<JIRA-ID>): <subject>
```

**Allowed types:** `chore` `doc` `feat` `fix` `minor` `refact` `tool` `ux`

**JIRA-ID rules:**
- Must be `UPPERCASE-NUMBER` — e.g., `IDSMOD-54`, `IDS-123`
- Project code: uppercase letters only — `IDSMOD` ✅, `idsmod` ❌
- Followed by hyphen + digits — `IDSMOD-54` ✅, `IDSMOD` ❌

**Subject rules:**
- Start with lowercase — `add feature` ✅, `Add feature` ❌
- 10–99 characters
- Present tense ("add" not "added")
- Space after colon — `feat(IDSMOD-54): add...` ✅

When committing: always propose 2 options (concise, standard). Extract JIRA ticket from branch name first. Wait for user selection before committing.

---

## Commit & Push Policy

- **Never run `git commit`, `git push`, or `git push --force` without explicit approval in the same turn.** Approval given earlier in the conversation does not carry over — confirm again.
- **Never add `Co-Authored-By` trailers** (Claude or otherwise) to commit messages. Authors are the human committer only.
- **Never use `--no-verify`, `--no-gpg-sign`, or any flag that bypasses hooks/signing.** If a pre-commit hook fails, fix the underlying issue and create a NEW commit — do not amend.
- Stage files explicitly by name; avoid `git add -A` / `git add .` to prevent accidentally committing `.env`, credentials, or build artifacts.
- Never push to `main` / `master` directly. Feature branches and PRs only.
- Never run destructive operations (`git reset --hard`, `git checkout .`, `git clean -f`, `git branch -D`) without explicit approval — they can destroy uncommitted work.
