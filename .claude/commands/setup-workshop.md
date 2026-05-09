# /setup-workshop

You are setting up a developer's machine to run the IDS Workshop from scratch.
Work through each step in order. Check before installing — skip anything already present.
Be OS-aware: detect Windows vs macOS vs WSL and use the right commands for each.
After each tool install, verify it works before continuing.

---

## Step 0 — Detect the environment

Run the following and report what you find before doing anything else.

**macOS / WSL / Linux (Bash tool):**
- `uname -s`
- `grep -qi microsoft /proc/version 2>/dev/null && echo WSL || true`
- `node --version 2>/dev/null || echo "Node: NOT FOUND"`
- `git --version 2>/dev/null || echo "Git: NOT FOUND"`
- `docker --version 2>/dev/null || echo "Docker: NOT FOUND"`
- `docker info 2>/dev/null | grep "Server Version" || echo "Docker daemon: NOT RUNNING"`
- `code --version 2>/dev/null | head -1 || echo "VS Code CLI: NOT FOUND"`

**Windows (PowerShell tool):**
- `node --version`
- `git --version`
- `docker --version`
- `code --version | Select-Object -First 1`
- `Test-Path "C:\Program Files\Git\bin\bash.exe"`

Announce clearly: OS detected, what is installed, what is missing. Then proceed step by step.

---

## Step 1 — Git (+ Git Bash on Windows)

**Skip if:** `git --version` succeeds.

**Windows:** `winget install --id Git.Git --source winget --silent --accept-package-agreements --accept-source-agreements`  
Then reload PATH: `$env:PATH = [System.Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('PATH','User')`

**macOS:** `xcode-select --install` (triggers system dialog — tell user to click Install) or `brew install git` if Homebrew is present.

**WSL/Linux:** `sudo apt-get update -qq && sudo apt-get install -y git`

**Verify:** `git --version`

---

## Step 2 — NVM + Node 24

**Skip if:** `node --version` returns `v24.x.x`.

### macOS / WSL / Linux

Check: `[ -s "$HOME/.nvm/nvm.sh" ] && echo "nvm present" || echo "nvm missing"`

Install NVM if missing:
```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
```

Install Node 24:
```
nvm install 24
nvm use 24
nvm alias default 24
```

### Windows

Check: `Get-Command nvm -ErrorAction SilentlyContinue`

Install nvm-windows if missing: `winget install --id CoreyButler.NVMforWindows --source winget --silent --accept-package-agreements --accept-source-agreements`  
Reload PATH, then:
```
nvm install 24
nvm use 24
```

**Verify:** `node --version` shows `v24.x.x`

---

## Step 3 — Docker Desktop

**Check:** `docker info 2>/dev/null | head -3`

- Daemon running → skip.
- Command exists but daemon not running → Docker Desktop is installed but not started (Step 3b).
- Not found → install (Step 3a).

### Step 3a — Install

**Windows:** `winget install --id Docker.DockerDesktop --source winget --accept-package-agreements --accept-source-agreements`  
Note: Docker Desktop may require a Windows logout/reboot after first install. If it says so, tell the user and wait for confirmation before continuing.

**macOS:** `brew install --cask docker && open /Applications/Docker.app`

**WSL:** Docker Desktop runs on the Windows host.
1. Install on Windows using the winget command above.
2. Open Docker Desktop → Settings → Resources → WSL Integration → enable the distro.
3. `docker info` should then work inside WSL.

### Step 3b — Wait for daemon

```
for i in $(seq 1 60); do
  docker info >/dev/null 2>&1 && echo "Docker ready" && break
  printf "  Waiting... %ds\r" $((i * 2))
  sleep 2
done
```

On Windows: running `npm run dev:full-reset` (Step 8) will auto-start Docker Desktop — no need to wait here.

**Verify:** `docker ps` returns without error.

---

## Step 4 — VS Code

**Skip if:** `code --version` succeeds.

