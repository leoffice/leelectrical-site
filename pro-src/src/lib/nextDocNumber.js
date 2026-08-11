// Allocate the next invoice / estimate number from the board (local-first).
// Used when Save is pressed with an empty Inv # / Est # field so the job
// leaves "draft" and shows a real number immediately.
//
// Levi 2026-08-04: NEW LE Pro invoices use LE-2700, LE-2701, … so staff can
// tell LE-created docs from older QBO-only numbers (231xxx / 251xxx). Existing
// numbers are never rewritten.

const COUNTER_KEY = "le-pro-doc-no-counter";

/** New LE Pro invoice series — LE-2700, LE-2701, … (Levi 2026-08-04). */
export const LE_INVOICE_PREFIX = "LE-";
/**
 * Next number the LE series continues from. Levi 2026-08-11: resume at 2712
 * after the runaway numbers below were issued.
 */
export const LE_INVOICE_START = 2712;

/**
 * The LE series is a small human counter — anything this size or larger is a
 * legacy QuickBooks number (231xxx / 251xxx) that must never seed it.
 *
 * Levi 2026-08-11: invoices came out as LE-251858 / LE-251859. A legacy QBO
 * number had reached the device's local counter, and the old floor guard only
 * checked `floor >= LE_INVOICE_START`, so 251858 sailed through and every new
 * invoice continued from there. A ceiling closes that: a poisoned counter, or
 * an LE-prefixed legacy number already on the board, is now ignored.
 */
export const LE_INVOICE_MAX = 100000;

/** True when n is a plausible LE-series counter value. */
function inLeRange(n) {
  return Number.isFinite(n) && n > 0 && n < LE_INVOICE_MAX;
}

/** Leading numeric core of a doc number.
 *  251841, 251100-CO-01 → 251100; LE-2700, LE-2701-CO-01 → 2700. */
export function numericDocCore(raw) {
  const s = String(raw || "").trim();
  if (!s) return 0;
  const le = s.match(/^LE-(\d+)/i);
  if (le) return parseInt(le[1], 10);
  const m = s.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/** True when this is an LE-prefixed LE Pro invoice number. */
export function isLeInvoiceNo(raw) {
  return /^LE-\d+/i.test(String(raw || "").trim());
}

function counterFloor(kind) {
  try {
    const stored = JSON.parse(localStorage.getItem(COUNTER_KEY) || "{}");
    const n = Number(stored[kind] || 0);
    if (kind === "invoice" && Number.isFinite(n) && n >= LE_INVOICE_MAX) {
      // Self-heal a poisoned counter so this device stops issuing LE-251xxx.
      delete stored[kind];
      try {
        localStorage.setItem(COUNTER_KEY, JSON.stringify(stored));
      } catch {
        /* ignore quota */
      }
      return 0;
    }
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function bumpCounter(kind, value) {
  if (kind === "invoice" && !inLeRange(value)) return;
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
 * For invoices: only LE-#### numbers count toward the new series max
 * (legacy 251xxx must not push past LE-2700).
 */
export function maxDocNumberOnBoard(jobs, kind) {
  const key = kind === "estimate" ? "estimateNo" : "invoiceNo";
  let max = 0;
  for (const j of jobs || []) {
    const raw = String(j?.[key] || "").trim();
    if (kind === "invoice") {
      // New series: only LE-#### (ignore pure legacy QBO numbers for next-LE).
      if (!isLeInvoiceNo(raw)) continue;
      const n = numericDocCore(raw);
      // LE-251859 and friends are legacy numbers wearing the LE- prefix; they
      // must not drag the series up to 251860.
      if (!inLeRange(n)) continue;
      if (n > max) max = n;
    } else {
      const n = numericDocCore(raw);
      if (n > max) max = n;
    }
  }
  const floor = counterFloor(kind);
  if (kind === "invoice") {
    // Counter only applies if already in LE series range (avoid 251902 floor).
    const leFloor = floor >= LE_INVOICE_START && inLeRange(floor) ? floor : 0;
    return Math.max(max, leFloor, LE_INVOICE_START - 1);
  }
  return Math.max(max, floor);
}

/**
 * Next free doc number as a string. Bumps the local counter so back-to-back
 * creates on a partial job list don't reissue the same number.
 * Invoices → LE-2700, LE-2701, … Estimates stay plain numeric.
 */
export function nextDocNumberFromJobs(jobs, kind = "invoice") {
  const next = maxDocNumberOnBoard(jobs, kind) + 1;
  bumpCounter(kind, next);
  if (kind === "invoice") return `${LE_INVOICE_PREFIX}${next}`;
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
