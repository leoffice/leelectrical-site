/**
 * AI Assistant paid licenses — unlimited tokens for the owner and for customers who pay.
 * Pure helpers for unit tests (hashing, mint, validate, revoke).
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const DOC_KEY = "assistant-licenses-v1";
export const MAX_AUDIT = 80;
export const MAX_LICENSES = 200;
export const KINDS = new Set(["owner", "paid"]);

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

/** Unambiguous alphabet (no 0/O/1/I). */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateToken() {
  // 20-char group for humans: XXXX-XXXX-XXXX-XXXX-XXXX
  const bytes = randomBytes(20);
  let out = "";
  for (let i = 0; i < 20; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return formatToken(out);
}

export function normalizeToken(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function formatToken(raw) {
  const n = normalizeToken(raw);
  if (n.length !== 20) return n;
  return `${n.slice(0, 4)}-${n.slice(4, 8)}-${n.slice(8, 12)}-${n.slice(12, 16)}-${n.slice(16, 20)}`;
}

export function tokenPreview(token) {
  const n = normalizeToken(token);
  if (n.length < 8) return "••••";
  return `${n.slice(0, 4)}…${n.slice(-4)}`;
}

export function generateLicenseId() {
  return `lic_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function normalizeKind(raw) {
  const k = String(raw || "paid").toLowerCase();
  return KINDS.has(k) ? k : "paid";
}

export function emptyDoc() {
  return { licenses: [], audit: [] };
}

export function pushAudit(doc, entry) {
  const audit = Array.isArray(doc.audit) ? doc.audit.slice() : [];
  audit.unshift({ at: Date.now(), ...entry });
  if (audit.length > MAX_AUDIT) audit.length = MAX_AUDIT;
  return { ...doc, audit };
}

export function publicLicense(lic) {
  if (!lic) return null;
  return {
    id: lic.id,
    kind: lic.kind,
    label: lic.label,
    unlimited: lic.unlimited !== false,
    tokenPreview: lic.tokenPreview,
    createdAt: lic.createdAt,
    revokedAt: lic.revokedAt || null,
    lastUsedAt: lic.lastUsedAt || null,
    active: !lic.revokedAt,
  };
}

/**
 * Mint a new unlimited license token.
 * kind: "owner" (your unlimited) | "paid" (customer who paid)
 * Full token is returned ONCE; only the hash is stored.
 */
export function mintLicense(doc, { kind, label } = {}, now = Date.now()) {
  let next = { ...emptyDoc(), ...doc, licenses: Array.isArray(doc?.licenses) ? doc.licenses.slice() : [] };
  const k = normalizeKind(kind);
  const lbl = String(label || (k === "owner" ? "Owner unlimited" : "Paid customer"))
    .trim()
    .slice(0, 80);
  if (!lbl) {
    return { ok: false, error: "Name / label is required.", doc: next };
  }

  const active = next.licenses.filter((l) => !l.revokedAt);
  if (active.length >= MAX_LICENSES) {
    return { ok: false, error: "Too many active licenses. Revoke some first.", doc: next };
  }

  // One owner unlimited at a time — re-mint replaces previous owner token.
  if (k === "owner") {
    next.licenses = next.licenses.map((l) =>
      l.kind === "owner" && !l.revokedAt
        ? { ...l, revokedAt: now }
        : l
    );
    if (next.licenses.some((l) => l.kind === "owner" && l.revokedAt === now)) {
      next = pushAudit(next, {
        type: "revoke",
        note: "Previous owner token replaced",
        kind: "owner",
      });
    }
  }

  const token = generateToken();
  const lic = {
    id: generateLicenseId(),
    tokenHash: sha256Hex(normalizeToken(token)),
    tokenPreview: tokenPreview(token),
    kind: k,
    label: lbl,
    unlimited: true,
    createdAt: now,
    revokedAt: null,
    lastUsedAt: null,
  };
  next.licenses = [lic, ...next.licenses];
  next = pushAudit(next, {
    type: "mint",
    licenseId: lic.id,
    kind: k,
    note: `Minted ${k} · ${lbl}`,
  });
  return {
    ok: true,
    doc: next,
    token: formatToken(token),
    license: publicLicense(lic),
  };
}

/** Validate a token. Marks lastUsedAt on success. */
export function validateLicense(doc, token, now = Date.now()) {
  let next = { ...emptyDoc(), ...doc, licenses: Array.isArray(doc?.licenses) ? doc.licenses.slice() : [] };
  const hash = sha256Hex(normalizeToken(token));
  if (!normalizeToken(token)) {
    return { ok: false, error: "Enter a license token.", doc: next, entitled: false };
  }

  const idx = next.licenses.findIndex((l) => safeEqualHex(l.tokenHash, hash));
  if (idx < 0) {
    next = pushAudit(next, { type: "validate_fail", note: "Unknown token" });
    return { ok: false, error: "That token is not valid.", doc: next, entitled: false };
  }
  const lic = next.licenses[idx];
  if (lic.revokedAt) {
    next = pushAudit(next, {
      type: "validate_fail",
      licenseId: lic.id,
      note: "Revoked token used",
    });
    return { ok: false, error: "This token was revoked.", doc: next, entitled: false };
  }

  const updated = { ...lic, lastUsedAt: now };
  const licenses = next.licenses.slice();
  licenses[idx] = updated;
  next = pushAudit(
    { ...next, licenses },
    {
      type: "validate",
      licenseId: lic.id,
      kind: lic.kind,
      note: `Validated · ${lic.label}`,
    }
  );
  return {
    ok: true,
    entitled: true,
    unlimited: true,
    license: publicLicense(updated),
    doc: next,
  };
}

export function revokeLicense(doc, licenseId, now = Date.now()) {
  let next = { ...emptyDoc(), ...doc, licenses: Array.isArray(doc?.licenses) ? doc.licenses.slice() : [] };
  const id = String(licenseId || "");
  const idx = next.licenses.findIndex((l) => l.id === id);
  if (idx < 0) {
    return { ok: false, error: "License not found.", doc: next };
  }
  const lic = next.licenses[idx];
  if (lic.revokedAt) {
    return { ok: true, already: true, license: publicLicense(lic), doc: next };
  }
  const updated = { ...lic, revokedAt: now };
  const licenses = next.licenses.slice();
  licenses[idx] = updated;
  next = pushAudit(
    { ...next, licenses },
    {
      type: "revoke",
      licenseId: lic.id,
      kind: lic.kind,
      note: `Revoked · ${lic.label}`,
    }
  );
  return { ok: true, license: publicLicense(updated), doc: next };
}

/** Status payload for UI — never includes token hashes. */
export function statusPayload(doc) {
  const licenses = Array.isArray(doc?.licenses) ? doc.licenses : [];
  const active = licenses.filter((l) => !l.revokedAt).map(publicLicense);
  const all = licenses.map(publicLicense);
  return {
    ok: true,
    paidFeature: true,
    activeCount: active.length,
    licenses: all.slice(0, 100),
    active,
    audit: Array.isArray(doc?.audit) ? doc.audit.slice(0, 40) : [],
  };
}

/**
 * Entitlement: does this token unlock the assistant?
 * Pure helper for client-side tests (server uses validateLicense).
 */
export function isEntitledByToken(doc, token) {
  if (!token) return false;
  const hash = sha256Hex(normalizeToken(token));
  const licenses = Array.isArray(doc?.licenses) ? doc.licenses : [];
  return licenses.some((l) => !l.revokedAt && safeEqualHex(l.tokenHash, hash));
}
