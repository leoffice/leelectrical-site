/**
 * LE Pro backup + restore helpers (pure, no Netlify dependency).
 * Mirrors netlify/functions/blob-backup.mjs so the E2E drill can be proven in
 * unit tests without touching live blobs.
 */

export const BACKUP_KEEP = 3;

/** In-memory blob store stand-in for drills / tests. */
export function createMemoryStore(seed = {}) {
  const data = { ...seed };
  return {
    async get(key, _opts) {
      return key in data ? structuredClone(data[key]) : null;
    },
    async setJSON(key, value) {
      data[key] = structuredClone(value);
    },
    _dump() {
      return structuredClone(data);
    },
  };
}

export async function rotateJsonBackup(store, baseKey, nextDoc, now = Date.now()) {
  for (let slot = BACKUP_KEEP; slot >= 2; slot--) {
    const prev = await store.get(`${baseKey}-bak-${slot - 1}`, { type: "json" });
    if (prev) await store.setJSON(`${baseKey}-bak-${slot}`, prev);
  }
  const cur = await store.get(baseKey, { type: "json" });
  if (cur) await store.setJSON(`${baseKey}-bak-1`, { ...cur, backedUpAt: now });
  await store.setJSON(baseKey, nextDoc);
}

export async function restoreJsonFromBackup(store, baseKey, slot = 1) {
  const n = Math.max(1, Math.min(BACKUP_KEEP, Number(slot) || 1));
  const bak = await store.get(`${baseKey}-bak-${n}`, { type: "json" });
  if (!bak) return null;
  const { backedUpAt: _t, ...doc } = bak;
  await store.setJSON(baseKey, doc);
  return doc;
}

export async function snapshotStore(store, baseKey) {
  const doc = await store.get(baseKey, { type: "json" });
  if (!doc) return null;
  return {
    store: baseKey,
    snappedAt: Date.now(),
    doc: structuredClone(doc),
  };
}

export async function restoreStoreFromFile(store, file) {
  if (!file || !file.store || file.doc == null) {
    throw new Error("invalid backup file: need { store, doc }");
  }
  await store.setJSON(file.store, structuredClone(file.doc));
  return file.doc;
}

export async function runBackupRestoreDrill({
  store,
  baseKey,
  initialDoc,
  clobberDoc,
  now = Date.now(),
} = {}) {
  if (!store || !baseKey || !initialDoc) {
    throw new Error("runBackupRestoreDrill requires store, baseKey, initialDoc");
  }
  await store.setJSON(baseKey, initialDoc);
  await rotateJsonBackup(store, baseKey, initialDoc, now);
  const driveFile = await snapshotStore(store, baseKey);
  if (!driveFile) throw new Error("snapshot failed — live key empty");
  await store.setJSON(baseKey, clobberDoc ?? { wiped: true, ts: now });
  const restored = await restoreStoreFromFile(store, driveFile);
  const live = await store.get(baseKey, { type: "json" });
  return {
    ok: JSON.stringify(live) === JSON.stringify(initialDoc),
    driveFile,
    restored,
    live,
    bak1: await store.get(`${baseKey}-bak-1`, { type: "json" }),
  };
}