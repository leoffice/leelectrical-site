/**
 * Agent Access — toggle + known fleet identity model (CROSS-APP STANDARD).
 * Supersedes generate-code / redeem-code. Pure helpers for unit tests + DO store.
 *
 * Canonical: ~/.hermes/shared/handoff/AGENT_ACCESS_STANDARD.md
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

/** Per-app access-state key (LE Pro reference). Other apps use their own id. */
export const APP_ID = "le-pro";
export const DOC_KEY = "agent-access-state-v2";
export const SECRET_KEY = "agent-access-signing-secret";

/** 24h auto-off window. */
export const AUTO_OFF_MS = 24 * 60 * 60 * 1000;
export const MAX_AUDIT = 80;

/** Timer modes: 24h auto-off, or manual (stays on until STOP). */
export const TIMER_MODES = new Set(["24h", "manual"]);

/**
 * Known fleet agent ids (identity boundary — must pair with secret).
 * Spoofable header alone is NEVER enough.
 */
export const KNOWN_FLEET_AGENTS = new Set([
  "israel",
  "eved",
  "dispatch",
  "office",
  "hermes",
  "fleet",
  "cowork",
  "grok",
]);

export function sha256Hex(s) {
  return createHash("sha256").update(String(s), "utf8").digest("hex");
}

