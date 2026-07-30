/**
 * Shared signature service — register (draw/upload) + apply into letters AND forms.
 * Consumed by letterheadPdf (letters skill) and Con Ed Form A Part E (A156).
 *
 * Storage model (client-first Phase 1):
 * - Signatures live in tenant profile under `owners[].signatureDataUrl` and a
 *   flat `signatures[]` registry on the profile for multi-signer support.
 * - R2 private object keys are reserved (`r2Key`) for the later sensitive
 *   storage endpoints — not shipped until security posture is reviewed.
 *
 * Security: treat signature images as sensitive tenant assets. Never expose
 * cross-tenant. Apply endpoints (when server-side) must be tenant-scoped.
 */

import { mergeProfile, DEFAULT_PROFILE } from "./tenantProfile.js";

/**
 * @typedef {{ id: string, ownerId: string, label?: string, dataUrl?: string, r2Key?: string, active?: boolean, createdAt?: number }} SignatureRecord
 * @typedef {{ id: string, fullName: string, title?: string, isDefaultSigner?: boolean, personalEmail?: string, personalPhone?: string, signatureId?: string }} OwnerRecord
 */

/** Make a stable id. */
export function newSignatureId() {
  return "sig-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

export function newOwnerId() {
  return "owner-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}

/**
 * Normalize owners[] from a profile. Seeds a default owner from requisition
 * signer / company name when empty so letters always have someone to pick.
 * @param {object} profile
 * @returns {OwnerRecord[]}
 */
export function ownersFromProfile(profile) {
  const p = mergeProfile(profile);
  const list = Array.isArray(p.owners) ? p.owners.filter((o) => o && o.fullName) : [];
  if (list.length) {
    return list.map((o, i) => ({
      id: o.id || "owner-" + i,
      fullName: String(o.fullName || "").trim(),
      title: o.title || "President",
      isDefaultSigner: !!o.isDefaultSigner,
      personalEmail: o.personalEmail || "",
      personalPhone: o.personalPhone || "",
      signatureId: o.signatureId || "",
    }));
  }
  const name =
    (p.requisition && p.requisition.signerName) ||
    p.defaultSignerName ||
    "Authorized Signer";
  return [
    {
      id: "owner-default",
      fullName: name,
      title: p.defaultSignerTitle || "President",
      isDefaultSigner: true,
      personalEmail: p.email || "",
      personalPhone: p.phone || "",
      signatureId: "",
    },
  ];
}

/**
 * Default signer for a document.
 * @param {object} profile
 * @param {string} [ownerId]
 */
export function resolveSigner(profile, ownerId) {
  const owners = ownersFromProfile(profile);
  if (ownerId) {
    const hit = owners.find((o) => o.id === ownerId);
    if (hit) return hit;
  }
  return owners.find((o) => o.isDefaultSigner) || owners[0] || null;
}

/**
 * List signature records from profile.
 * @param {object} profile
 * @returns {SignatureRecord[]}
 */
export function listSignatures(profile) {
  const p = mergeProfile(profile);
  const sigs = Array.isArray(p.signatures) ? p.signatures : [];
  return sigs
    .filter((s) => s && (s.dataUrl || s.r2Key))
    .map((s, i) => ({
      id: s.id || "sig-" + i,
      ownerId: s.ownerId || "",
      label: s.label || "",
      dataUrl: s.dataUrl || "",
      r2Key: s.r2Key || "",
      active: s.active !== false,
      createdAt: s.createdAt || 0,
    }));
}

/**
 * Register a signature for an owner (draw/upload → data URL).
 * Returns a new profile-shaped patch with signatures[] + owners[] updated.
 * Does NOT persist — caller writes via tenant settings save.
 *
 * @param {object} profile
 * @param {{ ownerId: string, dataUrl: string, label?: string, makeDefault?: boolean }} opts
 */
export function registerSignature(profile, { ownerId, dataUrl, label = "", makeDefault = true } = {}) {
  if (!dataUrl || !String(dataUrl).startsWith("data:image")) {
    throw new Error("Signature must be a data-URL image (draw or upload).");
  }
  const p = mergeProfile(profile);
  const owners = ownersFromProfile(p);
  const owner = owners.find((o) => o.id === ownerId) || owners[0];
  if (!owner) throw new Error("No owner to attach signature to.");

  const id = newSignatureId();
  const rec = {
    id,
    ownerId: owner.id,
    label: label || owner.fullName + " signature",
    dataUrl: String(dataUrl),
    r2Key: "", // reserved for private R2 later
    active: true,
    createdAt: Date.now(),
  };

  let signatures = listSignatures(p).map((s) =>
    s.ownerId === owner.id && makeDefault ? { ...s, active: false } : s
  );
  signatures = [...signatures, rec];

  const nextOwners = owners.map((o) => {
    if (o.id !== owner.id) return o;
    return { ...o, signatureId: id, isDefaultSigner: makeDefault ? true : o.isDefaultSigner };
  });

  return {
    ...p,
    owners: nextOwners,
    signatures,
  };
}

/**
 * Resolve the image data URL to place at a document's signature anchor.
 * @param {object} opts
 * @param {object} [opts.profile]
 * @param {string} [opts.ownerId]
 * @param {string} [opts.signatureId]
 * @returns {{ dataUrl: string, owner: OwnerRecord|null, signature: SignatureRecord|null }}
 */
export function applySignature({ profile, ownerId, signatureId } = {}) {
  const owner = resolveSigner(profile, ownerId);
  const sigs = listSignatures(profile);
  let signature = null;
  if (signatureId) signature = sigs.find((s) => s.id === signatureId) || null;
  if (!signature && owner?.signatureId) {
    signature = sigs.find((s) => s.id === owner.signatureId && s.active !== false) || null;
  }
  if (!signature && owner) {
    signature =
      sigs.find((s) => s.ownerId === owner.id && s.active !== false) ||
      sigs.find((s) => s.active !== false) ||
      null;
  }
  return {
    dataUrl: signature?.dataUrl || "",
    owner: owner || null,
    signature,
  };
}

/**
 * Decode a data-URL PNG/JPEG into { bytes, width, height, name } for PDF embedding.
 * Returns null if not a usable image data URL. Width/height may be 0 when unknown
 * (PDF writer can still embed JPEG via DCTDecode if dimensions provided later).
 *
 * @param {string} dataUrl
 * @returns {Promise<{ bytes: Uint8Array, width: number, height: number, name: string, mime: string } | null>}
 */
export async function signatureImageFromDataUrl(dataUrl) {
  const s = String(dataUrl || "");
  const m = s.match(/^data:(image\/(png|jpeg|jpg));base64,(.+)$/i);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const b64 = m[3];
  let bin;
  try {
    if (typeof atob === "function") {
      const raw = atob(b64);
      bin = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
    } else {
      bin = Uint8Array.from(Buffer.from(b64, "base64"));
    }
  } catch {
    return null;
  }

  // Best-effort dimensions via createImageBitmap / Image when available
  let width = 0;
  let height = 0;
  try {
    if (typeof createImageBitmap === "function" && typeof Blob === "function") {
      const blob = new Blob([bin], { type: mime });
      const bmp = await createImageBitmap(blob);
      width = bmp.width;
      height = bmp.height;
      bmp.close?.();
    }
  } catch {
    /* dimensions optional for some embed paths */
  }

  return {
    bytes: bin,
    width: width || 240,
    height: height || 80,
    name: "Sig",
    mime,
  };
}

/**
 * Default LE seed owner (Levi) — used when profile has no owners yet.
 * Does not hardcode into letter bodies; only seeds Settings.
 */
export function defaultLeOwners() {
  return [
    {
      id: "owner-levi",
      fullName: "Levi Kumer",
      title: "President",
      isDefaultSigner: true,
      personalEmail: "6140913@gmail.com",
      personalPhone: "219-2140913",
      signatureId: "",
    },
  ];
}

/** Empty signature registry for a fresh tenant. */
export function emptySignatureRegistry() {
  return { owners: defaultLeOwners(), signatures: [] };
}

// Re-export merge for callers that only import signatureService
export { mergeProfile, DEFAULT_PROFILE };
