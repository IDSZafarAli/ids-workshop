# IDS Workshop

Welcome to the IDS AI Skeleton workshop. This guide gets you from zero to a running development environment — no prior terminal experience needed.

---

## Which path is right for you?

| Situation | Go to |
|---|---|
| **Fresh machine** — nothing installed yet | [Section 1 → Bootstrap](#section-1-fresh-machine-bootstrap) |
| **Have Git + Node 24** but not the full environment | [Section 2 → Quick Setup](#section-2-quick-setup) |
| **Have everything** — just want to start the servers | [Section 3 → Daily Start](#section-3-daily-start) |

---

## Section 1: Fresh machine bootstrap

This section walks you through installing everything from scratch, including how to open a terminal. If you already have a terminal and Git, skip to [Section 2](#section-2-quick-setup).

### Step 1 — Open a terminal

A **terminal** is a text window where you type commands. Here is how to open one on each platform:

**Windows:**
1. Press the **Windows key**, type `PowerShell`, and click **Windows PowerShell** (or **Terminal**).
2. You will see a window with a blinking cursor. Leave it open — you will type commands here.

> **Tip:** If you see a blue window titled "Windows PowerShell", you are in the right place.

**macOS:**
1. Press **Cmd + Space** to open Spotlight.
2. Type `Terminal` and press **Enter**.
3. A white or black window with a blinking cursor will open.

**WSL (Windows Subsystem for Linux):**
1. Press the **Windows key**, type `WSL`, and press Enter.
2. Or open Windows Terminal and click the dropdown arrow → select your Linux distro.

---

### Step 2 — Navigate to the workshop folder

You need to tell the terminal where the workshop files are.

**If you have already cloned/downloaded the repo:**

Type `cd ` (with a space after it), then drag-and-drop the workshop folder from File Explorer / Finder onto the terminal window. The folder path will appear automatically. Press **Enter**.

Example of what it looks like after you press Enter:
```
cd C:\Users\YourName\ids-workshop
```

**If you have not cloned the repo yet:**

Skip to Step 3 — the bootstrap script will ask for a URL and clone it for you.

---

### Step 3 — Run the bootstrap script

The bootstrap script installs: **Git**, **NVM**, **Node 24**, and the **Claude Code CLI**. It checks what you already have and skips anything already installed.

#### Windows (PowerShell)

**Easiest way — right-click:**

1. Open the workshop folder in **File Explorer**
2. Go into the `scripts` folder
3. Right-click `bootstrap.ps1`
4. Click **"Run with PowerShell"**

A blue PowerShell window will open and run the script. When it finishes it will say **"Press Enter to close this window"** — read the output before pressing Enter.

> **What if right-clicking doesn't show "Run with PowerShell"?**  
> Hold **Shift** while right-clicking — this shows extra options including "Run with PowerShell".

> **What if a blue window flashes and disappears immediately?**  
> The execution policy is blocking the script. Use the terminal method below instead.

**Alternative — terminal method:**

1. Press **Win + X** → click **Terminal** (or **Windows PowerShell**)
2. Navigate to the workshop folder (replace the path with your actual path):
```powershell
cd C:\Users\YourName\ids-workshop
```
3. Paste and run this single command:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force; .\scripts\bootstrap.ps1
```

> **What if it says "winget is not recognized"?**  
> winget ships with Windows 10/11 but may need updating. Open the **Microsoft Store**, search for **App Installer**, and click **Update**. Then re-run the bootstrap.

#### macOS / WSL / Linux (Bash)

```bash
bash scripts/bootstrap.sh
```

> **What if it says "permission denied"?**  
> Run: `chmod +x scripts/bootstrap.sh` and then try again.

---

### Step 4 — Restart your terminal

After the bootstrap completes, **close your terminal and open a fresh one**. This is important — it reloads your PATH so the new tools are found.

Navigate back to the workshop folder (same drag-and-drop trick from Step 2).

---

### Step 5 — Sign in to Claude Code and run the setup skill

The bootstrap installed the **Claude Code CLI**. This is an AI assistant that runs in your terminal and can see errors, install tools, and fix problems automatically.

> **You need a Claude.ai subscription** (any paid plan) to use Claude Code. If you do not have one, sign up at https://claude.ai before continuing.

Make sure your terminal is inside the workshop project folder (you should see `ids-workshop` in the folder path). Then start Claude Code:

```
claude
```

**First time only — authenticate:**

Claude Code will open your browser automatically and ask you to log in with your Claude.ai account. Sign in, then return to the terminal. You should see a welcome message confirming you are logged in.

> **Browser did not open?** Copy the URL shown in the terminal and paste it into your browser manually.

Once logged in, you will see a `>` prompt. Type the following and press **Enter**:

```
/setup-workshop
```

That is all — just type it and press Enter. Claude will take over and walk through the remaining steps, asking for your input only when needed.

Claude will then walk through the remaining steps automatically:
- Installing Docker Desktop
- Installing VS Code
- Configuring Git Bash as the default terminal in VS Code (Windows)
- Cloning the repo (if needed)
- Running `npm install`
- Running the full environment reset

It will pause and ask for your input whenever something needs a decision (e.g. if Docker Desktop needs a reboot after first install).

> **Never used AI tools before?** Just type what it asks. If something goes wrong, describe what you see and it will help you fix it.

---

## Section 2: Quick Setup

Use this section if you already have **Git** and **Node 24** installed, and just need to get the workshop environment running.

### Option A — Two commands (recommended)

```bash
npm install
npm run dev:full-reset
```

This single command handles everything:
- Starts Docker Desktop if it is not running
- Creates all Docker containers (Logto, RavenDB, PostgreSQL, Mailpit)
- Imports auth configuration and seeds test users
- Creates the RavenDB database and seeds all parts/inventory data
- Starts the API server (http://localhost:3000)
- Starts the Web UI (http://localhost:3004)

**Expected time:** 3–8 minutes on first run.

When you see this, you are ready:
```
✓ client-web starting at http://localhost:3004
```

### Option B — Manual step by step

If you prefer to understand each step or the one-command reset does not work:

**Terminal 1** — run these in order:
```bash
npm install
npm run docker -- up
npm run logto -- logto:db:import-init
npm run logto -- logto:seed
npm run logto -- logto:update-creds
```

**Terminal 2** — start the API and leave this terminal running:
```bash
npm run dev:apis
```

**Wait** until Terminal 2 shows: `Application is running on: http://localhost:3000`

**Back in Terminal 1** — seed the database and start the web server:
```bash
npm run db -- seed
npm run dev:web
```

---

## Section 3: Daily Start

You have already done the setup. You just want to start coding again.

**Start the environment:**
```bash
npm run docker -- down
npm run docker -- up
npm run dev:apis
npm run dev:web
```

**If you want a completely clean slate** (wipes database and re-seeds everything):
```bash
npm run dev:full-reset
```

---

## Login

Open http://localhost:3004 in your browser.

| | |
|---|---|
| URL | http://localhost:3004 |
| Email | `alice@acme-rv.com` |
| Password | `xyab12dE` |

Other test accounts:

| Email | Password | Role |
|---|---|---|
| `alice@acme-rv.com` | `xyab12dE` | Parts Clerk (LOC_AAA, LOC_BBB, LOC_CCC) |
| `mike@acme-rv.com` | `xyab12dE` | CEO (LOC_HQ) |
| `sarah@acme-rv.com` | `xyab12dE` | Parts Clerk (LOC_AAA) |
| `admin@acme-rv.com` | `Admin123!` | Logto admin (console only) |

> **Getting `invalid_grant` errors after a reset?** This is expected — your browser has a stale session from before the reset. It will redirect you to sign in automatically within a few seconds. If it does not, open http://localhost:3004 in a new tab.

---

## Services

| Service | URL | What it is |
|---|---|---|
| Web UI | http://localhost:3004 | The React application |
| API | http://localhost:3000 | NestJS REST API |
| API Docs (Swagger) | http://localhost:3000/api/docs | Interactive API explorer |
| Logto Admin | http://localhost:3002 | Manage users, roles, organisations |
| RavenDB Studio | http://localhost:3333 | Browse/query the document database |
| Mailpit | http://localhost:8025 | Catches all outgoing emails |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | Nx |
| Backend | NestJS (TypeScript) |
| Database | RavenDB (document DB) |
| Auth | Logto (OAuth 2.0 / OIDC) |
| Frontend | React 19 + React Router 7 |
| UI | Material UI v7 |
| Infrastructure | Docker Compose |

---

## Project Structure

```
apps/
  astra-apis/     NestJS backend API (port 3000)
  client-web/     React frontend (port 3004)
libs/
  shared/
    data-models/  Shared DTOs and types (@ids/data-models)
scripts/          Dev tooling (docker, db, logto, reset)
  bootstrap.sh    Fresh-machine setup — macOS/WSL
  bootstrap.ps1   Fresh-machine setup — Windows
database/
  seeds/          Seed data (parts, locations, bins, vendors)
docs/             Architecture, coding standards, design standards
.claude/
  commands/       Claude Code slash commands (/setup-workshop)
```

---

## Included Features

- Authentication (sign in / sign out via Logto)
- Multi-location context switching
- Parts inventory (list view)

## What to Build

These features are intentionally omitted — workshop exercises:

- Parts create / edit
- Users list and detail
- Any additional domain you choose

---

## Troubleshooting

**`npm run dev:full-reset` fails with "port is already allocated"**  
Another Docker container from a different project is holding a port. Re-run the reset — it now auto-detects and stops conflicting containers.

**Docker daemon not running**  
Open Docker Desktop from your Start Menu / Applications folder. Wait for the whale icon in the system tray to stop animating, then retry.

**`nvm` not found after bootstrap**  
Close your terminal completely and open a new one. NVM is loaded in your shell profile, which only takes effect in a new session.

**`npm install` errors about Python / node-gyp**  
These are usually warnings about optional native modules and can be safely ignored. If the install fails completely, try: `npm install --ignore-scripts`

**The web app shows a white screen or keeps loading**  
The API server may not be ready yet. Check that `http://localhost:3000/api/SystemHealth/ping` returns `pong` in your browser before opening the web app.

**Something else is broken**  
Run `/setup-workshop` in Claude Code — it can diagnose and fix most issues automatically.
