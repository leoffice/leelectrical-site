// Client for Agent Access — toggle + fleet identity + standing unlock code.
// Canonical: AGENT_ACCESS_STANDARD.md
// Lock-screen entry: standing code (Settings) OR plant fleet identity then mint_session.
import { functionsBase } from "./functionsBase.js";

/** 24h auto-off window (mirrors server AUTO_OFF_MS). */
export const AGENT_ACCESS_AUTO_OFF_MS = 24 * 60 * 60 * 1000;

/** sessionStorage key automation plants before "Enter as agent". */
export const FLEET_IDENTITY_KEY = "lepro_fleet_identity";

function sessionStore() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

function localStore() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/**
 * Fleet claim planted by host automation (never bundled).
 * Shape: { agentId, key }  OR  { agentId, ts, sig } (HMAC)
 */
export function getPlantedFleetIdentity() {
  try {
    if (globalThis.__LE_FLEET_IDENTITY__ && typeof globalThis.__LE_FLEET_IDENTITY__ === "object") {
      return normalizeClaim(globalThis.__LE_FLEET_IDENTITY__);
    }
  } catch {
    /* ignore */
  }
  for (const store of [sessionStore(), localStore()]) {
    if (!store) continue;
    try {
      const raw = store.getItem(FLEET_IDENTITY_KEY);
      if (!raw) continue;
      const obj = JSON.parse(raw);
      const claim = normalizeClaim(obj);
      if (claim) return claim;
    } catch {
      /* continue */
    }
  }
  return null;
}