export function safeEqualString(a, b) {
  try {
    const ba = Buffer.from(String(a || ""), "utf8");
    const bb = Buffer.from(String(b || ""), "utf8");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function safeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a || ""), "hex");
    const bb = Buffer.from(String(b || ""), "hex");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function generateId(prefix = "a") {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function normalizeTimerMode(raw) {
  const s = String(raw || "manual").toLowerCase();
  if (s === "24" || s === "24h" || s === "auto" || s === "auto24") return "24h";
  return "manual";
}

export function emptyDoc() {
  return {
    v: 2,
    appId: APP_ID,
    accessOn: false,
    timerMode: "manual",
    autoOffAt: null,
    paymentsOn: false,
    turnedOnAt: null,
    turnedOffAt: null,
    lastChangedAt: null,
    audit: [],
  };
}

export function pushAudit(doc, entry) {
  const audit = Array.isArray(doc.audit) ? doc.audit.slice() : [];
  audit.unshift({ at: Date.now(), ...entry });
  if (audit.length > MAX_AUDIT) audit.length = MAX_AUDIT;
  return { ...doc, audit };
}

/**
 * Apply auto-off if past autoOffAt. Never false-denies when still on.
 * Strong-consistency store (DO) is required so this read is authoritative.
 */
export function refreshAccessState(doc, now = Date.now()) {
  let next = { ...emptyDoc(), ...doc, audit: Array.isArray(doc?.audit) ? doc.audit : [] };
  if (!next.accessOn) return next;
  if (next.timerMode === "24h" && next.autoOffAt && now >= Number(next.autoOffAt)) {
    next = pushAudit(
      {
        ...next,
        accessOn: false,
        paymentsOn: false,
        autoOffAt: null,
        turnedOffAt: now,
        lastChangedAt: now,
      },
      {
        type: "auto_off",
        note: "24-hour automatic turn-off",
      }
    );
  }
  return next;
}

/** Owner-visible public snapshot (no secrets). */
export function publicAccessState(doc, now = Date.now()) {
  const fresh = refreshAccessState(doc, now);
  const remainingMs =
    fresh.accessOn && fresh.timerMode === "24h" && fresh.autoOffAt
      ? Math.max(0, Number(fresh.autoOffAt) - now)
      : null;
  return {
    accessOn: !!fresh.accessOn,
    timerMode: fresh.timerMode === "24h" ? "24h" : "manual",
    autoOffAt: fresh.autoOffAt || null,
    remainingMs,
    standing: !!(fresh.accessOn && fresh.timerMode === "manual"),
    paymentsOn: !!fresh.paymentsOn,
    turnedOnAt: fresh.turnedOnAt || null,
    turnedOffAt: fresh.turnedOffAt || null,
    lastChangedAt: fresh.lastChangedAt || null,
    appId: fresh.appId || APP_ID,
  };
}

/**
 * Turn agent access ON or OFF.
 * @param {{ on: boolean, timerMode?: '24h'|'manual', actor?: string }} opts
 */
export function setAccess(doc, { on, timerMode, actor } = {}, now = Date.now()) {
  let next = refreshAccessState(doc, now);
  const wantOn = on === true;
  const mode = timerMode != null ? normalizeTimerMode(timerMode) : next.timerMode || "manual";
  const who = String(actor || "owner").slice(0, 40);

  if (wantOn) {
    const autoOffAt = mode === "24h" ? now + AUTO_OFF_MS : null;
    next = {
      ...next,
      accessOn: true,
      timerMode: mode,
      autoOffAt,
      turnedOnAt: now,
      turnedOffAt: null,
      lastChangedAt: now,
    };
    next = pushAudit(next, {
      type: "access_on",
      note: mode === "24h" ? `Access ON · 24h auto-off · ${who}` : `Access ON · manual (until STOP) · ${who}`,
      timerMode: mode,
      actor: who,
    });
  } else {
    const wasOn = next.accessOn;
    next = {
      ...next,
      accessOn: false,
      paymentsOn: false,
      autoOffAt: null,
      turnedOffAt: now,
      lastChangedAt: now,
    };
    if (wasOn) {
      next = pushAudit(next, {
        type: "access_off",
        note: `Access OFF · ${who}`,
        actor: who,
      });
    }
  }
  return { doc: next, state: publicAccessState(next, now) };
}

/** Change timer mode while access is on (or set preferred mode while off). */
export function setTimerMode(doc, { timerMode, actor } = {}, now = Date.now()) {
  let next = refreshAccessState(doc, now);
  const mode = normalizeTimerMode(timerMode);
  const who = String(actor || "owner").slice(0, 40);
  const autoOffAt = next.accessOn && mode === "24h" ? now + AUTO_OFF_MS : mode === "24h" ? next.autoOffAt : null;
  next = {
    ...next,
    timerMode: mode,
    autoOffAt: next.accessOn ? (mode === "24h" ? now + AUTO_OFF_MS : null) : null,
    lastChangedAt: now,
  };
  next = pushAudit(next, {
    type: "timer_mode",
    note: mode === "24h" ? `Timer → 24h auto-off · ${who}` : `Timer → manual · ${who}`,
    timerMode: mode,
    actor: who,
    autoOffAt: next.autoOffAt,
  });
  void autoOffAt;
  return { doc: next, state: publicAccessState(next, now) };
}

/**
 * Payment management access — OFF by default. Explicit opt-in.
 * Does not turn main access on; agent still needs accessOn for any action.
 */
export function setPayments(doc, { on, actor } = {}, now = Date.now()) {
  let next = refreshAccessState(doc, now);
  const want = on === true;
  const who = String(actor || "owner").slice(0, 40);
  next = {
    ...next,
    paymentsOn: want,
    lastChangedAt: now,
  };
  next = pushAudit(next, {
    type: want ? "payments_on" : "payments_off",
    note: want
      ? `Payment management ON · stages only · per-action confirm required · ${who}`
      : `Payment management OFF · ${who}`,
    actor: who,
  });
  return { doc: next, state: publicAccessState(next, now) };
}

/** STOP — primary safeguard. Instant OFF for access + payments. */
export function stopAccess(doc, { actor } = {}, now = Date.now()) {
  return setAccess(doc, { on: false, actor: actor || "owner-stop" }, now);
}

/** Log an agent action under access (audit trail). */
export function recordAction(doc, { type, note, agentId, op, amount, ref, result } = {}, now = Date.now()) {
  let next = refreshAccessState(doc, now);
  next = pushAudit(next, {
    type: String(type || "action").slice(0, 40),
    note: String(note || "").slice(0, 200),
    agentId: agentId ? String(agentId).slice(0, 40) : undefined,
    op: op != null ? String(op).slice(0, 40) : undefined,
    amount: amount != null ? Number(amount) : undefined,
    ref: ref != null ? String(ref).slice(0, 80) : undefined,
    result: result != null ? String(result).slice(0, 40) : undefined,
    at: now,
  });
  return { doc: next };
}

export function statusPayload(doc, now = Date.now()) {
  const fresh = refreshAccessState(doc, now);
  return {
    ok: true,
    state: publicAccessState(fresh, now),
    /** @deprecated alias — prefer state */
    grant: null,
    audit: (fresh.audit || []).slice(0, 40),
    defaults: {
      timerMode: "manual",
      autoOffMs: AUTO_OFF_MS,
      paymentsDefault: false,
      appId: APP_ID,
      model: "toggle+fleet-identity",
      codes: false,
    },
    _doc: fresh,
  };
}

/* ── Fleet identity ─────────────────────────────────────────────────────── */

/**
 * Resolve fleet shared secret from env (Cloudflare secret / process).
 * Empty → identity checks fail closed for agent paths.
 */
export function resolveFleetSecret(env = {}) {
  const v =
    env.LE_FLEET_AGENT_SECRET ||
    env.FLEET_AGENT_SECRET ||
    (typeof process !== "undefined" ? process.env?.LE_FLEET_AGENT_SECRET || process.env?.FLEET_AGENT_SECRET : "") ||
    "";
  return String(v || "").trim();
}

/**
 * Extract claimed agent identity + key material from request.
 * Identity alone is NOT trusted — must pass authenticateFleetIdentity.
 */
export function extractFleetIdentityFromRequest(req, body = {}) {
  let agentId = "";
  let key = "";
  let ts = "";
  let sig = "";
  try {
    agentId =
      req?.headers?.get?.("x-le-agent-id") ||
      req?.headers?.get?.("X-LE-Agent-Id") ||
      body?.agentId ||
      body?.agent ||
      "";
    key =
      req?.headers?.get?.("x-le-agent-key") ||
      req?.headers?.get?.("X-LE-Agent-Key") ||
      "";
    ts = req?.headers?.get?.("x-le-agent-ts") || req?.headers?.get?.("X-LE-Agent-Ts") || "";
    sig = req?.headers?.get?.("x-le-agent-sig") || req?.headers?.get?.("X-LE-Agent-Sig") || "";
    const auth = req?.headers?.get?.("authorization") || req?.headers?.get?.("Authorization") || "";
    const m = String(auth).match(/^Bearer\s+fleet:([^:]+):(.+)$/i);
    if (m) {
      if (!agentId) agentId = m[1];
      if (!key && !sig) key = m[2].trim();
    } else {
      const m2 = String(auth).match(/^Bearer\s+(.+)$/i);
      // Only treat as fleet key when agent id is also present (avoid eating owner tokens).
      if (m2 && agentId && !key) key = m2[1].trim();
    }
  } catch {
    /* ignore */
  }
  return {
    agentId: String(agentId || "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 40),
    key: String(key || "").trim(),
    ts: String(ts || "").trim(),
    sig: String(sig || "").trim(),
  };
}

/**
 * Authenticate genuine fleet identity.
 * Accepts either:
 *  (1) shared secret equality (X-LE-Agent-Key == LE_FLEET_AGENT_SECRET), or
 *  (2) HMAC-SHA256(secret, `${agentId}:${ts}`) in X-LE-Agent-Sig with fresh ts (±5 min).
 * Agent id must be in KNOWN_FLEET_AGENTS.
 */
export function authenticateFleetIdentity(claim, env = {}, now = Date.now()) {
  const secret = resolveFleetSecret(env);
  if (!secret) {
    return { ok: false, error: "Fleet identity is not configured on the server." };
  }
  const agentId = String(claim?.agentId || "").toLowerCase();
  if (!agentId || !KNOWN_FLEET_AGENTS.has(agentId)) {
    return { ok: false, error: "Unknown agent identity." };
  }
  // Path 1: shared secret
  if (claim.key && safeEqualString(claim.key, secret)) {
    return { ok: true, agentId, method: "shared_secret" };
  }
  // Path 2: HMAC over agentId:ts
  if (claim.sig && claim.ts) {
    const tsN = Number(claim.ts);
    if (!Number.isFinite(tsN) || Math.abs(now - tsN) > 5 * 60 * 1000) {
      return { ok: false, error: "Agent identity signature expired or skew too large." };
    }
    const expected = createHmac("sha256", secret).update(`${agentId}:${tsN}`).digest("hex");
    if (safeEqualHex(claim.sig, expected)) {
      return { ok: true, agentId, method: "hmac" };
    }
  }
  return { ok: false, error: "Agent identity could not be verified." };
}

/**
 * Authorize a fleet agent action against the access-state record.
 * Assume-and-act: caller always tries; backend returns denied when off/expired.
 */
export function authorizeAgentAction(doc, { agentId, requirePayments } = {}, now = Date.now()) {
  const fresh = refreshAccessState(doc, now);
  if (!fresh.accessOn) {
    return {
      ok: false,
      status: 403,
      code: "access_off",
      error: "access is off — toggle it back on",
      state: publicAccessState(fresh, now),
      doc: fresh,
    };
  }
  if (requirePayments && !fresh.paymentsOn) {
    const next = pushAudit(fresh, {
      type: "payment_denied",
      agentId,
      note: "Payment management access is off",
      result: "denied_no_capability",
    });
    return {
      ok: false,
      status: 403,
      code: "payments_off",
      error: "Payment management access is off — turn it on in Settings → Agent Access.",
      state: publicAccessState(next, now),
      doc: next,
    };
  }
  return {
    ok: true,
    agentId,
    paymentsOn: !!fresh.paymentsOn,
    state: publicAccessState(fresh, now),
    doc: fresh,
  };
}

/**
 * Payment gate for agent identity (not code sessions).
 * Human/owner (no fleet identity) → pass through.
 * Agent without access → deny with access_off message.
 * Agent without payments → deny.
 * Agent with payments but no per-action confirm → deny (stage only).
 * Agent + payments + confirm → allowed to STAGE (still scaffold; no silent charge).
 */
export function gateAgentPaymentAction(
  doc,
  { agentId, fleetOk, confirmed, op, amount, ref } = {},
  now = Date.now()
) {
  if (!fleetOk || !agentId) {
    return { kind: "human", ok: true, doc: refreshAccessState(doc, now) };
  }
  const auth = authorizeAgentAction(doc, { agentId, requirePayments: true }, now);
  if (!auth.ok) {
    return {
      kind: "agent",
      ok: false,
      status: auth.status || 403,
      error: auth.error,
      code: auth.code,
      doc: auth.doc,
      auditType: "payment_denied",
    };
  }
  const baseAudit = {
    agentId,
    payments: true,
    op: String(op || "payment"),
    amount: amount != null ? Number(amount) : null,
    ref: ref != null ? String(ref).slice(0, 80) : null,
  };
  if (!confirmed) {
    const next = pushAudit(auth.doc, {
      type: "payment_denied",
      ...baseAudit,
      note: "Missing per-action confirmation",
      result: "denied_no_confirm",
    });
    return {
      kind: "agent",
      ok: false,
      status: 403,
      error:
        "Payment access requires explicit per-action confirmation. Stage only — charge does not fire on the agent alone.",
      doc: next,
      auditType: "payment_denied",
      needsConfirm: true,
    };
  }
  // STAGE allowed — real charge still requires owner in-app confirm path.
  // Scaffold records attempt; permitted charge execution stays behind security review.
  const next = pushAudit(auth.doc, {
    type: "payment_attempt",
    ...baseAudit,
    note: "Payment staged · awaiting owner confirm / security-reviewed charge path",
    result: "staged",
  });
  return {
    kind: "agent",
    ok: true,
    staged: true,
    status: 200,
    doc: next,
    auditType: "payment_attempt",
  };
}

export function hasPaymentConfirmation(body = {}) {
  if (body.paymentConfirmed === true || body.confirmed === true) return true;
  if (body.ownerConfirm === true) return true;
  const tok = body.paymentConfirmToken || body.confirmToken || body.confirm_token;
  return !!(tok && String(tok).trim().length >= 8);
}

/* ── UI agent session (lock-screen "Enter as agent") ─────────────────────── */

/** Manual/standing UI session ceiling (STOP still ends access server-side). */
export const STANDING_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Build a signed agent UI session token.
 * Format: base64url(payloadJson).hexHmac — payload is not secret; HMAC binds it.
 */
export function signAgentSessionPayload(payload, env = {}) {
  const secret = resolveFleetSecret(env);
  if (!secret) throw new Error("Fleet identity is not configured on the server.");
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  return `${body}.${sig}`;
}

/** Verify + parse a session token from markAgentUnlocked / x-agent-token. */
export function verifyAgentSessionToken(token, env = {}, now = Date.now()) {
  const secret = resolveFleetSecret(env);
  if (!secret) return { ok: false, error: "Fleet identity is not configured on the server." };
  const raw = String(token || "").trim();
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return { ok: false, error: "Invalid agent session token." };
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (!safeEqualHex(sig, expected)) return { ok: false, error: "Invalid agent session token." };
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, error: "Invalid agent session token." };
  }
  const exp = Number(payload?.expiresAt);
  if (!payload?.grantId || !payload?.agentId || !Number.isFinite(exp)) {
    return { ok: false, error: "Invalid agent session token." };
  }
  // Tenant / app binding — reject tokens minted for another app (cross-tenant replay).
  const tokenApp = String(payload?.appId || "").trim();
  if (!tokenApp || tokenApp !== APP_ID) {
    return { ok: false, error: !tokenApp ? "Invalid agent session token." : "Agent session is not valid for this app." };
  }
  if (now >= exp) return { ok: false, error: "Agent session expired." };
  return { ok: true, session: payload };
}

