// Daily dedupe scan — once per calendar day on app open.
// Scans all active jobs for customer-merge candidates and duplicate invoice #s.
// Findings feed MergePrompt + InvoiceDedupPrompt (app-wide).

import {
  clientGroupEntries,
  contactInfoMatches,
  isMergeDecisionRemembered,
  mergeDisplayName,
  namesNearDuplicate,
  nearDuplicateCandidatePairs,
  pairId,
  findMergeSuggestion,
} from "./customers.js";
import { findDuplicateInvoiceSuggestion, isInvoiceDismissed, shouldPromptInvoiceDedup } from "./invoiceDedup.js";

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

/** Count all non-dismissed customer merge pairs (indexed candidates only). */
export function countMergePairs(jobs) {
  const entries = clientGroupEntries(jobs);
  const cand = nearDuplicateCandidatePairs(entries);
  let n = 0;
  for (const key of cand) {
    const c = key.indexOf(":");
    const i = Number(key.slice(0, c));
    const k = Number(key.slice(c + 1));
    const ja = entries[i][1][0];
    const jb = entries[k][1][0];
    const na = mergeDisplayName(ja);
    const nb = mergeDisplayName(jb);
    const nameMatch = namesNearDuplicate(na, nb);
    const contactMatch = !nameMatch && contactInfoMatches(ja, jb);
    if (!nameMatch && !contactMatch) continue;
    if (isMergeDecisionRemembered(ja, jb)) continue;
    n++;
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
    const no = noFromGroup(group);
    let found = false;
    for (let i = 0; i < group.length && !found; i++) {
      for (let k = i + 1; k < group.length; k++) {
        const a = group[i];
        const b = group[k];
        if (!shouldPromptInvoiceDedup(a, b)) continue;
        if (isInvoiceDismissed(no, a.id, b.id)) continue;
        n++;
        found = true;
        break;
      }
    }
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