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

export function normalizeScope(raw) {
  const s = String(raw || "full").toLowerCase();
  return SCOPES.has(s) ? s : "full";
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

export function mintGrant(doc, { ttlMs, scope, label } = {}, now = Date.now()) {
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
  const ttl = clampTtlMs(ttlMs);
  const sc = normalizeScope(scope);
  const grant = {
    id: generateGrantId(),
    codeHash: sha256Hex(normalizeCode(code)),
    scope: sc,
    label: String(label || "agent").slice(0, 40),
    ttlMs: ttl,
    createdAt: now,
    expiresAt: now + ttl,
    usedAt: null,
    session: null,
    revokedAt: null,
  };
  next = pushAudit(
    { ...next, activeGrant: grant },
    { type: "mint", grantId: grant.id, scope: sc, note: `Code minted · ${Math.round(ttl / 60000)} min` }
  );
  return { doc: next, code: formatCode(code), grant: publicGrant(grant, now) };
}

/**
 * Extend the current grant by +ttlMs (same code / same session).
 * Remaining time is preserved and the chosen duration is added on top.
 * Scope can be updated. Fails if there is no active grant.
 */
export function extendGrant(doc, { ttlMs, scope } = {}, now = Date.now()) {
  let next = refreshGrantState(doc, now);
  const g = next.activeGrant;
  if (!g) {
    return {
      ok: false,
      error: "No active access code to extend. Grant a new one first.",
      doc: next,
    };
  }
  const add = clampTtlMs(ttlMs);
  const sc = scope != null && scope !== "" ? normalizeScope(scope) : g.scope;
  const base = Math.max(Number(g.expiresAt) || now, now);
  const newExpires = base + add;
  const updated = {
    ...g,
    scope: sc,
    ttlMs: add,
    expiresAt: newExpires,
    session:
      g.session && g.session.expiresAt
        ? {
            ...g.session,
            // Keep session clock in lockstep with the grant expiry.
            expiresAt: newExpires,
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
      note: `Extended +${mins} min · same code`,
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
  };
  const updated = {
    ...g,
    usedAt: now,
    session,
  };
  next = pushAudit(
    { ...next, activeGrant: updated },
    { type: "redeem", grantId: g.id, scope: g.scope, note: `Session started · ${session.label}` }
  );
  return {
    ok: true,
    doc: next,
    token,
    session: {
      grantId: g.id,
      scope: g.scope,
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
      scopes: ["full", "test"],
    },
    _doc: fresh,
  };
}
