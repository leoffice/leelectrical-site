/**
 * Agent access grants — time-boxed one-time codes for agent UI testing.
 * Pure helpers (hashing, code mint, doc mutation) live here for unit tests.
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const DOC_KEY = "agent-access-v1";
export const SECRET_KEY = "agent-access-signing-secret";
export const DEFAULT_TTL_MS = 30 * 60 * 1000;
/** Longest grant: 24h (UI offers 15m–24h). */
export const MAX_TTL_MS = 24 * 60 * 60 * 1000;
export const MIN_TTL_MS = 5 * 60 * 1000;
/**
 * Hard cap when payment access is on (money = shorter window).
 * Recommend 2h; Levi can change this one constant. Default mint for payment-enabled
 * grants should also prefer a shorter TTL than 24h (see clampTtlMsForPayments).
 */
export const PAYMENT_MAX_TTL_MS = 2 * 60 * 60 * 1000;
/** Suggested default when minting with payments (not enforced as min). */
export const PAYMENT_DEFAULT_TTL_MS = 60 * 60 * 1000;
export const MAX_AUDIT = 80;
export const SCOPES = new Set(["full", "test"]);

/** Unambiguous alphabet (no 0/O/1/I). */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function sha256Hex(s) {
  return createHash("sha256").update(String(s), "utf8").digest("hex");
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

export function normalizeCode(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function formatCode(raw) {
  const n = normalizeCode(raw);
  if (n.length !== 8) return n;
  return `${n.slice(0, 4)}-${n.slice(4)}`;
}

export function generateCode() {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return formatCode(out);
}

export function generateToken() {
  return randomBytes(24).toString("hex");
}

export function generateGrantId() {
  return `g_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function clampTtlMs(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_TTL_MS;
  return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, Math.round(n)));
}

/** Tighter clamp when the grant carries payment access. */
export function clampTtlMsForPayments(raw) {
  const n = Number(raw);
  const base = !Number.isFinite(n) ? PAYMENT_DEFAULT_TTL_MS : Math.round(n);
  return Math.min(PAYMENT_MAX_TTL_MS, Math.max(MIN_TTL_MS, base));
}

export function normalizeScope(raw) {
  const s = String(raw || "full").toLowerCase();
  return SCOPES.has(s) ? s : "full";
}

export function normalizePayments(raw) {
  return raw === true || raw === "true" || raw === 1 || raw === "1";
}

export function emptyDoc() {
  return { activeGrant: null, audit: [] };
}

export function pushAudit(doc, entry) {
  const audit = Array.isArray(doc.audit) ? doc.audit.slice() : [];
  audit.unshift({ at: Date.now(), ...entry });
  if (audit.length > MAX_AUDIT) audit.length = MAX_AUDIT;
  return { ...doc, audit };
}

/** Expire or clear dead grants (mutates copy). */
export function refreshGrantState(doc, now = Date.now()) {
  let next = { ...emptyDoc(), ...doc, audit: Array.isArray(doc?.audit) ? doc.audit : [] };
  const g = next.activeGrant;
  if (!g) return next;
  if (g.revokedAt) {
    next = { ...next, activeGrant: null };
    return next;
  }
  if (g.expiresAt && now >= g.expiresAt) {
    next = pushAudit(
      { ...next, activeGrant: null },
      { type: "expire", grantId: g.id, scope: g.scope, note: "Grant expired" }
    );
    return next;
  }
  if (g.session?.expiresAt && now >= g.session.expiresAt) {
    next = pushAudit(
      {
        ...next,
        activeGrant: {
          ...g,
          session: null,
          usedAt: g.usedAt,
        },
      },
      { type: "expire", grantId: g.id, scope: g.scope, note: "Agent session expired" }
    );
    // Used grant with no session → drop it so a new mint can replace it.
    if (next.activeGrant?.usedAt && !next.activeGrant.session) {
      next = { ...next, activeGrant: null };
    }
    return next;
  }
  return next;
}

export function publicGrant(g, now = Date.now()) {
  if (!g) return null;
  return {
    id: g.id,
    scope: g.scope,
    /** Orthogonal money capability — independent of test/full. */
    payments: g.payments === true,
    createdAt: g.createdAt,
    expiresAt: g.expiresAt,
    remainingMs: Math.max(0, (g.expiresAt || 0) - now),
    used: !!g.usedAt,
    hasSession: !!(g.session && g.session.expiresAt > now),
    sessionStartedAt: g.session?.startedAt || null,
    sessionExpiresAt: g.session?.expiresAt || null,
    revokedAt: g.revokedAt || null,
  };
}

export function mintGrant(doc, { ttlMs, scope, label, payments } = {}, now = Date.now()) {
  let next = refreshGrantState(doc, now);
  const prev = next.activeGrant;
  if (prev) {
    next = pushAudit(
      { ...next, activeGrant: null },
      {
        type: "revoke",
        grantId: prev.id,
        scope: prev.scope,
        note: prev.session
          ? "Replaced by new grant (ended active session)"
          : "Replaced by new grant",
      }
    );
  }

  const code = generateCode();
  const pay = normalizePayments(payments);
  const ttl = pay ? clampTtlMsForPayments(ttlMs) : clampTtlMs(ttlMs);
  const sc = normalizeScope(scope);
  const grant = {
    id: generateGrantId(),
    codeHash: sha256Hex(normalizeCode(code)),
    scope: sc,
    payments: pay,
    label: String(label || "agent").slice(0, 40),
    ttlMs: ttl,
    createdAt: now,
    expiresAt: now + ttl,
    usedAt: null,
    session: null,
    revokedAt: null,
  };
  const payNote = pay ? " · payments" : "";
  next = pushAudit(
    { ...next, activeGrant: grant },
    {
      type: "mint",
      grantId: grant.id,
      scope: sc,
      payments: pay,
      note: `Code minted · ${Math.round(ttl / 60000)} min${payNote}`,
    }
  );
  return { doc: next, code: formatCode(code), grant: publicGrant(grant, now) };
}

/**
 * Extend the current grant by +ttlMs (same code / same session).
 * Remaining time is preserved and the chosen duration is added on top.
 * Scope can be updated. Fails if there is no active grant.
 */
export function extendGrant(doc, { ttlMs, scope, payments } = {}, now = Date.now()) {
  let next = refreshGrantState(doc, now);
  const g = next.activeGrant;
  if (!g) {
    return {
      ok: false,
      error: "No active access code to extend. Grant a new one first.",
      doc: next,
    };
  }
  const pay =
    payments !== undefined && payments !== null && payments !== ""
      ? normalizePayments(payments)
      : g.payments === true;
  const add = pay ? clampTtlMsForPayments(ttlMs) : clampTtlMs(ttlMs);
  const sc = scope != null && scope !== "" ? normalizeScope(scope) : g.scope;
  const base = Math.max(Number(g.expiresAt) || now, now);
  const newExpires = base + add;
  const updated = {
    ...g,
    scope: sc,
    payments: pay,
    ttlMs: add,
    expiresAt: newExpires,
    session:
      g.session && g.session.expiresAt
        ? {
            ...g.session,
            // Keep session clock in lockstep with the grant expiry.
            expiresAt: newExpires,
            payments: pay,
          }
        : g.session || null,
  };
  const mins = Math.round(add / 60000);
  next = pushAudit(
    { ...next, activeGrant: updated },
    {
      type: "extend",
      grantId: g.id,
      scope: sc,
      payments: pay,
      note: `Extended +${mins} min · same code${pay ? " · payments" : ""}`,
    }
  );
  return {
    ok: true,
    doc: next,
    grant: publicGrant(updated, now),
    extendedMs: add,
  };
}

export function redeemGrant(doc, code, { label } = {}, now = Date.now()) {
  let next = refreshGrantState(doc, now);
  const g = next.activeGrant;
  if (!g) return { ok: false, error: "No active access code. Ask Levi for a new one.", doc: next };
  if (g.revokedAt) return { ok: false, error: "This code was revoked.", doc: next };
  if (now >= g.expiresAt) return { ok: false, error: "This code expired.", doc: next };
  if (g.usedAt || g.session) {
    return { ok: false, error: "This code was already used. Ask Levi for a new one.", doc: next };
  }
  const codeHash = sha256Hex(normalizeCode(code));
  if (!safeEqualHex(codeHash, g.codeHash)) {
    next = pushAudit(next, {
      type: "redeem_fail",
      grantId: g.id,
      scope: g.scope,
      note: "Wrong code attempted",
    });
    return { ok: false, error: "Wrong code. Check digits and try again.", doc: next };
  }

  const token = generateToken();
  const session = {
    tokenHash: sha256Hex(token),
    startedAt: now,
    expiresAt: g.expiresAt,
    label: String(label || "agent").slice(0, 40),
    payments: g.payments === true,
  };
  const updated = {
    ...g,
    usedAt: now,
    session,
  };
  next = pushAudit(
    { ...next, activeGrant: updated },
    {
      type: "redeem",
      grantId: g.id,
      scope: g.scope,
      payments: g.payments === true,
      note: `Session started · ${session.label}`,
    }
  );
  return {
    ok: true,
    doc: next,
    token,
    session: {
      grantId: g.id,
      scope: g.scope,
      payments: g.payments === true,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      remainingMs: Math.max(0, session.expiresAt - now),
      label: session.label,
    },
  };
}

export function revokeGrant(doc, now = Date.now()) {
  let next = refreshGrantState(doc, now);
  const g = next.activeGrant;
  if (!g) return { ok: true, doc: next, revoked: false };
  next = pushAudit(
    {
      ...next,
      activeGrant: null,
    },
    { type: "revoke", grantId: g.id, scope: g.scope, note: "Revoked by owner" }
  );
  return { ok: true, doc: next, revoked: true, grantId: g.id };
}

export function endSession(doc, token, now = Date.now()) {
  let next = refreshGrantState(doc, now);
  const g = next.activeGrant;
  if (!g?.session) return { ok: true, doc: next, ended: false };
  if (!safeEqualHex(sha256Hex(token), g.session.tokenHash)) {
    return { ok: false, error: "Invalid session", doc: next };
  }
  next = pushAudit(
    { ...next, activeGrant: null },
    { type: "end", grantId: g.id, scope: g.scope, note: "Agent ended session" }
  );
  return { ok: true, doc: next, ended: true };
}

export function statusPayload(doc, now = Date.now()) {
  const fresh = refreshGrantState(doc, now);
  return {
    ok: true,
    grant: publicGrant(fresh.activeGrant, now),
    audit: (fresh.audit || []).slice(0, 40),
    defaults: {
      ttlMs: DEFAULT_TTL_MS,
      minTtlMs: MIN_TTL_MS,
      maxTtlMs: MAX_TTL_MS,
      paymentMaxTtlMs: PAYMENT_MAX_TTL_MS,
      paymentDefaultTtlMs: PAYMENT_DEFAULT_TTL_MS,
      scopes: ["full", "test"],
      /** Payments capability defaults OFF on every new grant. */
      paymentsDefault: false,
    },
    _doc: fresh,
  };
}

/**
 * Resolve an active agent session from a bearer/token string.
 * Returns null when token is missing/invalid/expired (treat as non-agent / human).
 */
export function resolveAgentSession(doc, token, now = Date.now()) {
  if (!token) return null;
  const fresh = refreshGrantState(doc, now);
  const g = fresh.activeGrant;
  if (!g?.session?.tokenHash) return null;
  if (!safeEqualHex(sha256Hex(token), g.session.tokenHash)) return null;
  if (g.session.expiresAt && now >= g.session.expiresAt) return null;
  return {
    grantId: g.id,
    scope: g.scope,
    payments: g.payments === true,
    label: g.session.label || g.label || "agent",
    expiresAt: g.session.expiresAt,
    doc: fresh,
  };
}

/**
 * Extract agent session token from a request (Authorization Bearer or body/header).
 * Does not validate — pair with resolveAgentSession.
 */
export function extractAgentTokenFromRequest(req, body = {}) {
  try {
    const h = req?.headers?.get?.("authorization") || req?.headers?.get?.("Authorization") || "";
    const m = String(h).match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
    const x = req?.headers?.get?.("x-agent-token") || req?.headers?.get?.("X-Agent-Token");
    if (x) return String(x).trim();
  } catch {
    /* ignore */
  }
  if (body?.agentToken) return String(body.agentToken).trim();
  if (body?.agent_session_token) return String(body.agent_session_token).trim();
  return "";
}

/**
 * Server gate for payment endpoints under an agent session.
 * - No agent token → { kind: "human" } (owner path; unrestricted here).
 * - Agent token without payments → denied (403 shape) + payment_denied audit.
 * - Agent token with payments but no per-action confirm → denied (needs confirm).
 * - Agent + payments + confirm → allowed (still no processor secrets exposed).
 *
 * Specific permitted ops (invoice pay / read-only / refunds) stay DISABLED until Levi picks.
 */
export function gateAgentPaymentAction(doc, { token, confirmed, op, amount, ref } = {}, now = Date.now()) {
  const sess = resolveAgentSession(doc, token, now);
  if (!sess) {
    return { kind: "human", ok: true, doc: refreshGrantState(doc, now) };
  }
  const baseAudit = {
    grantId: sess.grantId,
    scope: sess.scope,
    payments: sess.payments === true,
    op: String(op || "payment"),
    amount: amount != null ? Number(amount) : null,
    ref: ref != null ? String(ref).slice(0, 80) : null,
  };
  if (!sess.payments) {
    const next = pushAudit(sess.doc, {
      type: "payment_denied",
      ...baseAudit,
      note: "Agent session lacks payment access",
      result: "denied_no_capability",
    });
    return {
      kind: "agent",
      ok: false,
      status: 403,
      error: "This agent key does not include payment access.",
      doc: next,
      auditType: "payment_denied",
    };
  }
  // Hard requirement: no silent auto-charge even with payment access.
  if (!confirmed) {
    const next = pushAudit(sess.doc, {
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
        "Payment access requires explicit per-action confirmation. Stage only — charge does not fire on the token alone.",
      doc: next,
      auditType: "payment_denied",
      needsConfirm: true,
    };
  }
  // Scaffold: capability + confirm present, but NO specific action is enabled yet.
  // Levi must choose permitted ops (invoice pay / status read / refunds) before enablement.
  const next = pushAudit(sess.doc, {
    type: "payment_attempt",
    ...baseAudit,
    note: "Payment capability scaffold — no permitted action enabled yet",
    result: "scaffold_blocked",
  });
  return {
    kind: "agent",
    ok: false,
    status: 403,
    error:
      "Payment access is scaffolded but no specific payment actions are enabled yet. Waiting on Levi for permitted ops.",
    doc: next,
    auditType: "payment_attempt",
    scaffoldOnly: true,
  };
}

/** True when body/header signals explicit per-action payment confirmation. */
export function hasPaymentConfirmation(body = {}) {
  if (body.paymentConfirmed === true || body.confirmed === true) return true;
  if (body.ownerConfirm === true) return true;
  const tok = body.paymentConfirmToken || body.confirmToken || body.confirm_token;
  return !!(tok && String(tok).trim().length >= 8);
}
