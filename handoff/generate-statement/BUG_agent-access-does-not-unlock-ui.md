# BUG — Agent Access ON does not let an agent session past the LockGate

**Reported:** 2026-07-31 · **Severity:** high (blocks the whole point of Agent Access) · **Area:** LE Pro PWA app-open lock

## Symptom
With Agent Access toggled **ON (standing)**, an agent session opening `leelectrical.us/app/pro` still hits the full-screen **"Locked · unlock to continue"** gate. The only ways through are the device biometric (Face ID/fingerprint) or submitting the owner's Supabase email+password. There is **no Agent Access / agent-entry control on the lock screen**, and nothing consumes the ON toggle to unlock. An agent cannot (and must not) submit the owner's password, so it is fully blocked from the UI.

Observed: app briefly rendered (in-session grace from a prior human unlock), then the 15s re-lock poll returned to the password gate. Lock screen controls seen: Email, Password, **Unlock**, "Use biometrics instead" — nothing else.

## Root cause (code)
The agent-unlock plumbing exists but is **dead code — never wired**:

- `pro-src/src/lib/lock.js` → `markAgentUnlocked(session)` writes `sessionStorage["lepro_agent_session"]`, and `isSessionUnlocked()` honors it. **`markAgentUnlocked` has zero callers in the app** (only referenced in tests).
- `pro-src/src/components/LockGate.jsx` imports only biometric/password/session helpers — it **never references agent access** (`fetchAgentAccessStatus`, the toggle, or `markAgentUnlocked`). Comment line 7 says "toggle + fleet identity — AGENT_ACCESS_STANDARD," but no code implements the unlock.
- `pro-src/src/main.jsx` just wraps the app in `<LockGate>` with **no app-boot agent-session bootstrap**.
- `pro-src/src/lib/agentAccessClient.js` — the old code-era minters (`mintAgentAccess`, `mintAgentAccess24h`, `redeemAgentAccess`, …) are now **throwing stubs**. `fetchAgentAccessStatus()` exists but is only used by Settings (the toggle UI), never by the gate.

Net: the Agent Access DO/toggle (`workers/agent-access-do`, `netlify/functions/agent-access.mjs`) tracks `accessOn` and gates the **backend data/payment plane**, but nothing translates "toggle ON + fleet identity" into a front-end session that satisfies `isSessionUnlocked()`. So the LockGate never opens for an agent.

## Fix direction
On app boot (before/inside LockGate), when running as a fleet/agent session:
1. Call `fetchAgentAccessStatus()`; if `accessOn` and the caller presents valid fleet identity,
2. mint a short-lived agent session server-side and call `markAgentUnlocked({ token, grantId, scope, startedAt, expiresAt, label })`,
3. let `isSessionUnlocked()` pass so the gate opens, and keep it refreshed until the grant ends (STOP re-locks).

Until then, an agent can only read/act in the UI if a human unlocks the device first and grace is still valid — which defeats the feature.

## Impact on the Seewald statement task
Because of this bug, the exact latest progress-invoice figures (invoice #, ~$42,700 total, progress %, balance due) could **not** be read from the LE Pro UI by the agent. The statement HTML is otherwise complete (matching letterhead/logo, four confirmed $5,000 payments = $20,000, online-view note); only those figures remain to fill.
