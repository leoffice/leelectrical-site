// Allocate the next invoice / estimate number from the board (local-first).
// Used when Save is pressed with an empty Inv # / Est # field so the job
// leaves "draft" and shows a real number immediately.

const COUNTER_KEY = "le-pro-doc-no-counter";

/** Leading numeric core of a doc number (251841, 251100-CO-01 → 251100). */
export function numericDocCore(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function counterFloor(kind) {
  try {
    const stored = JSON.parse(localStorage.getItem(COUNTER_KEY) || "{}");
    const n = Number(stored[kind] || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function bumpCounter(kind, value) {
  try {
    const stored = JSON.parse(localStorage.getItem(COUNTER_KEY) || "{}");
    const prev = Number(stored[kind] || 0);
    if (value > prev) {
      stored[kind] = value;
      localStorage.setItem(COUNTER_KEY, JSON.stringify(stored));
    }
  } catch {
    /* ignore quota */
  }
}

/**
 * Highest known number on the board + local counter floor.
 * Estimates and invoices use separate sequences.
 */
export function maxDocNumberOnBoard(jobs, kind) {
  const key = kind === "estimate" ? "estimateNo" : "invoiceNo";
  let max = 0;
  for (const j of jobs || []) {
    const n = numericDocCore(j?.[key]);
    if (n > max) max = n;
  }
  const floor = counterFloor(kind);
  return Math.max(max, floor);
}

/**
 * Next free doc number as a string. Bumps the local counter so back-to-back
 * creates on a partial job list don't reissue the same number.
 */
export function nextDocNumberFromJobs(jobs, kind = "invoice") {
  const next = maxDocNumberOnBoard(jobs, kind) + 1;
  bumpCounter(kind, next);
  return String(next);
}

/**
 * Resolve the number to stamp on save: existing field → preferred CO label → next free.
 */
export function resolveDocNumberOnSave({
  kind,
  existing,
  preferred,
  jobs,
}) {
  const cur = String(existing || "").trim();
  if (cur) return cur;
  const pref = String(preferred || "").trim();
  if (pref) return pref;
  return nextDocNumberFromJobs(jobs, kind);
}
