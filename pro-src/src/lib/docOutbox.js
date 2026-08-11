// Durable doc outbox — Levi 2026-08-11.
//
// Invoice LE-251859 was emailed to a customer and then existed nowhere: the
// cloud save was fire-and-forget, so a failed/interrupted write lost the
// record silently. The obvious fix — make the user wait for the cloud before
// sending — was the wrong one: creating an invoice has to stay snappy and move
// straight to the next stage.
//
// So durability is optimistic instead of blocking. The moment an invoice is
// created we write the patch to localStorage (synchronous, sub-millisecond),
// the UI carries on immediately, and the network save confirms in the
// background. Anything still unconfirmed — a failed request, a closed tab, a
// dead phone — is replayed on the next app start. Nothing the user sees ever
// waits on the network.

const KEY = "le-pro-doc-outbox-v1";
/** Give up (and surface) after this many replay attempts. */
const MAX_ATTEMPTS = 12;

function readAll() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function writeAll(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
    return true;
  } catch {
    // Quota — drop the oldest confirmed-pending entry and retry once so a full
    // disk can never stop us recording the newest invoice.
    try {
      const entries = Object.entries(map).sort(
        (a, b) => (a[1]?.at || 0) - (b[1]?.at || 0)
      );
      if (entries.length > 1) {
        delete map[entries[0][0]];
        localStorage.setItem(KEY, JSON.stringify(map));
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }
}

/**
 * Record a doc patch as unconfirmed. Called BEFORE the network save so the
 * invoice is durable the instant it exists. Synchronous by design.
 *
 * @param {string} jobId
 * @param {object} patch the same jobPatch handed to patchAndSave
 */
export function rememberDocSave(jobId, patch) {
  if (!jobId || !patch || typeof patch !== "object") return;
  // Only doc-bearing patches are worth replaying; ignore incidental edits.
  const carriesDoc =
    patch.invoiceNo ||
    patch.estimateNo ||
    (Array.isArray(patch.invoiceLines) && patch.invoiceLines.length) ||
    (Array.isArray(patch.estimateLines) && patch.estimateLines.length);
  if (!carriesDoc) return;
  const map = readAll();
  const prev = map[String(jobId)];
  map[String(jobId)] = {
    jobId: String(jobId),
    patch,
    at: Date.now(),
    attempts: Number(prev?.attempts || 0),
    docNo: String(patch.invoiceNo || patch.estimateNo || ""),
  };
  writeAll(map);
}

/** The network save landed — stop tracking this job. */
export function confirmDocSave(jobId) {
  if (!jobId) return;
  const map = readAll();
  if (!(String(jobId) in map)) return;
  delete map[String(jobId)];
  writeAll(map);
}

/** Everything still unconfirmed, oldest first. */
export function pendingDocSaves() {
  return Object.values(readAll())
    .filter((e) => e && e.jobId && e.patch)
    .sort((a, b) => (a.at || 0) - (b.at || 0));
}

export function pendingDocSaveCount() {
  return pendingDocSaves().length;
}

/** Record a replay failure; entries past MAX_ATTEMPTS are kept but flagged. */
export function markDocSaveAttempt(jobId, error) {
  if (!jobId) return;
  const map = readAll();
  const cur = map[String(jobId)];
  if (!cur) return;
  cur.attempts = Number(cur.attempts || 0) + 1;
  cur.lastError = String(error || "").slice(0, 160);
  cur.lastAttemptAt = Date.now();
  map[String(jobId)] = cur;
  writeAll(map);
}

/** True once an entry has failed enough times to be worth telling the user. */
export function docSaveNeedsAttention(entry) {
  return Number(entry?.attempts || 0) >= MAX_ATTEMPTS;
}

/**
 * Replay unconfirmed saves. Runs in the background — callers never await it on
 * a user-visible path.
 *
 * @param {(jobId: string, patch: object) => Promise<unknown>} save patchAndSave
 * @returns {Promise<{ replayed: number, failed: number }>}
 */
export async function flushDocOutbox(save) {
  if (typeof save !== "function") return { replayed: 0, failed: 0 };
  let replayed = 0;
  let failed = 0;
  for (const entry of pendingDocSaves()) {
    try {
      await save(entry.jobId, entry.patch);
      confirmDocSave(entry.jobId);
      replayed += 1;
    } catch (err) {
      markDocSaveAttempt(entry.jobId, err?.message || err);
      failed += 1;
    }
  }
  return { replayed, failed };
}
