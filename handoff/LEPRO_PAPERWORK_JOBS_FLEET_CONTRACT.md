# LE Pro — paperwork-jobs FLEET CONSUMER CONTRACT (v1)

**Date:** 2026-08-02 · **Author:** Dispatch (Claude) · **Ships in:** le-pro-v261
**Endpoint:** `POST https://leelectrical.us/.netlify/functions/paperwork-jobs`
**For:** the local fleet agent (Angel + browser driver) implementing the consumer side of the app-driven create-case flow. The browser skill itself is `~/.hermes/skills/coned-create-case` (proven on MC-941412) — this doc is the QUEUE + APPROVAL bridge only.

## The flow (Levi's rules)

1. Levi completes **Submit a Case** in LE Pro → the app writes a `create_case` job, `status=queued`. The app is the ONLY interface — no job data over chat.
2. The fleet agent **claims** the job, opens Energy Services, and runs the `coned-create-case` skill with the job's `payload` — **fills to the Review screen and STOPS**.
3. Fleet **uploads a screenshot of the Review screen** and sets `status=awaiting_approval`.
4. Levi reviews screenshot + data **in the app** → Approve or Reject.
   **RED LINE (server-enforced): an update to `submitted` is HTTP 409-refused unless the job is `approved`.** Never click portal Submit before polling shows `approved`.
5. On `approved` → fleet clicks Submit in the portal → `status=submitted` with the `caseNumber` (MC-######) → then `status=done` after any post-submit checks. On `rejected` → abandon the portal wizard (do NOT submit), optionally `status=failed` with a note.

## Auth

- Fleet ops (`claim`, `update`) require header **`x-fleet-token: <token>`**.
- The token is the Cloudflare Pages secret **`PAPERWORK_FLEET_TOKEN`** on project `leelectrical-cf` (Levi/Dispatch sets it; generate ≥32 random chars). Until it is set, fleet ops return `503 {"error":"fleet_token_not_configured"}`.
- App ops (`create`, `list`, `get`, `approve`) are same-origin app calls — do not use them from the fleet.

## Job record shape

```json
{
  "id": "pj-<ts36><rand>",
  "type": "create_case",
  "jobId": "<LE Pro job id>",
  "tenant": "le",
  "payload": {
    "requestType": "add_load | no_additional_load | ...",
    "branch": "...",
    "...case fields from the questionnaire (plain ASCII)...",
    "answers": { "...sanitized questionnaire answers..." },
    "skill": "coned-create-case",
    "stopAt": "review",
    "autoSubmit": false,
    "jobId": "<same>"
  },
  "status": "queued | in_progress | awaiting_approval | approved | rejected | submitted | done | failed",
  "createdAt": "ISO", "updatedAt": "ISO",
  "claimedBy": "agent name", "claimedAt": "ISO",
  "screenshotKey": "pwshot-…", "screenshotUrl": "/.netlify/functions/docs?key=pwshot-…",
  "caseNumber": "MC-…", "error": "", "note": "",
  "history": [{ "at": "ISO", "status": "…", "by": "…", "note": "…" }]
}
```

## Ops (all `POST`, JSON body, JSON response `{ ok, ... }`)

### 1. Claim the next queued job (fleet, token)
```json
{ "op": "claim", "types": ["create_case"], "agent": "angel-browser-1" }
```
→ `{ "ok": true, "job": {…} }` with the job now `in_progress`, or `{ "ok": true, "job": null }` when the queue is empty. Poll every 30–60s.

### 2. Status updates (fleet, token)
```json
{ "op": "update", "id": "pj-…", "agent": "angel-browser-1",
  "status": "awaiting_approval",
  "screenshotB64": "<base64 PNG of the Review screen>",
  "screenshotMime": "image/png",
  "note": "filled to review, 6-step add-load wizard" }
```
- Screenshot ≤ 8 MB decoded; it is stored and served at `screenshotUrl` (docs store) — the app shows it on the approval screen. You may re-send a fresh screenshot while still `awaiting_approval` (same op).
- Progress-only updates: omit `status`, send `note`.
- Failure: `{ "op":"update", "id":…, "status":"failed", "error":"<honest reason>" }` from any active state.

### 3. Wait for Levi (fleet, token — poll)
Poll with claim-less reads is not provided on the token side; poll `update`-free via:
```json
{ "op": "get", "id": "pj-…" }
```
(`get` is open; polling it from the fleet is fine.) Proceed when `status` is:
- `approved` → click Submit, then:
```json
{ "op": "update", "id": "pj-…", "status": "submitted", "caseNumber": "MC-941412" }
```
then after post-submit verification:
```json
{ "op": "update", "id": "pj-…", "status": "done" }
```
- `rejected` → abandon the wizard, never submit. Optionally mark `failed` with note "rejected by Levi: <note>".

### Transition table (server-enforced)
```
queued -> in_progress -> awaiting_approval -> approved -> submitted -> done
   any active state -> failed
   awaiting_approval -> rejected  (terminal for the run; do not submit)
   awaiting_approval -> awaiting_approval  (re-screenshot allowed)
   submitted only from approved  <- THE RED LINE
```
Violations return `409 { "error": "bad_transition <from> -> <to>" }`.

## Quick smoke (once the token is set)
```bash
B=https://leelectrical.us/.netlify/functions/paperwork-jobs
T=<PAPERWORK_FLEET_TOKEN>
curl -s -X POST $B -H 'content-type: application/json' -H "x-fleet-token: $T" \
  -d '{"op":"claim","agent":"smoke"}'
```

## Notes
- Storage is the app's Cloudflare KV store (`paperwork-jobs`) + R2 docs store for screenshots — no Supabase dependency; the contract stays identical if storage later moves.
- Con Ed portal text: plain ASCII only (the payload is pre-sanitized, keep it that way).
- Session/login stays fleet-side and session-only — the backend never stores Con Ed credentials.
- App-side surfaces reading this data: JobDetail Con Ed block (per-run chip + Review & approve) and the Permits tab "Case runs" card.

## Consistency + retries (verified live 2026-08-02)
- Storage is Cloudflare KV: **reads can lag writes by up to ~60s across edge POPs.** The full lifecycle was E2E-verified on prod (create → claim → screenshot/awaiting_approval → 409 red-line refusal → approve → submitted MC → done; screenshot serves 200 image/png).
- Practical rules for the consumer: poll `get` every 30–60s (never assume the first read after your own write is fresh); if an `update` returns `409 bad_transition` right after a state you KNOW you reached (e.g. `done` right after `submitted`), wait 30s and retry once — that is read-lag, not a logic error. `409` on `submitted` while status still reads `awaiting_approval` means Levi has not approved yet: keep waiting, never retry your way past it.
- CF WAF may block default script user-agents (`python-urllib` got 403 on GETs). Send a real `user-agent` header.
- `claim` self-heals dropped queue entries by scanning recent jobs, so a job is never lost to the queue-list race; claiming is safe to repeat.
- Smoke history: job `pj-msc785el4eedp8` (jobId `e2e-pw-smoke2`) ran the whole lifecycle to `done` with dummy case MC-000000 — ignore it in listings.