/**
 * Mint a UI agent session for a verified fleet identity while access is ON.
 * Bypasses biometric/password — identity + toggle are the boundary.
 * Payments stay off in scope unless the payment sub-toggle is on.
 *
 * @returns {{ ok, token, grantId, scope, expiresAt, startedAt, paymentsOn, label, state, doc } | deny}
 */
export function mintAgentSession(doc, { agentId, label } = {}, env = {}, now = Date.now()) {
  const auth = authorizeAgentAction(doc, { agentId, requirePayments: false }, now);
  if (!auth.ok) {
    return {
      ok: false,
      status: auth.status || 403,
      code: auth.code || "access_off",
      error: auth.error || "agent access is off",
      state: auth.state,
      doc: auth.doc,
    };
  }
  const state = auth.state;
  const paymentsOn = !!state.paymentsOn;
  const scope = paymentsOn ? "full" : "full-nopay";
  // 24h → expire at autoOffAt; manual → standing ceiling (STOP ends access server-side).
  let expiresAt =
    state.timerMode === "24h" && state.autoOffAt
      ? Number(state.autoOffAt)
      : now + STANDING_SESSION_MS;
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    expiresAt = now + Math.min(AUTO_OFF_MS, STANDING_SESSION_MS);
  }
  const grantId = generateId("ags");
  const startedAt = now;
  const who = String(agentId || "fleet").slice(0, 40);
  const payload = {
    v: 1,
    appId: APP_ID,
    grantId,
    agentId: who,
    scope,
    paymentsOn,
    startedAt,
    expiresAt,
    label: String(label || who || "agent").slice(0, 40),
  };
  let token;
  try {
    token = signAgentSessionPayload(payload, env);
  } catch (e) {
    return {
      ok: false,
      status: 503,
      code: "identity_config",
      error: String(e?.message || e),
      state,
      doc: auth.doc,
    };
  }
  const next = pushAudit(auth.doc, {
    type: "ui_enter",
    agentId: who,
    note: `UI Enter as agent · ${scope} · ${state.standing || state.timerMode === "manual" ? "standing" : "24h"}`,
    grantId,
    result: "minted",
  });
  return {
    ok: true,
    token,
    grantId,
    scope,
    expiresAt,
    startedAt,
    paymentsOn,
    label: payload.label,
    agentId: who,
    state: publicAccessState(next, now),
    doc: next,
  };
}

/** @deprecated code-era helpers — stubs so old imports fail clearly if any remain */
export function mintGrant() {
  throw new Error("Agent access codes removed — use setAccess toggle (AGENT_ACCESS_STANDARD).");
}
export function redeemGrant() {
  throw new Error("Agent access codes removed — use fleet identity + access toggle.");
}
export function extendGrant() {
  throw new Error("Agent access codes removed — use setAccess / setTimerMode.");
}
export function revokeGrant(doc, now = Date.now()) {
  return stopAccess(doc, { actor: "revoke" }, now);
}
