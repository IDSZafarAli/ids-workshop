# /run-project — Autonomous Workshop Environment Recovery

You are getting a non-technical workshop participant's environment running again. The participant typed `/run-project` and is watching this chat. **They do not type shell commands.** You do everything — probe what's wrong, run the smallest fix that resolves it, start all four servers, and end with a follow-up invitation.

**Hard rules:**
- No confirmation prompts. No "are you sure?" questions. Workshop data is disposable.
- Narrate in plain English, one sentence per step. **Never** dump raw shell output, stack traces, or exit codes unless a step actually fails.
- Pick the **cheapest** fix that resolves the symptom. `npm run dev:full-reset` is the last-resort fallback, not the default.
- If OS-level pieces are missing (Node, Docker Desktop not installed) → say "Your machine isn't set up yet. Please run `/setup-workshop` first." and stop.
- Run via Bash tool by default (uses Git Bash on Windows); use PowerShell only when noted (port-owner checks).

---

## Step 1 — Quick environment sanity

Verify the basics before probing. If any fails, stop and point to `/setup-workshop`.

```
docker --version
node --version
[ -f package.json ] && [ -d apps/astra-apis ] && [ -d apps/client-web ]
```

If `docker` or `node` are missing → "Your machine isn't fully set up. Run `/setup-workshop` first." Stop.
If not in the repo root → "I don't see the workshop project here. `cd` into the `ids-workshop` folder and try again." Stop.

---

## Step 2 — The probe (run all in parallel)

Run these checks together via a single Bash tool call where possible. Capture each result. **Do not narrate the probe itself** — only narrate the conclusions in Step 3.

| # | Check | Command | Pass = |
|---|---|---|---|
| 1 | Docker daemon | `docker info >/dev/null 2>&1 && echo ok \|\| echo down` | `ok` |
| 2 | Containers running | `docker ps --format '{{.Names}}'` | output includes `logto_svc_aiws`, `postgres_aiws`, `ravendb_aiws`, `mailpit_aiws` |
| 3 | Logto OIDC | `curl -sf -o /dev/null -w '%{http_code}' http://localhost:3001/oidc/.well-known/openid-configuration` | `200` |
| 4 | RavenDB reachable | `curl -sf -o /dev/null -w '%{http_code}' http://localhost:3333/databases` | `200` |
| 5 | `ids_dms` DB exists | `curl -sf http://localhost:3333/databases \| grep -q ids_dms && echo ok \|\| echo missing` | `ok` |
| 6 | API health | `curl -sf -o /dev/null -w '%{http_code}' http://localhost:3000/api/SystemHealth/ping` | `200` |
| 7 | Web reachable | `curl -sf -o /dev/null -w '%{http_code}' http://localhost:3004` | `200` |
| 8 | `.env` M2M creds | `grep -E '^LOGTO_M2M_APP_(ID\|SECRET)=.+\S' .env \| wc -l` | `2` |
| 10 | `node_modules` | `[ -d node_modules ] && [ "$(ls node_modules \| wc -l)" -gt 100 ] && echo ok \|\| echo missing` | `ok` |
| 12 | Doctor sidecar | `curl -sf -o /dev/null -w '%{http_code}' http://localhost:3999/health 2>/dev/null \|\| echo down` | `200` |
| 13 | Doctor flag | `grep -E '^VITE_ENABLE_IDS_DOCTOR=true' .env && grep -E '^VITE_DOCTOR_URL=' .env` | both lines present |
| 14 | Doctor widget built | `[ -f apps/astra-dev-doctor/widget/dist/doctor.js ] && echo ok \|\| echo missing` | `ok` |

**Port owners (Windows — use PowerShell tool):**
```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,3004,3333,3999 -ErrorAction SilentlyContinue |
  ForEach-Object {
    $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    "$($_.LocalPort) $($_.OwningProcess) $($proc.ProcessName)"
  }
```

**Port owners (Mac/Linux — Bash tool):**
```
for p in 3000 3001 3002 3004 3333 3999; do lsof -iTCP:$p -sTCP:LISTEN -P -n 2>/dev/null | tail -n +2 | awk -v p=$p '{print p, $2, $1}'; done
```

