// Customer identity — grouping keys + near-duplicate detection for the
// "Same customer?" combine prompt (bugs #1/#2).
//
//   normalizeCustomer("  Meir  Kabakov. ") -> "meir kabakov"
//   clientKey(job)  -> "g:<clientGroup>" | "c:<normalized name>" | "j:<id>"
//   namesNearDuplicate("Arthur koptiv","Arthur Koptive") -> true
//   findMergeSuggestion(jobs) -> first non-dismissed near-duplicate pair
//   dismissPair / isDismissed -> permanent "Not the same" memory
//     (localStorage lepro_nomerge + server ov._nomerge — synced on dismiss)
//   snoozePair / isSnoozed -> "Ask me later" until next login
//     (sessionStorage lepro_merge_snooze — cleared on fresh app open)

import { serviceAddressesExcludingBilling } from "./addressSync.js";
import { fmt$, parseAmount } from "./format.js";
import {
  normalizePayments,
  remainingBalance,
  totalPaid,
  amountOwedAtStart,
  isProgressInvoiceJob,
} from "./payments.js";

/** True when a job is an actual invoice (has an invoice #). Estimates/leads are not. */
export function isInvoiceJob(job) {
  return !!(job && String(job.invoiceNo || "").trim());
}

/** Raw amount-owed for a job IGNORING the invoice gate. Used ONLY as a sort /
 *  magnitude proxy so ranking is unchanged — NEVER as a displayed balance due. */
export function rawBalance(job) {
  if (!job) return 0;
  const pays = normalizePayments(job);
  const hasExplicitOpen = job.openBalance != null && job.openBalance !== "";
  const storedOpen = hasExplicitOpen ? parseAmount(job.openBalance) : null;

  // QBO sync often marks paid (openBalance 0) without refreshing the payment
  // ledger. Incomplete payments would still show a remainder — trust zero.
  if (hasExplicitOpen && storedOpen <= 0.01) return 0;

  if (pays.length) {
    const fromPays = remainingBalance(job, pays);
    if (!hasExplicitOpen) return fromPays;
    // Payment ledger says more owed than openBalance:
    // - Progress draw raised after payments → trust payments (invoice − paid)
    // - QBO already applied a payment the local list missed → trust openBalance
    if (fromPays > storedOpen + 0.009) {
      const inv = parseAmount(job.amount);
      const baseline =
        job.paymentBaseline != null && job.paymentBaseline !== ""
          ? parseAmount(job.paymentBaseline)
          : null;
      const paidSum = totalPaid(pays);
      const progressLike =
        isProgressInvoiceJob(job) ||
        (baseline != null &&
          inv > baseline + 0.009 &&
          paidSum > 0 &&
          paidSum / Math.max(baseline, 1) >= 0.3);
      if (progressLike) return fromPays;
      return Math.max(0, storedOpen);
    }
    return fromPays;
  }
  if (hasExplicitOpen) {
    // Progress invoice total raised with no payment ledger — balance tracks amount.
    if (isProgressInvoiceJob(job)) {
      const inv = parseAmount(job.amount);
      if (inv > storedOpen + 0.009) return inv;
    }
    return storedOpen;
  }
  const hay = [job.notes, job.followUp && job.followUp.text].filter(Boolean).join(" ");
  const m = hay.match(/(?:open\s*balance|balance\s*due|balance|owes?|remaining|still\s*owes?)\D{0,8}\$?\s*([\d,]+(?:\.\d+)?)/i);
  if (m) return parseAmount(m[1]);
  return job.paid ? 0 : parseAmount(job.amount);
}

/** Open balance for a job = amount still owed on an INVOICE only.
 *  HARD RULE (Levi): estimates/leads never count toward balance due. */
export function openBalance(job) {
  if (!job) return 0;
  if (!isInvoiceJob(job)) return 0;
  return rawBalance(job);
}

/** Days since invoice date (0 if unknown). Used for aging stripe color. */
export function invoiceAgeDays(job, nowMs = Date.now()) {
  if (!job) return 0;
  const raw =
    job.invoiceDate ||
    job.txnDate ||
    job.date ||
    (job.status && job.status.Invoiced && job.status.Invoiced.d) ||
    "";
  const t = Date.parse(String(raw).slice(0, 10));
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000));
}

/** Red shade for open balance aging: older → darker red. Zero due → neutral. */
export function agingStripeColor(days, due = 1) {
  if (!(due > 0)) return "#cbd5e1"; // slate-300 — zero / closed
  if (days >= 120) return "#7f1d1d"; // very dark red
  if (days >= 90) return "#991b1b";
  if (days >= 60) return "#dc2626";
  if (days >= 30) return "#f87171";
  return "#fca5a5"; // light red under 30 days
}

/** Oldest open-invoice age (days) across jobs — for card bottom stripe. */
export function oldestOpenInvoiceAgeDays(jobs, nowMs = Date.now()) {
  let max = 0;
  let any = false;
  for (const j of jobs || []) {
    const due = openBalance(j);
    if (!(due > 0)) continue;
    any = true;
    max = Math.max(max, invoiceAgeDays(j, nowMs));
  }
  return any ? max : null;
}

