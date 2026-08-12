// Server-side incremental ov patch (perf Batch B, 2026-08-11).
//
// deepMerge semantics MUST match pro-src/src/data/merge.js (sleek's merge2):
// objects merge recursively; arrays and scalars are REPLACED by the patch;
// undefined patch values are skipped. The client used to GET the whole state
// blob, merge one patch, and POST the whole blob back (~4.5 MB each way per
// save). With { op: "patch", id, patch } the merge happens here instead.

export function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function clone(v) {
  if (v === null || typeof v !== "object") return v;
  try {
    return structuredClone(v);
  } catch {
    return JSON.parse(JSON.stringify(v));
  }
}

export function deepMerge(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch === undefined ? base : clone(patch);
  }
  const out = clone(base);
  for (const k of Object.keys(patch)) {
    const pv = patch[k];
    if (pv === undefined) continue;
    out[k] = isPlainObject(out[k]) && isPlainObject(pv) ? deepMerge(out[k], pv) : clone(pv);
  }
  return out;
}

// Mirrors pro-src/src/lib/auditTrail.js AUDIT_LOG_CAP. The stored audit log
// was append-only with no live trim (2,681 entries = 2.94 MB of the 4.49 MB
// state blob as of 2026-08-11) — this applies the cap on every write so the
// blob stops growing without bound. Oldest entries drop first (by `at`).
export const AUDIT_LOG_CAP = 8000;

export function capAuditLog(log) {
  if (!log || !isPlainObject(log) || !isPlainObject(log.byId)) return log;
  const entries = Object.values(log.byId).filter(Boolean);
  const overCap = entries.length > AUDIT_LOG_CAP;
  const hasLegacyList = Array.isArray(log.entries);
  if (!overCap && !hasLegacyList) return log;
  let keep = entries;
  if (overCap) {
    keep = entries
      .sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")))
      .slice(entries.length - AUDIT_LOG_CAP);
  }
  const byId = {};
  for (const e of keep) {
    if (e && e.id) byId[e.id] = e;
  }
  // entries[] is a legacy duplicate of byId — byId is the merge truth; never
  // store the list twice.
  return { byId, updatedAt: log.updatedAt || null, schema: log.schema || 1 };
}
