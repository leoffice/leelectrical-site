// Client for agent access grants (time-boxed one-time codes).
import { functionsBase } from "./functionsBase.js";

const SESSION_KEY = "lepro_agent_session";

function sessionStore() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

async function post(body) {
  const res = await fetch(`${functionsBase()}/agent-access`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `agent-access: HTTP ${res.status}`);
  }
  return data;
}

export async function fetchAgentAccessStatus() {
  const res = await fetch(`${functionsBase()}/agent-access?cb=${Date.now()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`agent-access: HTTP ${res.status}`);
  return res.json();
}

export async function mintAgentAccess({ ttlMs, scope, label } = {}) {
  return post({ op: "mint", ttlMs, scope, label });
}

export async function redeemAgentAccess(code, { label } = {}) {
  return post({ op: "redeem", code, label: label || "agent" });
}

export async function revokeAgentAccess() {
  return post({ op: "revoke" });
}

export async function endAgentAccess(token) {
  return post({ op: "end", token });
}

export function getAgentSession() {
  const s = sessionStore();
  if (!s) return null;
  try {
    const raw = s.getItem(SESSION_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    return obj;
  } catch {
    return null;
  }
}

export function setAgentSession(session) {
  const s = sessionStore();
  if (!s) return;
  if (!session) {
    s.removeItem(SESSION_KEY);
    return;
  }
  s.setItem(
    SESSION_KEY,
    JSON.stringify({
      token: session.token,
      grantId: session.grantId,
      scope: session.scope || "full",
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      label: session.label || "agent",
    })
  );
}

export function clearAgentSession() {
  setAgentSession(null);
}

/** True when a non-expired agent session is stored. */
export function isAgentSessionActive(now = Date.now()) {
  const sess = getAgentSession();
  if (!sess?.token || !sess.expiresAt) return false;
  if (now >= Number(sess.expiresAt)) {
    clearAgentSession();
    return false;
  }
  return true;
}

export function agentSessionRemainingMs(now = Date.now()) {
  const sess = getAgentSession();
  if (!sess?.expiresAt) return 0;
  return Math.max(0, Number(sess.expiresAt) - now);
}

export function formatRemaining(ms) {
  const m = Math.max(0, Math.ceil(Number(ms) / 60000));
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm ? `${h}h ${rm}m` : `${h}h`;
  }
  return `${m} min`;
}