/** Group jobs by service address for list expand. */
export function groupJobsByServiceAddress(jobs) {
  const map = new Map();
  for (const j of jobs || []) {
    const addr =
      String(j.serviceAddress || j.address || j.location || "").trim() || "No service address";
    if (!map.has(addr)) map.set(addr, []);
    map.get(addr).push(j);
  }
  return [...map.entries()].map(([address, list]) => ({ address, jobs: list }));
}

/** Sum of open balances across a customer's jobs. */
export function totalBalanceDue(jobs) {
  return (jobs || []).reduce((s, j) => s + openBalance(j), 0);
}

/** Formatted amount still owed on a job (never the invoice total). */
export function fmtAmountDue(job) {
  if (!job) return "";
  if (job.paid) return "Paid";
  const n = openBalance(job);
  return n > 0 ? fmt$(n) : "";
}

/** Invoice total from job.amount (original invoiced). */
export function invoiceTotal(job) {
  return parseAmount(job?.amount);
}

/** Amount paid so far (invoice total minus open balance, or full amount when paid). */
export function amountPaid(job) {
  if (!job) return 0;
  // Estimates never carry payments in any balance sense — and since their
  // openBalance is now $0, the `total - due` inference below would wrongly
  // report the whole estimate as "paid". Gate on being an actual invoice.
  if (!isInvoiceJob(job)) return 0;
  const total = invoiceTotal(job);
  const hasExplicitOpen = job.openBalance != null && job.openBalance !== "";
  const storedOpen = hasExplicitOpen ? parseAmount(job.openBalance) : null;
  // Fully paid in QBO/sync even when the local payment list is incomplete.
  if (
    (job.paid && (!hasExplicitOpen || storedOpen <= 0.01)) ||
    (hasExplicitOpen && storedOpen <= 0.01)
  ) {
    const pays = normalizePayments(job);
    const sum = pays.length ? totalPaid(pays) : 0;
    return Math.max(sum, total || parseAmount(job.payment?.amount) || 0);
  }
  const pays = normalizePayments(job);
  if (pays.length) return totalPaid(pays);
  if (job.paid && (job.openBalance == null || job.openBalance === "" || parseAmount(job.openBalance) === 0)) {
    return total || parseAmount(job.payment?.amount);
  }
  const due = openBalance(job);
  if (total > 0 && due >= 0 && due <= total) return total - due;
  return parseAmount(job.payment?.amount);
}

/** Percent of invoice paid (0–100). */
export function paidPct(job) {
  const total = invoiceTotal(job);
  if (!total) return 0;
  return Math.min(100, Math.round((amountPaid(job) / total) * 100));
}

/** Customer-group totals for the Jobs list header. */
export function customerAmountSummary(jobs) {
  const list = jobs || [];
  // Estimates are never counted in any form: invoiced/paid/due sum over
  // actual invoices only. (Estimate rows still show their own amount on their
  // row, but they contribute $0 to a customer's money totals.)
  const invoices = list.filter(isInvoiceJob);
  const invoiced = invoices.reduce((s, j) => s + invoiceTotal(j), 0);
  const paid = invoices.reduce((s, j) => s + amountPaid(j), 0);
  const due = totalBalanceDue(list);
  const openInvoices = list.filter((j) => !j.paid && openBalance(j) > 0).length;
  return { due, invoiced, paid, openInvoices, jobCount: list.length };
}

export function normalizeCustomer(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\s.,;:!?]+$/, "");
}

/**
 * Void / cancelled QBO cards (name contains the word "void") are not
 * uploadable and must never enter same-customer merge or import lists.
 * Levi 2026-07-17: "anyone that says void don't consider them uploadable."
 */
export function isVoidCustomerName(name) {
  return /\bvoid\b/i.test(String(name || "").trim());
}

/** True when any of the job's display names is a void card. */
export function isVoidCustomerJob(job) {
  const j = job || {};
  return (
    isVoidCustomerName(j.customer) ||
    isVoidCustomerName(j.businessName) ||
    isVoidCustomerName(j.personName)
  );
}

/** Loose name match — "izzy" matches "izzy ben shimon" (old customer URLs). */
export function customerNameMatches(job, nameKey) {
  const n = normalizeCustomer(job?.customer);
  const key = normalizeCustomer(nameKey);
  if (!n || !key) return false;
  if (n === key) return true;
  return n.startsWith(key + " ") || key.startsWith(n + " ");
}

/** Grouping key: explicit clientGroup first, then the normalized customer
 *  name (so "Meir Kabakov" and "meir kabakov " share a row), and only
 *  jobs with no customer at all stand alone. */
export const PENDING_IMPORT_LS = "lepro_pending_import";

/** Route key for a customer name before jobs exist (import flow). */
export function customerKeyForName(name) {
  const n = normalizeCustomer(name);
  return n ? "c:" + n : "";
}