**Windows:** `winget install --id Microsoft.VisualStudioCode --source winget --silent --accept-package-agreements --accept-source-agreements`  
Then reload PATH.

**macOS:** `brew install --cask visual-studio-code`

**WSL:** Install VS Code on Windows. The `code` CLI bridges automatically into WSL. If `code --version` still fails, open VS Code on Windows and run Command Palette → "Install 'code' command in PATH".

**Verify:** `code --version`

---

## Step 5 — Configure Git Bash as default VS Code terminal (Windows only)

Skip on macOS and WSL.

The settings file is: `$env:APPDATA\Code\User\settings.json`

1. Read the existing file (create with `{}` if it does not exist).
2. Parse as JSON — fix any syntax errors (trailing commas, etc.) before merging.
3. Merge in these keys without overwriting other settings:

```json
{
  "terminal.integrated.defaultProfile.windows": "Git Bash",
  "terminal.integrated.profiles.windows": {
    "Git Bash": {
      "path": "C:\\Program Files\\Git\\bin\\bash.exe",
      "args": ["--login", "-i"],
      "icon": "terminal-bash"
    }
  }
}
```

4. Write the merged JSON back to the file (pretty-printed, UTF-8).

Tell the user: "Reload VS Code (Ctrl+Shift+P → Developer: Reload Window) for the terminal change to take effect."

---

## Step 6 — Verify / clone the repo

**Check:** `[ -f package.json ] && [ -f nx.json ] && echo "in repo" || echo "not in repo"`

If already in the repo → confirm and continue.

If not: ask the user for the repository URL, then `git clone <url> ids-workshop && cd ids-workshop`. If the folder already exists nearby, `cd` into it.

---

## Step 7 — npm install

**Check:** `[ -d node_modules ] && echo "present ($(ls node_modules | wc -l) pkgs)" || echo "missing"`

If missing: `npm install`

Verify no blocking errors in output. Warnings about peer dependencies are normal and safe to ignore.

---

## Step 8 — Full environment reset

```
npm run dev:full-reset
```

This script (`scripts/reset-from-scratch.ts`) will:
- Auto-detect and start Docker Desktop if needed
- Release port conflicts from other Docker projects
- Tear down and recreate all Docker containers + volumes
- Import the Logto auth database and seed test users/orgs
- Sync M2M credentials into `.env`
- Create the RavenDB `ids_dms` database
- Start the NestJS API server (port 3000) and wait until healthy
- Seed all test data: locations, parts, vendors, bins
- Start the React web server (port 3004)

**Expected duration:** 3–8 minutes on first run.

If this step fails, read the error — the script prints clear diagnostics. Common issues are auto-resolved (port conflicts, Docker startup, M2M credentials). Re-running is safe — the script is idempotent.

---

## Step 9 — Final verification

```
docker ps --format "table {{.Names}}\t{{.Status}}"
curl -s http://localhost:3000/api/SystemHealth/ping
```

Report the service URLs:

| Service | URL |
|---|---|
| Web UI | http://localhost:3004 |
| API + Swagger | http://localhost:3000/api/docs |
| RavenDB Studio | http://localhost:3333 |
| Logto Admin | http://localhost:3002 |
| Mailpit | http://localhost:8025 |

**Test users:**
- `alice@acme-rv.com` / `xyab12dE`  (parts clerk, LOC_AAA / LOC_BBB / LOC_CCC)
- `mike@acme-rv.com` / `xyab12dE`   (CEO, LOC_HQ)
- `admin@acme-rv.com` / `Admin123!` (Logto admin)

---

## Error handling rules

- If any step fails, report the exact command and error, suggest a fix, then ask: "Should I retry, skip this step, or stop?"
- If Docker Desktop requires a reboot after first install (Windows), tell the user and wait for confirmation before continuing.
- If a winget install says "already installed" → verify the tool works and treat as success.
- Never silently continue past a failed step.
- `npm run dev:full-reset` is safe to re-run if it fails partway through.
