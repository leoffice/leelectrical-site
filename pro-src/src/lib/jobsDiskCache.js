// Persist the last slim jobs list so a cold open / first login can paint
// before the multi-MB jobsdata+state round-trip finishes (perf Batch E).
// IndexedDB when available; in-memory fallback for tests / private mode.

const DB_NAME = "lepro_jobs_disk";
const DB_VERSION = 1;
const STORE = "snapshots";
const RECORD_KEY = "list_v1";
/** Ignore caches older than this — force a blocking network load. */
export const JOBS_DISK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** @type {null | { jobs: object[], syncedAt: number, stateTs: number, savedAt: number }} */
let memorySnap = null;

function normalizeSnap(raw) {
  if (!raw || !Array.isArray(raw.jobs) || !raw.jobs.length) return null;
  const savedAt = Number(raw.savedAt) || 0;
  if (savedAt && Date.now() - savedAt > JOBS_DISK_MAX_AGE_MS) return null;
  return {
    jobs: raw.jobs,
    syncedAt: Number(raw.syncedAt) || 0,
    stateTs: Number(raw.stateTs) || 0,
    savedAt,
  };
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error || new Error("idb open failed"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function idbReq(req) {
  return new Promise((resolve, reject) => {
    req.onerror = () => reject(req.error || new Error("idb request failed"));
    req.onsuccess = () => resolve(req.result);
  });
}

/** @type {boolean|null} null = auto; unit tests force true, StoreProvider stays auto-off in vitest */
let enabledOverride = null;

/** Unit-test hook — force the cache on so module tests can round-trip. */
export function setJobsDiskCacheEnabledForTests(on) {
  enabledOverride = on == null ? null : Boolean(on);
}

/** Vitest auto-off so StoreProvider boot always hits the mock adapter. */
export function jobsDiskCacheEnabled() {
  if (enabledOverride != null) return enabledOverride;
  try {
    if (import.meta.env?.MODE === "test" || import.meta.env?.VITEST) return false;
  } catch {
    /* ignore */
  }
  return typeof indexedDB !== "undefined" || typeof window !== "undefined";
}

/**
 * @returns {Promise<null | { jobs: object[], syncedAt: number, stateTs: number, savedAt: number }>}
 */
export async function readJobsDiskCache() {
  if (!jobsDiskCacheEnabled()) return null;
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readonly");
      const raw = await idbReq(tx.objectStore(STORE).get(RECORD_KEY));
      const snap = normalizeSnap(raw);
      if (snap) memorySnap = snap;
      return snap;
    } finally {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  } catch {
    return normalizeSnap(memorySnap);
  }
}

/**
 * @param {{ jobs: object[], syncedAt?: number, stateTs?: number }} snap
 */
export async function writeJobsDiskCache(snap) {
  if (!jobsDiskCacheEnabled()) return false;
  if (!snap || !Array.isArray(snap.jobs) || !snap.jobs.length) return false;
  const record = {
    jobs: snap.jobs,
    syncedAt: Number(snap.syncedAt) || 0,
    stateTs: Number(snap.stateTs) || 0,
    savedAt: Date.now(),
  };
  memorySnap = record;
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readwrite");
      await idbReq(tx.objectStore(STORE).put(record, RECORD_KEY));
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("idb abort"));
      });
      return true;
    } finally {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  } catch {
    // Memory fallback still counts as persisted for this session / jsdom tests.
    return true;
  }
}

/** Idle-scheduled write — never compete with first paint or typing. */
export function scheduleJobsDiskCacheWrite(snap) {
  if (!jobsDiskCacheEnabled()) return;
  if (!snap?.jobs?.length) return;
  const run = () => {
    writeJobsDiskCache(snap).catch(() => {});
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 4000 });
  } else {
    setTimeout(run, 250);
  }
}

/** Test helper — wipe the store. */
export async function clearJobsDiskCache() {
  memorySnap = null;
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readwrite");
      await idbReq(tx.objectStore(STORE).delete(RECORD_KEY));
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("idb abort"));
      });
    } finally {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}