/** Route key when we know the QuickBooks customer id (stable across renames). */
export function customerKeyForQboId(id) {
  const qid = String(id || "").trim();
  return qid ? "q:" + qid : "";
}

/** Best route key for an import pick — QBO id wins over display name. */
export function customerKeyForImport(c) {
  const qk = customerKeyForQboId(c && c.id);
  if (qk) return qk;
  return customerKeyForName((c && c.name) || "");
}

export function clientKey(job) {
  if (job.clientGroup) return "g:" + job.clientGroup;
  const qid = String(job.qboCustomerId || "").trim();
  if (qid) return "q:" + qid;
  const n = normalizeCustomer(job.customer);
  return n ? "c:" + n : "j:" + job.id;
}

/** All active jobs belonging to one customer group, resolved the SAME way the
 *  Jobs list groups them: primary key (clientGroup "g:" or normalized name
 *  "c:"), plus any name-keyed jobs folded into a matching clientGroup. Returns
 *  the jobs array (unsorted; caller can sort).
 *  hints — optional {name, businessName, personName} for q: keys when board
 *  jobs predate qboCustomerId (import flow / Arthur-style orphan rows). */
export function jobsForCustomerKey(jobs, key, hints, qboIndex) {
  const active = (jobs || []).filter((j) => j && !j._archived && !j._deleted);
  if (!key) return [];
  // Parent company view — sub-entity jobs + any billed directly to the parent.
  if (key.startsWith("p:q:")) {
    const pqid = key.slice(4);
    const childToParent = new Map();
    for (const c of qboIndex || []) {
      const id = String(c?.id || "").trim();
      const pid = String(c?.parentId || "").trim();
      if (id && pid) childToParent.set(id, pid);
    }
    const isSub = (j) => {
      if (String(j.parentQboCustomerId || "").trim()) return true;
      if (normalizeCustomer(j.parentCustomerName)) return true;
      const qid = String(j.qboCustomerId || "").trim();
      return !!(qid && childToParent.has(qid));
    };
    return active.filter((j) => {
      if (String(j.parentQboCustomerId || "").trim() === pqid) return true;
      if (childToParent.get(String(j.qboCustomerId || "").trim()) === pqid) return true;
      const qid = String(j.qboCustomerId || "").trim();
      return qid === pqid && !isSub(j);
    });
  }
  if (key.startsWith("p:c:")) {
    const pname = key.slice(4);
    return active.filter((j) => {
      if (normalizeCustomer(j.parentCustomerName) === pname) return true;
      if (String(j.parentQboCustomerId || "").trim() || normalizeCustomer(j.parentCustomerName)) return false;
      const n = normalizeCustomer(j.customer);
      const b = normalizeCustomer(j.businessName);
      return n === pname || b === pname;
    });
  }
  // Map clientGroup keys to the set of normalized names they contain, so a
  // "c:<name>" key also collects jobs sitting under that group.
  if (key.startsWith("g:")) {
    const grp = key.slice(2);
    const names = new Set();
    for (const j of active) if (j.clientGroup === grp) names.add(normalizeCustomer(j.customer));
    return active.filter(
      (j) =>
        j.clientGroup === grp ||
        (!j.clientGroup && [...names].some((n) => customerNameMatches({ customer: n }, j.customer)))
    );
  }
  if (key.startsWith("q:")) {
    const qid = key.slice(2);
    const byId = active.filter((j) => String(j.qboCustomerId || "").trim() === qid);
    if (byId.length) return byId;
    const h = hints || {};
    const names = [h.name, h.businessName, h.personName].filter(Boolean);
    for (const nm of names) {
      const hit = active.filter(
        (j) =>
          !j.clientGroup &&
          (customerNameMatches(j, nm) ||
            customerNameMatches({ customer: j.personName }, nm) ||
            customerNameMatches({ customer: j.businessName }, nm))
      );
      if (hit.length) return hit;
    }
    return [];
  }
  if (key.startsWith("c:")) {
    const name = key.slice(2);
    // A job with this name may have been folded into a clientGroup — find it.
    const grp = active.find((j) => j.clientGroup && customerNameMatches(j, name));
    if (grp) return jobsForCustomerKey(active, "g:" + grp.clientGroup);
    const byQbo = active.filter(
      (j) =>
        !j.clientGroup &&
        (customerNameMatches(j, name) ||
          customerNameMatches({ customer: j.personName }, name) ||
          customerNameMatches({ customer: j.businessName }, name))
    );
    if (byQbo.length) return byQbo;
    return active.filter((j) => !j.clientGroup && customerNameMatches(j, name));
  }
  if (key.startsWith("j:")) {
    const id = key.slice(2);
    return active.filter((j) => String(j.id) === id);
  }
  return [];
}

/** First non-empty contact field across a customer's jobs. */
export function customerContact(jobs) {
  const pick = (k) => (jobs || []).map((j) => j && j[k]).find(Boolean) || "";
  return {
    name: pick("businessName") || pick("customer"),
    businessName: pick("businessName"),
    personName: pick("personName"),
    phone: pick("phone"),
    email: pick("email"),
    billingAddress: pick("billingAddress"),
    apartment: pick("apartment"),
    address: pick("serviceAddress") || pick("address"),
    qboCustomerId: pick("qboCustomerId"),
  };
}

