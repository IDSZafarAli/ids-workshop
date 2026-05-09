---
marp: true
theme: ids-training-marp-theme
header: 'Commit Conventions'
paginate: true
footer: '&copy; 2026 - Integrated Dealer Systems'
---
# Commit Conventions

This project enforces commit message conventions _modified_ from [Husky](https://typicode.github.io/husky/) and [commitlint](https://commitlint.js.org/).

## Why Commit Conventions?

Conventional commit messages provide:
- **Automated changelog generation** - Generate release notes automatically
- **Version management** - Auto-detect semantic versioning (patch/minor/major)
- **Clear history** - Understand changes at a glance
- **Consistency** - Standardized commit format across the team

---

## Commit Format

All commit messages must follow this format:

```
<jira> <type>: <subject>
```

### Allowed Types

This project uses the following commit types:

- **`chore:`** - Maintenance tasks (dependencies, configs, tooling)
- **`doc:`** - Documentation changes
- **`feat:`** - New features or functionality
- **`fix:`** - Bug fixes
- **`refact:`** - Code refactoring (no functional changes)
- **`tool:`** - Maintenance tasks (dependencies, configs, tooling)
- **`ux:`** - User experience improvements (UI/UX changes)

---
### JIRA Integration

**All commits must include a JIRA ticket number** in the scope (parentheses). The format is:

```
<type>(<JIRA-ID>): <subject>
```

Where `<JIRA-ID>` follows the pattern: `PROJECT-NUMBER` (e.g., `IDS-123`, `PROJ-456`)
---

### Examples

```bash
# Good commits
git commit -m "feat(IDS-123): add vendor management API"
git commit -m "fix(IDS-456): resolve location sync timeout issue"
git commit -m "ux(IDSMOD-1001): improve dashboard button styling"
git commit -m "refact(IDSMOD-2001): extract address validation logic"
git commit -m "doc(IDSMOD-2222): update API authentication guide"
git commit -m "chore(IDSMOD-321): upgrade NestJS to v11.1.8"

# Bad commits (will be rejected)
git commit -m "Added new feature"           # Missing type prefix
git commit -m "feature: add vendor API"     # Wrong type (should be 'feat')
git commit -m "Fix: bug in sync"            # Subject shouldn't be capitalized
git commit -m "update docs"                 # Missing type prefix
git commit -m "feat: add vendor API"        # Missing JIRA ID in scope
git commit -m "fix(ids-123): resolve bug"   # JIRA ID must be uppercase
git commit -m "fix(IDS-123): RESOLVED BUG"   # commit message cannot be ALL UPPERCASE
```
---

## How It Works

### Husky
Husky manages Git hooks that run automatically before commits. It's configured in:
- `.husky/commit-msg` - Validates commit messages before accepting them

### Commitlint
Commitlint validates commit messages against our rules. Configuration:
- `.commitlintrc.json` - Defines allowed types and rules

When you make a commit, Husky triggers commitlint to validate the message. Invalid commits are rejected with an error message explaining what's wrong.

---
## Setup Commit Message Template

To make writing proper commit messages easier, configure your git to use the commit message template:

```bash
./scripts/setup-git-config.sh
```

This sets up:
- **Commit template** - Pre-filled format in VS Code's commit input and git editor
- **Format reminder** - Shows the required pattern and examples

The template will appear automatically when you:
- Type a commit message in VS Code's Source Control panel
- Run `git commit` in the terminal

**Note:** New team members should run this script after cloning the repository (it's included in the getting started guide).
---

---
## Generating Releases

Once you have commits following the convention, use these commands:

```bash
# Generate CHANGELOG.md and bump version automatically
npm run release              # Auto-detects version bump based on commits

# Force specific version bump
npm run release:patch        # 0.0.1 → 0.0.2 (bug fixes)
npm run release:minor        # 0.0.1 → 0.1.0 (new features)
npm run release:major        # 0.0.1 → 1.0.0 (breaking changes)
```

The release command will:
1. Analyze commit messages since last release
2. Generate/update `CHANGELOG.md` with grouped changes
3. Bump version in `package.json`
4. Create a git commit and tag for the release

---

## Changelog Sections

Commits are grouped in the changelog by type:

- ✨ **Features** - `feat:` commits
- 🐛 **Bug Fixes** - `fix:` commits
- 🎨 **UX Improvements** - `ux:` commits
- ♻️ **Code Refactoring** - `refact:` commits
- 📚 **Documentation** - `doc:` commits
- 🔧 **Chores** - `chore:` commits

---

## Troubleshooting

### Commit rejected with validation error
Make sure your commit message:
- Starts with one of the allowed types followed by a colon
- Has a lowercase subject (no capital letters at the start)
- Follows the format: `type: subject`

### Bypassing validation (not recommended)
If you absolutely need to bypass validation:
```bash
git commit --no-verify -m "emergency fix"
```
**Note:** This should only be used in exceptional circumstances.

---

## Resources

- [Conventional Commits Specification](https://www.conventionalcommits.org/)
- [Husky Documentation](https://typicode.github.io/husky/)
- [Commitlint Documentation](https://commitlint.js.org/)
- [standard-version Documentation](https://github.com/conventional-changelog/standard-version)