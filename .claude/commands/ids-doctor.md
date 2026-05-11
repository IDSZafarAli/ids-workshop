# IDS Doctor — Diagnostic Session

Read `.doctor/latest.md` first — it is the single-file summary generated after every browser sync and tells you the session, page, user, findings, network timeline, and console errors. It also lists the raw evidence files at the bottom.

## File guide

| File | Read when |
|---|---|
| `.doctor/latest.md` | **Always** — start here |
| `.doctor/findings.json` | Findings exist and you need machine-readable detail |
| `.doctor/snapshot.json` | You need current URL, user, visible text, or UI error elements |
| `.doctor/latest-runtime-context.json` | Auth/location/theme context was captured (may be `{}`) |
| `.doctor/sessions/latest-network.jsonl` | You need full request/response bodies or headers (one JSON object per line) |
| `.doctor/sessions/latest-console.jsonl` | You need full stack traces for console errors |
| `.doctor/latest-dom-snapshot.md` | Layout or visibility issues — measured element rects |
| `.doctor/latest-dom-snapshot.json` | You need raw DOM node data |

## Workflow

1. Read `.doctor/latest.md`.
2. If findings exist, read `.doctor/findings.json` for structured detail.
3. Pull additional evidence files only as needed — do not load all of them by default.
4. Diagnose and report: what is wrong, why, and which file/line to fix.
5. If the fix is clear, apply it directly. If scope is uncertain, present the plan first.

## Scope

Diagnose only: environment issues, network/auth bugs, data bugs, UI errors visible in the snapshot. Do not refactor, rename, or clean up unrelated code.