/** Plain Levenshtein distance (small strings — names). */
export function levenshtein(a, b) {
  a = String(a);
  b = String(b);
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** Digits-only phone for loose matching (718-555-1234 == 7185551234). */
export function normalizePhone(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d.length >= 7 ? d : "";
}

/** Lowercase email for contact matching. */
export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/** Same phone (10-digit) or email across two jobs — expanded duplicate scan. */
export function contactInfoMatches(a, b) {
  const pa = normalizePhone(a && a.phone);
  const pb = normalizePhone(b && b.phone);
  if (pa && pb && pa === pb) return true;
  const ea = normalizeEmail(a && a.email);
  const eb = normalizeEmail(b && b.email);
  return !!(ea && eb && ea === eb);
}

/** Collapse billing/service address noise for exact identity match. */
export function normalizeBillingAddress(addr) {
  return String(addr || "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\bapt\.?\b/g, "apt")
    .replace(/\bapartment\b/g, "apt")
    .replace(/\bsuite\b/g, "ste")
    .replace(/\s+/g, " ")
    .trim();
}

/** Alias — same normalizer for service addresses. */
export const normalizeServiceAddress = normalizeBillingAddress;

/**
 * Two normalized service addresses count as the same site when equal, or when
 * the longer one starts with the shorter (e.g. "489 midwood st" vs
 * "489 midwood st brooklyn ny 11225"). Min short length 10 avoids loose hits.
 */
export function serviceAddressesEqual(a, b) {
  const x = normalizeServiceAddress(a);
  const y = normalizeServiceAddress(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const short = x.length <= y.length ? x : y;
  const long = x.length <= y.length ? y : x;
  return short.length >= 10 && long.startsWith(short);
}

/**
 * Distinct normalized service addresses from a customer-like object or job list.
 * Accepts serviceAddresses[], serviceAddress, address, and jobs[].
 */
export function serviceAddressSet(profile) {
  const p = profile || {};
  const out = new Set();
  const add = (v) => {
    const n = normalizeServiceAddress(v);
    if (n) out.add(n);
  };
  if (Array.isArray(p.serviceAddresses)) p.serviceAddresses.forEach(add);
  add(p.serviceAddress);
  add(p.address);
  if (Array.isArray(p.jobs)) {
    for (const j of p.jobs) {
      add(j?.serviceAddress || j?.address);
    }
  }
  return out;
}

/**
 * Exact identity field matches between two customer-like objects.
 * Fields (5): name, phone, email, billing address, service address.
 * Returns { matchCount, matches: {name,phone,email,billing,service}, hasServiceData }.
 */
export function matchCustomerFields(a, b) {
  const left = a || {};
  const right = b || {};
  const na = normalizeCustomer(left.businessName || left.name || left.customer || "");
  const nb = normalizeCustomer(right.businessName || right.name || right.customer || "");
  const pa = normalizePhone(left.phone);
  const pb = normalizePhone(right.phone);
  const ea = normalizeEmail(left.email);
  const eb = normalizeEmail(right.email);
  const ba = normalizeBillingAddress(left.billingAddress || left.addr || left.billingAddr);
  const bb = normalizeBillingAddress(right.billingAddress || right.addr || right.billingAddr);
  const sa = serviceAddressSet(left);
  const sb = serviceAddressSet(right);
  let service = false;
  if (sa.size && sb.size) {
    for (const aAddr of sa) {
      for (const bAddr of sb) {
        if (serviceAddressesEqual(aAddr, bAddr)) {
          service = true;
          break;
        }
      }
      if (service) break;
    }
  }
  const matches = {
    name: !!(na && nb && na === nb),
    phone: !!(pa && pb && pa === pb),
    email: !!(ea && eb && ea === eb),
    billing: !!(ba && bb && ba === bb),
    service,
  };
  const matchCount = ["name", "phone", "email", "billing", "service"].filter((k) => matches[k]).length;
  return {
    matchCount,
    matches,
    hasServiceData: sa.size > 0 && sb.size > 0,
  };
}

/**
 * True when ≥ min of the five identity fields match 100% (default 3).
 * When both sides have a service address, service MUST match for auto-approve
 * (Levi: 3 of 5 including service address). When either side has no service
 * data (e.g. QuickBooks index), service is not required — ≥min of the rest.
 */
export function isStrongCustomerMatch(a, b, min = 3, opts = {}) {
  const { matchCount, matches, hasServiceData } = matchCustomerFields(a, b);
  if (matchCount < min) return false;
  const requireService = opts.requireService !== false;
  if (requireService && hasServiceData && !matches.service) return false;
  return true;
}

/** Near-identical customer names: case-insensitive Levenshtein <= 2 on
 *  strings longer than 4 chars, or one contains the other with a
 *  >= 5-char overlap. Identical names are NOT a "pair" (same key already). */
export function namesNearDuplicate(a, b) {
  const x = normalizeCustomer(a);
  const y = normalizeCustomer(b);
  if (!x || !y || x === y) return false;
  if (x.length > 4 && y.length > 4 && levenshtein(x, y) <= 2) return true;
  const short = x.length <= y.length ? x : y;
  const long = x.length <= y.length ? y : x;
  return short.length >= 5 && long.includes(short);
}

/** Stable id for a name pair — order-independent. */
export function pairId(a, b) {
  return [normalizeCustomer(a), normalizeCustomer(b)].sort().join("|");
}

const NOMERGE_KEY = "lepro_nomerge";

export function loadDismissed() {
  try {
    const v = JSON.parse(localStorage.getItem(NOMERGE_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Merge server-stored dismissals into local memory (device sync). */
export function hydrateDismissed(serverList) {
  const remote = Array.isArray(serverList) ? serverList.filter(Boolean) : [];
  if (!remote.length) return loadDismissed();
  const local = loadDismissed();
  const merged = [...new Set([...local, ...remote])];
  if (merged.length !== local.length) {
    try {
      localStorage.setItem(NOMERGE_KEY, JSON.stringify(merged));
    } catch {}
  }
  return merged;
}

export function isDismissed(a, b) {
  return loadDismissed().includes(pairId(a, b));
}

/** Best display name for merge pairing (customer field, else business name). */
export function mergeDisplayName(job) {
  const j = job || {};
  return String(j.customer || j.businessName || "").trim();
}

/**
 * Durable keys for a merge decision — name pair, client keys, shared phone/email.
 * Storing all of these stops the same combo from reappearing after renames or QBO sync.
 */
export function mergeDecisionKeys(ja, jb) {
  const a = ja || {};
  const b = jb || {};
  const keys = [];
  const namePairs = [
    [a.customer, b.customer],
    [a.businessName || a.customer, b.businessName || b.customer],
    [mergeDisplayName(a), mergeDisplayName(b)],
  ];
  for (const [na, nb] of namePairs) {
    const xa = normalizeCustomer(na);
    const xb = normalizeCustomer(nb);
    if (xa && xb && xa !== xb) keys.push(pairId(na, nb));
  }
  const ca = clientKey(a);
  const cb = clientKey(b);
  if (ca && cb && ca !== cb) {
    keys.push("ck:" + [ca, cb].sort().join("|"));
  }
  const pa = normalizePhone(a.phone);
  const pb = normalizePhone(b.phone);
  if (pa && pb && pa === pb) keys.push("ph:" + pa);
  const ea = normalizeEmail(a.email);
  const eb = normalizeEmail(b.email);
  if (ea && eb && ea === eb) keys.push("em:" + ea);
  return [...new Set(keys)];
}

function storeDismissedKeys(keys) {
  if (!keys || !keys.length) return;
  const list = loadDismissed();
  let changed = false;
  for (const id of keys) {
    if (!id || list.includes(id)) continue;
    list.push(id);
    changed = true;
  }
  if (changed) {
    try {
      localStorage.setItem(NOMERGE_KEY, JSON.stringify(list));
    } catch {}
  }
}

export function dismissPair(a, b) {
  // Name-only (legacy) or full job objects for durable multi-key memory.
  if (a && typeof a === "object" && b && typeof b === "object") {
    storeDismissedKeys(mergeDecisionKeys(a, b));
    return;
  }
  storeDismissedKeys([pairId(a, b)]);
}

/** True when Levi already decided this pair (names, client keys, or shared contact). */
export function isMergeDecisionRemembered(ja, jb) {
  const remembered = loadDismissed();
  if (!remembered.length) return false;
  if (isDismissed(mergeDisplayName(ja), mergeDisplayName(jb))) return true;
  if (isDismissed(ja?.customer, jb?.customer)) return true;
  return mergeDecisionKeys(ja, jb).some((k) => remembered.includes(k));
}

/** Push the full dismissal list to the server overlay (fire-and-forget). */
export async function persistDismissed(api) {
  if (!api?.saveNomergePairs) return;
  try {
    await api.saveNomergePairs(loadDismissed());
  } catch {
    /* offline — local copy still works */
  }
}

const MERGE_SNOOZE_KEY = "lepro_merge_snooze";

function sessionStore() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

export function loadSnoozed() {
  const s = sessionStore();
  if (!s) return [];
  try {
    const v = JSON.parse(s.getItem(MERGE_SNOOZE_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function isSnoozed(a, b) {
  return loadSnoozed().includes(pairId(a, b));
}

/** Hide this pair until the next app login (fresh browsing session). */
export function snoozePair(a, b) {
  const list = loadSnoozed();
  const id = pairId(a, b);
  if (list.includes(id)) return;
  list.push(id);
  const s = sessionStore();
  if (s) {
    try {
      s.setItem(MERGE_SNOOZE_KEY, JSON.stringify(list));
    } catch {}
  }
}

/** Active jobs belonging to one QBO customer (name or id match). */
export function jobsMatchingCustomer(customer, jobs) {
  const c = customer || {};
  const idStr = c.id != null ? String(c.id) : "";
  const key = normalizeCustomer(c.name || c.businessName || "");
  if (!key && !idStr) return [];
  return (jobs || []).filter(
    (j) =>
      j &&
      !j._archived &&
      !j._deleted &&
      (normalizeCustomer(j.customer) === key ||
        normalizeCustomer(j.businessName) === key ||
        (idStr && String(j.qboCustomerId || "") === idStr))
  );
}

/** Open invoices + estimates for a customer — options for the New Job title picker. */
export function openDocsForCustomer(customer, jobs) {
  const items = [];
  const seen = new Set();
  for (const j of jobsMatchingCustomer(customer, jobs)) {
    if (j.invoiceNo && !j.paid) {
      const k = "inv:" + j.invoiceNo;
      if (!seen.has(k)) {
        seen.add(k);
        items.push({
          kind: "invoice",
          no: String(j.invoiceNo),
          label: `Invoice #${j.invoiceNo}${j.title ? " — " + j.title : ""}`,
          title: j.title || "",
          serviceAddress: j.serviceAddress || j.address || "",
        });
      }
    }
    if (j.estimateNo && !j.invoiceNo) {
      const k = "est:" + j.estimateNo;
      if (!seen.has(k)) {
        seen.add(k);
        items.push({
          kind: "estimate",
          no: String(j.estimateNo),
          label: `Estimate #${j.estimateNo}${j.title ? " — " + j.title : ""}`,
          title: j.title || "",
          serviceAddress: j.serviceAddress || j.address || "",
        });
      }
    }
  }
  return items.sort((a, b) => a.kind.localeCompare(b.kind) || a.no.localeCompare(b.no));
}

/** Form patch to apply when an existing customer is picked in the New Job
 *  smart search (#55). The /customers name index only carries {name,id}, so
 *  billing/contact fields (phone/email/billing address) are pulled from that
 *  customer's jobs already in the app. Service address is NOT copied — it
 *  belongs to each invoice/estimate, not the customer. Any richer fields
 *  present directly on the match object take precedence. A "_newCustomer" pick
 *  contributes only the typed name (plus any direct fields). Returns a partial
 *  patch to merge into the form — keys are omitted when there's no value, so
 *  existing input survives. */
export function customerPickPatch(customer, jobs) {
  const c = customer || {};
  const patch = { customer: c.name || "", businessName: c.businessName || c.name || "" };
  if (c._newCustomer) {
    patch.qboCustomerId = "";
  } else {
    const idStr = c._pendingQbo ? "" : String(c.qboCustomerId || c.id || "").trim();
    patch.qboCustomerId = idStr;
    const key = normalizeCustomer(c.businessName || c.name);
    const mine = jobsMatchingCustomer(c, jobs);
    const contact = customerContact(mine);
    // Jobs may carry a stale businessName (e.g. copied from another template row);
    // only fold it in when it matches the QBO customer we picked.
    if (contact.businessName && normalizeCustomer(contact.businessName) === key) {
      patch.businessName = contact.businessName;
    }
    if (contact.personName) patch.personName = contact.personName;
    if (contact.phone) patch.phone = contact.phone;
    if (contact.email) patch.email = contact.email;
    if (contact.billingAddress) patch.billingAddress = contact.billingAddress;
  }
  if (c.businessName) patch.businessName = c.businessName;
  if (c.personName) patch.personName = c.personName;
  if (c.phone) patch.phone = c.phone;
  if (c.email) patch.email = c.email;
  if (c.billingAddress) patch.billingAddress = c.billingAddress;
  else if (c.addr) patch.billingAddress = c.addr;
  // Only when the match object itself carries a site line (not from other jobs).
  if (c.address) patch.serviceAddress = c.address;
  if (c.apartment) patch.apartment = c.apartment;
  if (c.parentId) {
    patch.parentQboCustomerId = String(c.parentId);
    if (c.parentName) patch.parentCustomerName = c.parentName;
  }
  return patch;
}

/** QBO customers from the name index that are NOT already present in the app as
 *  an active job (matched by normalized name) — the "not here yet" set the
 *  Jobs tab offers to import (#56). */
export function unknownCustomers(list, jobs) {
  const active = (jobs || []).filter((j) => j && !j._archived && !j._deleted);
  const haveIds = new Set(active.map((j) => String(j.qboCustomerId || "").trim()).filter(Boolean));
  const nameLinked = (nm) =>
    nm &&
    active.some(
      (j) =>
        String(j.qboCustomerId || "").trim() &&
        (normalizeCustomer(j.customer) === nm ||
          normalizeCustomer(j.personName) === nm ||
          normalizeCustomer(j.businessName) === nm)
    );
  return (Array.isArray(list) ? list : []).filter((c) => {
    if (!c) return false;
    // Void QBO cards are never offered as uploadable imports (Levi 2026-07-17).
    if (
      isVoidCustomerName(c.name) ||
      isVoidCustomerName(c.businessName) ||
      isVoidCustomerName(c.personName)
    ) {
      return false;
    }
    const id = c.id != null ? String(c.id).trim() : "";
    if (id && haveIds.has(id)) return false;
    const n = normalizeCustomer(c.name);
    const pn = normalizeCustomer(c.personName);
    const bn = normalizeCustomer(c.businessName);
    if (nameLinked(n) || nameLinked(pn) || nameLinked(bn)) return false;
    return true;
  });
}

/** Contact fields for side-by-side customer duplicate comparison. */
export function customerContactCompareRows(profileA, profileB) {
  const svc = (p) => serviceAddressesExcludingBilling(p.serviceAddresses, p.billingAddress).join("\n");
  const leftSvc = svc(profileA);
  const rightSvc = svc(profileB);
  return [
    { label: "Customer", left: profileA.name, right: profileB.name },
    { label: "Phone", left: profileA.phone, right: profileB.phone },
    { label: "Email", left: profileA.email, right: profileB.email },
    { label: "Billing", left: profileA.billingAddress, right: profileB.billingAddress },
    ...(leftSvc || rightSvc ? [{ label: "Service", left: leftSvc, right: rightSvc }] : []),
  ];
}

/** Aggregate contact + job summary from a customer's job list (merge compare). */
export function customerProfileFromJobs(jobs, displayName) {
  const list = (jobs || []).filter((j) => j && !j._archived && !j._deleted);
  const pick = (field) => {
    const vals = list.map((j) => String(j[field] || "").trim()).filter(Boolean);
    return vals[0] || "";
  };
  const serviceAddresses = [
    ...new Set(list.map((j) => String(j.serviceAddress || j.address || "").trim()).filter(Boolean)),
  ];
  const jobLines = list.map((j) => {
    const parts = [];
    if (j.invoiceNo) parts.push("Inv #" + j.invoiceNo);
    else if (j.estimateNo) parts.push("Est #" + j.estimateNo);
    if (j.title) parts.push(j.title);
    const due = fmtAmountDue(j);
    if (due && due !== "Paid") parts.push(due);
    else if (j.amount) parts.push(String(j.amount));
    return parts.join(" · ") || j.id;
  });
  return {
    name: displayName || pick("businessName") || pick("customer") || "(no name)",
    businessName: pick("businessName") || pick("customer"),
    personName: pick("personName"),
    phone: pick("phone"),
    email: pick("email"),
    billingAddress: pick("billingAddress"),
    qboCustomerId: pick("qboCustomerId"),
    serviceAddresses,
    jobLines,
    jobCount: list.length,
    totalDue: totalBalanceDue(list),
  };
}

/** Jobs list label — business name with person name when they differ (QBO profiles). */
export function boardCustomerLabel(job, jobs) {
  const j = job || {};
  const list = jobs && jobs.length ? jobs : j.id ? [j] : [];
  const display = String(j.businessName || j.customer || "").trim() || "(no customer)";
  const person = list.map((x) => String(x.personName || "").trim()).find(Boolean) || "";
  if (person && normalizeCustomer(person) !== normalizeCustomer(display)) return display + " · " + person;
  return display;
}

/** True when Levi already linked, combined, or parent/sub-resolved this pair. */
export function mergePairAlreadyResolved(ja, jb) {
  if (!ja || !jb) return false;
  if (ja.clientGroup && jb.clientGroup && ja.clientGroup === jb.clientGroup) return true;
  const na = normalizeCustomer(ja.customer);
  const nb = normalizeCustomer(jb.customer);
  const pa = normalizeCustomer(ja.parentCustomerName);
  const pb = normalizeCustomer(jb.parentCustomerName);
  if (pa && pa === nb) return true;
  if (pb && pb === na) return true;
  const qida = String(ja.qboCustomerId || "").trim();
  const qidb = String(jb.qboCustomerId || "").trim();
  const pqida = String(ja.parentQboCustomerId || "").trim();
  const pqidb = String(jb.parentQboCustomerId || "").trim();
  if (pqida && qidb && pqida === qidb) return true;
  if (pqidb && qida && pqidb === qida) return true;
  return false;
}

/** Active jobs grouped by clientKey — stable array of [key, jobs[]]. */
export function clientGroupEntries(jobs) {
  const map = new Map();
  for (const j of jobs || []) {
    if (!j || j._archived || j._deleted) continue;
    const k = clientKey(j);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(j);
  }
  return [...map.entries()];
}

/**
 * Candidate index pairs (i<k) for near-duplicate / contact merge.
 * Avoids full O(n²) Levenshtein on every customer pair — indexes by phone,
 * email, name prefix, and long shared words first.
 */
export function nearDuplicateCandidatePairs(entries) {
  const n = entries.length;
  const cand = new Set();
  const add = (i, k) => {
    if (i === k || i < 0 || k < 0 || i >= n || k >= n) return;
    cand.add(i < k ? `${i}:${k}` : `${k}:${i}`);
  };

  const norms = new Array(n);
  const phones = new Map();
  const emails = new Map();
  const byFirst = new Map();
  const byWord = new Map();

  for (let i = 0; i < n; i++) {
    const j = entries[i][1][0] || {};
    const name = normalizeCustomer(mergeDisplayName(j));
    const phone = normalizePhone(j.phone);
    const email = normalizeEmail(j.email);
    norms[i] = { name, phone, email, first: name ? name[0] : "", len: name.length };
    if (phone) {
      if (!phones.has(phone)) phones.set(phone, []);
      phones.get(phone).push(i);
    }
    if (email) {
      if (!emails.has(email)) emails.set(email, []);
      emails.get(email).push(i);
    }
    if (norms[i].first) {
      if (!byFirst.has(norms[i].first)) byFirst.set(norms[i].first, []);
      byFirst.get(norms[i].first).push(i);
    }
    if (name) {
      for (const w of name.split(" ")) {
        if (w.length < 5) continue;
        if (!byWord.has(w)) byWord.set(w, []);
        byWord.get(w).push(i);
      }
    }
  }

  const addAllPairs = (idxs) => {
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) add(idxs[a], idxs[b]);
    }
  };
  for (const idxs of phones.values()) if (idxs.length > 1) addAllPairs(idxs);
  for (const idxs of emails.values()) if (idxs.length > 1) addAllPairs(idxs);

  // Same first letter + similar length → Levenshtein; longer contains shorter.
  for (const idxs of byFirst.values()) {
    for (let a = 0; a < idxs.length; a++) {
      const i = idxs[a];
      const ni = norms[i];
      for (let b = a + 1; b < idxs.length; b++) {
        const k = idxs[b];
        const nk = norms[k];
        if (ni.len > 4 && nk.len > 4 && Math.abs(ni.len - nk.len) <= 2) {
          add(i, k);
          continue;
        }
        const short = ni.len <= nk.len ? ni : nk;
        const long = ni.len <= nk.len ? nk : ni;
        if (short.len >= 5 && long.len > short.len && long.name.includes(short.name)) add(i, k);
      }
    }
  }

  // Shared long word (different first letter still possible for contains).
  for (const idxs of byWord.values()) {
    if (idxs.length < 2) continue;
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const i = idxs[a];
        const k = idxs[b];
        const ni = norms[i];
        const nk = norms[k];
        if (ni.len >= 5 && nk.len > ni.len && nk.name.includes(ni.name)) add(i, k);
        else if (nk.len >= 5 && ni.len > nk.len && ni.name.includes(nk.name)) add(i, k);
        else if (ni.len > 4 && nk.len > 4 && Math.abs(ni.len - nk.len) <= 2) add(i, k);
      }
    }
  }

  // Full-string contains across any first letter ("Levin" ⊂ "Yehudah Levinson").
  // Plain includes is cheap; full Levenshtein on every pair is what froze the app.
  for (let i = 0; i < n; i++) {
    const ni = norms[i];
    if (ni.len < 5) continue;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const nk = norms[k];
      if (nk.len > ni.len && nk.name.includes(ni.name)) add(i, k);
    }
  }

  return cand;
}

/** Sorted [i,k] pairs from a "i:k" candidate set. */
function sortedCandidatePairs(cand) {
  return [...cand]
    .map((s) => {
      const c = s.indexOf(":");
      return [Number(s.slice(0, c)), Number(s.slice(c + 1))];
    })
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** First (deterministic) pair of distinct client keys whose names look like
 *  the same customer and that Levi hasn't already said "Not the same" to.
 *  Strong 3-of-5 exact matches (service included when available) are
 *  auto-handled elsewhere — not prompted.
 *  Returns { id, a:{name,jobs}, b:{name,jobs} } or null. */
export function findMergeSuggestion(jobs) {
  const entries = clientGroupEntries(jobs);
  const pairs = sortedCandidatePairs(nearDuplicateCandidatePairs(entries));
  for (const [i, k] of pairs) {
    const ja = entries[i][1][0];
    const jb = entries[k][1][0];
    // Void cards are not merge candidates (not uploadable / not same-customer).
    if (isVoidCustomerJob(ja) || isVoidCustomerJob(jb)) continue;
    const na = mergeDisplayName(ja);
    const nb = mergeDisplayName(jb);
    if (mergePairAlreadyResolved(ja, jb)) continue;
    const nameMatch = namesNearDuplicate(na, nb);
    const contactMatch = !nameMatch && contactInfoMatches(ja, jb);
    if (!nameMatch && !contactMatch) continue;
    if (isMergeDecisionRemembered(ja, jb)) continue;
    if (isSnoozed(na, nb) || isSnoozed(ja.customer, jb.customer)) continue;
    // 3-of-5 exact (service when both have it) → auto path, not a popup
    const pa = customerProfileFromJobs(entries[i][1], na);
    const pb = customerProfileFromJobs(entries[k][1], nb);
    if (isStrongCustomerMatch(pa, pb, 3)) continue;
    return {
      id: pairId(na, nb),
      reason: contactMatch ? "contact" : "name",
      a: { name: na, jobs: entries[i][1] },
      b: { name: nb, jobs: entries[k][1] },
    };
  }
  return null;
}