**API auth check (#11)** — only if #6 passed:
```
curl -sf -o /dev/null -w '%{http_code}' http://localhost:3000/api/locations
```
Expect `200`, `401`, or `403`. `401` with creds present in `.env` → `logto-creds-wiped`.

---

## Step 3 — Classify and announce

Pick **exactly one** classification from the table below (top to bottom — first match wins). State it in plain English to the user before acting:

| Probe outcome | Classification | One-line narration |
|---|---|---|
| #10 red | `deps-missing` | "Your dependencies aren't installed yet — I'll run `npm install` (this takes ~2 minutes)." |
| ≥3 of {#2, #3, #5, #8, #11} red | `multi-layer-broken` | "Several pieces are off at once — the fastest way is a clean reset. This takes 3–8 minutes." |
| #11 red, but #2 + #3 green | `logto-creds-wiped` | "Your Logto credentials are out of sync — I'll refresh them and reseed (about 90 seconds)." |
| #8 red | `creds-missing` | "Your `.env` is missing Logto credentials — I'll sync them and restart the API." |
| #1 red | `docker-off` | "Docker is off — starting it now (this can take up to 2 minutes on Windows)." |
| #2 red | `containers-down` | "Docker is on but the project containers are stopped — bringing them up." |
| #5 red | `db-missing` | "The application database isn't initialized — I'll create it and seed test data." |
| #13 red | `doctor-flag-off` | "The Doctor widget is disabled — enabling it and restarting the web server." |
| #6 red | `api-down` | "The API server isn't running — starting it." |
| #7 red | `web-down` | "The web server isn't running — starting it." |
| #12 red | `doctor-down` | "Starting the Doctor sidecar so you can use the in-browser diagnostic widget." |
| port 3000/3004 held by a non-our process | `foreign-port-conflict` | "Something else on your machine is using port {N} ({process name}, PID {pid}). I tried to stop it but it stayed. Please close that program and run `/run-project` again." Stop. |
| All probes green | `all-green` | "Everything looks healthy." (Skip to Step 5.) |

**Multiple classifications can apply** (e.g. doctor-down + web-down). When the chosen primary fix also fixes others as a side effect (e.g. `multi-layer-broken` → full reset starts everything), don't re-run them. Otherwise execute additional fixes in the order they appear in the table.

---

## Step 4 — Execute the fix

For each classification, run the sequence below. After every fix, re-run probes #6, #7, #12 to confirm before reporting success.

### `deps-missing`
```
npm install
```
Then return to Step 2 (re-probe everything).

### `docker-off`
Use the same logic as `scripts/reset-from-scratch.ts:40-94`:
1. Try `docker info` once.
2. If still failing, launch Docker Desktop:
   - **Windows**: spawn `C:\Program Files\Docker\Docker\Docker Desktop.exe` (or `%LOCALAPPDATA%\Docker\Docker Desktop.exe`) in background.
   - **Mac**: `open /Applications/Docker.app`.
3. Poll `docker info` every 2s, up to 60 attempts (2 min).
4. If still down after 2 min → "Docker Desktop didn't start. Please open it manually from the Start menu, then run `/run-project` again." Stop.

Then return to Step 2.

### `containers-down`
```
docker compose up -d
```
Then wait for Logto OIDC to be live (poll `:3001/oidc/.well-known/openid-configuration`, 2s × 60). Then return to Step 2.

### `logto-creds-wiped`
This is the path the user explicitly asked about. **All four steps required** — skipping `update-creds` leaves the API auth broken.

```
# 1. Restore Logto init DB (menu option 6)
tsx scripts/logto.ts logto:db:import-init

# 2. Wait for Logto to come back
# Poll http://localhost:3001/oidc/.well-known/openid-configuration → 200 (2s × 60)

# 3. Seed users + organizations (menu option 1)
tsx scripts/logto.ts logto:seed

# 4. Pause 3s for Logto DB commit

# 5. Sync new M2M creds into .env (menu option 7) — CRITICAL
tsx scripts/logto.ts logto:update-creds

# 6. Stop API if running, then restart so it reads fresh .env
bash ./scripts/stop-dev-servers.sh
# (Then start API — see "Start servers" below.)

# 7. Wait for API health (poll /api/SystemHealth/ping, 1s × 120)

# 8. Seed app data (needs API running)
npm run db -- seed
```

### `creds-missing`
```
tsx scripts/logto.ts logto:update-creds
bash ./scripts/stop-dev-servers.sh    # API only — to pick up new .env
```
Then restart API (see "Start servers" below).

### `db-missing`
```
tsx scripts/ensure_ids_dms_db_exists.ts
npm run db -- seed
```

### `doctor-flag-off`
Edit `.env` — set or insert these two lines:
```
VITE_ENABLE_IDS_DOCTOR=true
VITE_DOCTOR_URL=http://localhost:3999
```
Then restart `client-web` (kill the existing process via `stop-dev-servers.sh` and respawn — Vite inlines env at build, so the running process won't pick up the change otherwise).

### `multi-layer-broken`
```
npm run dev:full-reset
```
**Then re-apply doctor-flag-off**: `reset-from-scratch.ts:163-173` overwrites `.env` from `.env.example` where `VITE_ENABLE_IDS_DOCTOR=false`. Without this step, the widget silently disappears after a full reset.

### `api-down` / `web-down` / `doctor-down` — "Start servers"

These run in the background (non-blocking spawns). Use Bash tool with `run_in_background: true`.

```
# API (port 3000)
npx nx serve astra-apis
# wait: poll http://localhost:3000/api/SystemHealth/ping → 200 (1s × 120)

# Web (port 3004) — start in parallel with doctor below
npx nx dev client-web

# Doctor sidecar (port 3999) — matches scripts/dev.ts:116-138
nx serve astra-dev-doctor
nx run @ids-ai-skeleton/astra-dev-doctor:watch-widget
```

The API needs a wait gate (other things depend on it being live). Web and Doctor are fire-and-forget — narrate "starting in the background" and move on.

### `foreign-port-conflict`
First try `bash ./scripts/stop-dev-servers.sh` (it handles ports 3000/3004/3999 + nx zombies). Re-probe. If the foreign process is still holding the port, **stop and tell the user**:
> "Port {N} is being used by `{process name}` (PID {pid}), which doesn't look like a leftover from your last session. Please close that program (or restart your computer), then run `/run-project` again."

Do not force-kill non-ours processes.

---

## Step 5 — Final verification and report

Before declaring success, verify these are all true:

```
curl -sf http://localhost:3000/api/SystemHealth/ping        # API responding
curl -sf http://localhost:3004                              # Web responding
curl -sf http://localhost:3999/health 2>/dev/null           # Doctor responding (best-effort)
```

If any of these fail after your fix, re-classify and try once more. If still failing twice → "I couldn't get {service} running. The error was: {one-line summary}. Try running `/run-project` again, or run `/setup-workshop` if this keeps happening."

**On success, print exactly this footer:**

```
✓ Ready.

  Web        → http://localhost:3004
  API docs   → http://localhost:3000/api/docs
  RavenDB    → http://localhost:3333
  Logto      → http://localhost:3002
  Doctor     → bottom-right widget on the web page (or http://localhost:3999)

Test users:
  • alice@acme-rv.com / xyab12dE   (parts clerk — LOC_AAA, LOC_BBB, LOC_CCC)
  • mike@acme-rv.com  / xyab12dE   (CEO — LOC_HQ)
  • admin@acme-rv.com / Admin123!  (Logto admin)

── Anything you want me to help with right now? ──
Paste an error, describe what you're trying to do, or tell me what to work
on (e.g. "add a discount field to parts"). If you just wanted things running,
you can close this chat.
```

---

## Step 6 — Follow-up routing (when the user replies)

If the user replies to the invitation, route their message based on what they said:

- **Error message / stack trace / "I'm getting a 500" / "the page is broken"** → Invoke `/ids-doctor`. Start by reading `.doctor/latest.md` per its instructions.
- **"how do I..." / "where is..." / "what does..."** → Answer the question directly. Don't invoke `/ids-doctor` for general questions.
- **"add X" / "change Y to Z" / "make it do..."** → Treat as a feature request. Follow the plan-first workflow in `CLAUDE.md` — produce a plan, ask for approval, then implement.
- **"thanks" / "great" / closes the chat** → No-op.

---

## Narration style guide

- Tense: present continuous when starting ("starting the API server…"), past simple when reporting completion ("started the API server (took 14s).").
- One sentence per step. No bulleted lists in the chat output during execution — the user shouldn't have to read a table to know what's happening.
- Times: round to 5s if under a minute, to a whole minute otherwise. "Took 38s" not "took 38.412s". "Took 2 min" not "took 1m 47s".
- When something is unexpectedly slow but still working, narrate it: "Logto is taking longer than usual to come back — still waiting (about 45s in)."
- **Avoid** these words in narration to a non-technical user: "container", "daemon", "OIDC", "M2M", "JWT", "spawn", "PID". Use the friendly equivalents: "the database", "Docker", "the login service", "the API credentials", "the access token", "starting", "process".
- Example: *not* "OIDC endpoint returned 200 on attempt 3" — *yes* "the login service is up."

---

## Reference: ports and processes

| Port | Service | How to start | Owner check |
|---|---|---|---|
| 3000 | astra-apis (NestJS) | `npx nx serve astra-apis` | port-owner probe |
| 3001 | Logto API | docker container `logto_svc_aiws` | OIDC config endpoint |
| 3002 | Logto admin UI | docker container `logto_svc_aiws` | port-owner probe |
| 3004 | client-web (Vite) | `npx nx dev client-web` | port-owner probe |
| 3333 | RavenDB Studio | docker container `ravendb_aiws` | `/databases` endpoint |
| 3999 | astra-dev-doctor sidecar | `nx serve astra-dev-doctor` | port-owner probe |
| 8025 | Mailpit UI | docker container `mailpit_aiws` | optional |
| 1025 | Mailpit SMTP | docker container `mailpit_aiws` | optional |

## Scope

Diagnose and recover the local workshop environment. Do not modify application source code, run migrations against production, or push any commits. If the user's follow-up message asks for a code change, exit the `/run-project` mode and follow the standard plan-first workflow.
