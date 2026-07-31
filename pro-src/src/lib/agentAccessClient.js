// Client for Agent Access — toggle + fleet identity (no codes).
// Canonical: AGENT_ACCESS_STANDARD.md
import { functionsBase } from "./functionsBase.js";

/** 24h auto-off window (mirrors server AUTO_OFF_MS). */
export const AGENT_ACCESS_AUTO_OFF_MS = 24 * 60 * 60 * 1000;

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

/* ── Removed code-era API (stubs throw if anything still calls them) ── */
export async function mintAgentAccess() {
  throw new Error("Access codes removed — use setAgentAccess toggle.");
}
export async function mintAgentAccess24h() {
  throw new Error("Access codes removed — use setAgentAccess({ on: true, timerMode: '24h' }).");
}
export async function extendAgentAccess() {
  throw new Error("Access codes removed — use setAgentAccess / setAgentAccessTimer.");
}
export async function redeemAgentAccess() {
  throw new Error("Access codes removed — fleet identity + access toggle only.");
}
export async function endAgentAccess() {
  throw new Error("Access codes removed.");
}
