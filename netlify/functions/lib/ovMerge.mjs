/**
 * Per-key overlay merge for the jobstate blob (ov-v1).
 *
 * The previous POST handler replaced the entire `ov` object. A stale client
 * that re-posted its cached full overlay deleted every job key it did not
 * have. This module never drops a stored key just because the payload omitted
 * it. Deletes are tombstones (`_deleted: true`), including `op: "delete"`.
 *
 * Each plain-object value is stamped `_savedAt` / `_version`. Arrays and
 * scalars (for example `_nomerge`) get the same stamp under `ov._ovStamp`,
 * which clients cannot overwrite. An incoming key is skipped when its stamp
 * is strictly older than the stored stamp. A missing stamp still merges, so
 * old clients that POST a full `ov` cannot wipe keys they left out.
 */
import { rotateJsonBackup } from "../blob-backup.mjs";

const STAMP_KEY = "_ovStamp";

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function clone(v) {
  return v === null || typeof v !== "object" ? v : JSON.parse(JSON.stringify(v));
}

/** Objects merge recursively; arrays and scalars are replaced. Skip undefined. */
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

function num(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickMin(a, b) {
  if (a == null) return b == null ? null : b;
  if (b == null) return a;
  return Math.min(a, b);
}

function pickMax(a, b) {
  if (a == null) return b == null ? null : b;
  if (b == null) return a;
  return Math.max(a, b);
}

function stampOf(value) {
  if (!isPlainObject(value)) return { savedAt: null, version: null };
  return { savedAt: num(value._savedAt), version: num(value._version) };
}

function readStoredStamp(value, mapEntry) {
  const a = stampOf(value);
  const b = stampOf(mapEntry);
  return { savedAt: pickMax(a.savedAt, b.savedAt), version: pickMax(a.version, b.version) };
}

function readIncomingStamp(value, baseEntry) {
  const a = stampOf(value);
  const b = stampOf(baseEntry);
  return { savedAt: pickMin(a.savedAt, b.savedAt), version: pickMin(a.version, b.version) };
}

function isOlder(incoming, stored) {
  if (incoming.savedAt != null && stored.savedAt != null && incoming.savedAt < stored.savedAt) return true;
  if (incoming.version != null && stored.version != null && incoming.version < stored.version) return true;
  return false;
}

function stripOwnStamps(value) {
  if (!isPlainObject(value)) return clone(value);
  const out = clone(value);
  delete out._savedAt;
  delete out._version;
  return out;
}

function withoutStamps(value) {
  if (Array.isArray(value) || !isPlainObject(value)) return value;
  const out = { ...value };
  delete out._savedAt;
  delete out._version;
  return out;
}

function sameData(a, b) {
  return JSON.stringify(withoutStamps(a)) === JSON.stringify(withoutStamps(b));
}

function deleteKeys(body) {
  const raw = [].concat(body.keys || [], body.ids || []);
  const out = [];
  for (const k of raw) {
    if (k == null || k === "" || k === STAMP_KEY) continue;
    out.push(String(k));
  }
  return out;
}

/**
 * Merge one POST body into the stored overlay.
 * Returns { ov, skipped, changed, stamps }.
 * `stamps` lists keys this call actually wrote.
 */
export function mergeIncomingOv(storedOv, body, now = Date.now()) {
  const stored = isPlainObject(storedOv) ? clone(storedOv) : {};
  const stamps = {};
  if (isPlainObject(stored[STAMP_KEY])) {
    for (const k of Object.keys(stored[STAMP_KEY])) {
      if (isPlainObject(stored[STAMP_KEY][k])) stamps[k] = { ...stored[STAMP_KEY][k] };
    }
  }
  delete stored[STAMP_KEY];

  const skipped = [];
  const written = {};
  let changed = false;
  const req = isPlainObject(body) ? body : {};
  const base = isPlainObject(req.base) ? req.base : {};

  const writeKey = (key, next, prev) => {
    const prevStamp = readStoredStamp(prev, stamps[key]);
    const version = (prevStamp.version || 0) + 1;
    if (isPlainObject(next)) {
      next._savedAt = now;
      next._version = version;
    }
    stamps[key] = { _savedAt: now, _version: version };
    stored[key] = next;
    written[key] = { _savedAt: now, _version: version };
    changed = true;
  };

  const applyValue = (key, clean) => {
    const prev = stored[key];
    let next;
    if (isPlainObject(prev) && isPlainObject(clean)) next = deepMerge(stripOwnStamps(prev), clean);
    else next = clone(clean);
    if (sameData(prev, next)) return;
    writeKey(key, next, prev);
  };

  if (req.op === "delete") {
    for (const key of deleteKeys(req)) {
      const incoming = readIncomingStamp(null, base[key]);
      const storedStamp = readStoredStamp(stored[key], stamps[key]);
      if (isOlder(incoming, storedStamp)) {
        skipped.push({
          key,
          reason: "older_stamp",
          storedSavedAt: storedStamp.savedAt,
          incomingSavedAt: incoming.savedAt,
          storedVersion: storedStamp.version,
          incomingVersion: incoming.version,
        });
        continue;
      }
      const prev = stored[key];
      const baseObj = isPlainObject(prev) ? stripOwnStamps(prev) : {};
      applyValue(key, deepMerge(baseObj, { _deleted: true }));
    }
  }

  const incomingOv = isPlainObject(req.ov) ? req.ov : {};
  for (const key of Object.keys(incomingOv)) {
    if (key === STAMP_KEY) continue;
    const patch = incomingOv[key];
    if (patch == null) continue;
    const incoming = readIncomingStamp(patch, base[key]);
    const storedStamp = readStoredStamp(stored[key], stamps[key]);
    if (isOlder(incoming, storedStamp)) {
      skipped.push({
        key,
        reason: "older_stamp",
        storedSavedAt: storedStamp.savedAt,
        incomingSavedAt: incoming.savedAt,
        storedVersion: storedStamp.version,
        incomingVersion: incoming.version,
      });
      continue;
    }
    let clean = stripOwnStamps(patch);
    if (isPlainObject(clean) && String(key).startsWith("local-") && clean._new == null) {
      const already = isPlainObject(stored[key]) && stored[key]._new != null;
      if (!already) clean = { ...clean, _new: true };
    }
    applyValue(key, clean);
  }

  if (Object.keys(stamps).length) stored[STAMP_KEY] = stamps;
  return { ov: stored, skipped, changed, stamps: written };
}

/**
 * Strong-read the live blob, merge, and rotate a backup only when the
 * overlay actually changed. Does not return the full ov.
 */
export async function saveJobState(store, body, now = Date.now(), key = "ov-v1") {
  const cur = (await store.get(key, { type: "json", consistency: "strong" })) || { ov: {}, ts: 0 };
  const merged = mergeIncomingOv(cur.ov || {}, body || {}, now);
  if (!merged.changed) {
    return { ok: true, ts: cur.ts || 0, skipped: merged.skipped, unchanged: true, stamps: {} };
  }
  await rotateJsonBackup(store, key, { ov: merged.ov, ts: now });
  return { ok: true, ts: now, skipped: merged.skipped, stamps: merged.stamps };
}
