// Daily dedupe scan — once per calendar day on app open.
// Scans all active jobs for customer-merge candidates and duplicate invoice #s.
// Findings feed MergePrompt + InvoiceDedupPrompt (app-wide).

import {
  clientKey,
  contactInfoMatches,
  isDismissed,
  namesNearDuplicate,
  pairId,
} from "./customers.js";
import { findDuplicateInvoiceSuggestion, isInvoiceDismissed } from "./invoiceDedup.js";
import { findMergeSuggestion } from "./customers.js";

export const DEDUPE_SCAN_KEY = "lepro_dedupe_scan";

export function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function loadLastScan() {
  try {
    const v = JSON.parse(localStorage.getItem(DEDUPE_SCAN_KEY) || "null");
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

export function saveScanMeta(meta) {
  try {
    localStorage.setItem(DEDUPE_SCAN_KEY, JSON.stringify(meta));
  } catch {}
}

/** True when today's scan has not been recorded yet. */
export function scanDue(now = Date.now(), last = loadLastScan()) {
  const day = todayKey(new Date(now));
  return !last || last.day !== day;
}

/** Count all non-dismissed customer merge pairs (full scan). */
export function countMergePairs(jobs) {
  const map = new Map();
  for (const j of jobs || []) {
    if (!j || j._archived || j._deleted) continue;
    const k = clientKey(j);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(j);
  }
  const entries = [...map.entries()];
  let n = 0;
  for (let i = 0; i < entries.length; i++) {
    const ja = entries[i][1][0];
    const na = ja.customer;
    for (let k = i + 1; k < entries.length; k++) {
      const jb = entries[k][1][0];
      const nb = jb.customer;
      const nameMatch = namesNearDuplicate(na, nb);
      const contactMatch = !nameMatch && contactInfoMatches(ja, jb);
      if (!nameMatch && !contactMatch) continue;
      if (isDismissed(na, nb)) continue;
      n++;
    }
  }
  return n;
}

/** Count invoice numbers shared by 2+ active jobs (non-dismissed pairs). */
export function countInvoiceDupes(jobs) {
  const byInv = new Map();
  for (const j of jobs || []) {
    if (!j || j._archived || j._deleted) continue;
    const no = String(j.invoiceNo || "").trim();
    if (!no) continue;
    if (!byInv.has(no)) byInv.set(no, []);
    byInv.get(no).push(j);
  }
  let n = 0;
  for (const [, group] of byInv) {
    if (group.length < 2) continue;
    const a = group[0];
    const b = group[1];
    if (isInvoiceDismissed(noFromGroup(group), a.id, b.id)) continue;
    n++;
  }
  return n;
}

function noFromGroup(group) {
  return String((group[0] && group[0].invoiceNo) || "").trim();
}

/**
 * Run the daily scan. Records metadata once per day; always returns current
 * first findings for prompts.
 */
export function runDailyDedupeScan(jobs, now = Date.now()) {
  const day = todayKey(new Date(now));
  const due = scanDue(now);
  const customerCount = countMergePairs(jobs);
  const invoiceCount = countInvoiceDupes(jobs);
  const merge = findMergeSuggestion(jobs);
  const invoice = findDuplicateInvoiceSuggestion(jobs);

  const result = {
    day,
    scannedAt: now,
    due,
    ran: false,
    customerCount,
    invoiceCount,
    merge,
    invoice,
    mergePairId: merge ? pairId(merge.a.name, merge.b.name) : null,
    invoicePairId: invoice ? invoice.id : null,
  };

  if (due) {
    saveScanMeta({
      day,
      scannedAt: now,
      customerCount,
      invoiceCount,
      hadFindings: customerCount > 0 || invoiceCount > 0,
    });
    result.ran = true;
  }

  return result;
}