function normalizeClaim(obj) {
  if (!obj || typeof obj !== "object") return null;
  const agentId = String(obj.agentId || obj.agent || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
  if (!agentId) return null;
  const key = String(obj.key || obj.secret || "").trim();
  const ts = String(obj.ts || "").trim();
  const sig = String(obj.sig || obj.signature || "").trim();
  if (!key && !(ts && sig)) return null;
  return { agentId, key, ts, sig };
}

/** Plant identity for this browser session (host / Playwright / Dispatch). */
export function plantFleetIdentity(claim) {
  const n = normalizeClaim(claim);
  if (!n) throw new Error("Invalid fleet identity claim");
  const payload = JSON.stringify(n);
  try {
    sessionStore()?.setItem(FLEET_IDENTITY_KEY, payload);
  } catch {
    /* storage unavailable */
  }
  return n;
}

export function clearPlantedFleetIdentity() {
  try {
    sessionStore()?.removeItem(FLEET_IDENTITY_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStore()?.removeItem(FLEET_IDENTITY_KEY);
  } catch {
    /* ignore */
  }
}

function fleetHeaders(claim) {
  const h = { "content-type": "application/json" };
  if (!claim?.agentId) return h;
  h["x-le-agent-id"] = claim.agentId;
  if (claim.key) h["x-le-agent-key"] = claim.key;
  if (claim.ts) h["x-le-agent-ts"] = claim.ts;
  if (claim.sig) h["x-le-agent-sig"] = claim.sig;
  if (claim.key && !claim.sig) {
    h.authorization = `Bearer fleet:${claim.agentId}:${claim.key}`;
  }
  return h;
}

async function post(body, { claim } = {}) {
  const identity = claim || getPlantedFleetIdentity();
  const res = await fetch(`${functionsBase()}/agent-access`, {
    method: "POST",
    cache: "no-store",
    headers: fleetHeaders(identity),
    body: JSON.stringify(body || {}),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || data.message || `agent-access: HTTP ${res.status}`);
    err.code = data.code;
    err.status = res.status;
    err.state = data.state;
    throw err;
  }
  return data;
}

export async function fetchAgentAccessStatus() {
  const res = await fetch(`${functionsBase()}/agent-access?cb=${Date.now()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`agent-access: HTTP ${res.status}`);
  const data = await res.json();
  // Flatten state fields for lock-screen convenience (Settings still uses .state).
  const st = data?.state || {};
  return {
    ...data,
    accessOn: st.accessOn ?? data.accessOn,
    standing: st.standing ?? data.standing,
    timerMode: st.timerMode ?? data.timerMode,
    autoOffAt: st.autoOffAt ?? data.autoOffAt,
    paymentsOn: st.paymentsOn ?? data.paymentsOn,
    remainingMs: st.remainingMs ?? data.remainingMs,
  };
}

/** Turn main agent access on/off. timerMode: "24h" | "manual". */
export async function setAgentAccess({ on, timerMode } = {}) {
  return post({
    op: "set_access",
    on: on === true,
    timerMode: timerMode === "24h" ? "24h" : timerMode === "manual" ? "manual" : undefined,
    actor: "owner",
  });
}

/** Prefer 24h auto-off vs manual (stays on until STOP). */
export async function setAgentAccessTimer(timerMode) {
  return post({
    op: "set_timer",
    timerMode: timerMode === "24h" ? "24h" : "manual",
    actor: "owner",
  });
}

/** Payment management access — OFF by default. */
export async function setAgentPayments({ on } = {}) {
  return post({
    op: "set_payments",
    on: on === true,
    actor: "owner",
  });
}

/** STOP — primary safeguard. Instant off. */
export async function stopAgentAccess() {
  return post({ op: "stop", actor: "owner-stop" });
}

/** @deprecated use stopAgentAccess */
export async function revokeAgentAccess() {
  return stopAgentAccess();
}

/**
 * Mint a signed UI agent session (lock-screen Enter as agent).
 * Prefer standing unlockCode (works for any agent while access ON).
 * Falls back to planted fleet identity for host automation.
 */
export async function mintAgentSession({ label, unlockCode } = {}) {
  const code = String(unlockCode || "").trim();
  if (code) {
    return post({ op: "mint_session", unlockCode: code, label: label || "agent-code" });
  }
  const claim = getPlantedFleetIdentity();
  if (!claim) {
    const err = new Error(
      "Enter the standing agent code from Settings → Agent Access."
    );
    err.code = "identity_missing";
    throw err;
  }
  return post({ op: "mint_session", label: label || claim.agentId }, { claim });
}

/** Owner: reveal standing unlock code (Settings). */
export async function revealStandingAgentCode() {
  return post({ op: "reveal_code", actor: "owner" });
}

/** Owner: rotate standing unlock code (old code dies immediately). */
export async function rotateStandingAgentCode() {
  return post({ op: "rotate_code", actor: "owner" });
}

/**
 * High-level lock-screen entry: mint session shape for markAgentUnlocked.
 * Pass unlockCode for the standing door key (recommended).
 */
export async function enterAsAgent({ label, unlockCode } = {}) {
  const data = await mintAgentSession({ label, unlockCode });
  if (!data?.token || !data?.expiresAt) {
    throw new Error(data?.error || "Could not start agent session");
  }
  return {
    token: data.token,
    grantId: data.grantId,
    scope: data.scope || "full",
    startedAt: data.startedAt || Date.now(),
    expiresAt: data.expiresAt,
    label: data.label || "agent",
    paymentsOn: !!data.paymentsOn,
  };
}

export function formatRemaining(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return "";
  const m = Math.max(0, Math.ceil(Number(ms) / 60000));
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm ? `${h}h ${rm}m` : `${h}h`;
  }
  return `${m} min`;
}

/** Status line for Settings summary. */
export function formatAccessStatusLine(state, now = Date.now()) {
  if (!state?.accessOn) return "OFF · no active access";
  const pay = state.paymentsOn ? " · Payments" : "";
  if (state.standing || state.timerMode === "manual") {
    return `ON · standing (until you stop)${pay}`;
  }
  const rem =
    state.remainingMs != null
      ? state.remainingMs
      : state.autoOffAt
        ? Math.max(0, Number(state.autoOffAt) - now)
        : null;
  if (rem != null) return `ON · ${formatRemaining(rem)} remaining${pay}`;
  return `ON · 24h auto-off${pay}`;
}

/* ── Legacy aliases → standing code / toggle ── */
export async function mintAgentAccess() {
  return revealStandingAgentCode();
}
export async function mintAgentAccess24h() {
  return revealStandingAgentCode();
}
export async function extendAgentAccess() {
  throw new Error("Standing code does not expire — use setAgentAccess / setAgentAccessTimer.");
}
export async function redeemAgentAccess(code) {
  return mintAgentSession({ unlockCode: code });
}
export async function endAgentAccess() {
  return stopAgentAccess();
}
