// Warm jobsdata+state while the lock screen is up (perf Batch E).
// Prefetch overlaps the password / Face ID wait so unlock → Jobs is shorter
// on a returning device (auth session still valid). Failures are silent —
// StoreProvider still boots from disk cache or a blocking refresh.

/** @type {Promise<object|null>|null} */
let warmPromise = null;
/** @type {object|null} */
let warmMeta = null;

/** @type {boolean|null} */
let enabledOverride = null;

/** Unit-test hook — force warm on so module tests can exercise the path. */
export function setJobsBootWarmEnabledForTests(on) {
  enabledOverride = on == null ? null : Boolean(on);
}

/** Vitest auto-off so app suites are not poisoned by a prior snapshot. */
export function jobsBootWarmEnabled() {
  if (enabledOverride != null) return enabledOverride;
  try {
    if (import.meta.env?.MODE === "test" || import.meta.env?.VITEST) return false;
  } catch {
    /* ignore */
  }
  return typeof window !== "undefined";
}

/** Test helper — wipe in-flight warm state. */
export function resetJobsBootWarm() {
  warmPromise = null;
  warmMeta = null;
}

/**
 * Kick off listJobsMeta once. Safe to call from the lock shell — dynamic
 * imports keep the heavy adapter out of the LockGate chunk.
 */
export function startJobsBootWarm() {
  if (!jobsBootWarmEnabled()) return Promise.resolve(null);
  if (warmPromise) return warmPromise;
  warmPromise = (async () => {
    const [{ default: api }, { scheduleJobsDiskCacheWrite }] = await Promise.all([
      import("../data/adapter.js"),
      import("./jobsDiskCache.js"),
    ]);
    if (!api?.listJobsMeta) return null;
    const meta = await api.listJobsMeta();
    if (meta?.jobs?.length) {
      warmMeta = meta;
      scheduleJobsDiskCacheWrite({
        jobs: meta.jobs,
        syncedAt: meta.syncedAt || 0,
        stateTs: meta.stateTs || 0,
      });
      return meta;
    }
    return null;
  })().catch(() => null);
  return warmPromise;
}

/**
 * Consume a completed warm snapshot for StoreProvider boot.
 * Returns null when warm is still in flight or failed — caller falls through
 * to disk cache / network refresh.
 */
export function peekJobsBootWarm() {
  return warmMeta;
}

/** Await warm if started; otherwise null. */
export function awaitJobsBootWarm() {
  return warmPromise || Promise.resolve(null);
}
