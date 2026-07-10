// Customer identity — grouping keys + near-duplicate detection for the
// "Same customer?" combine prompt (bugs #1/#2).
//
//   normalizeCustomer("  Meir  Kabakov. ") -> "meir kabakov"
//   clientKey(job)  -> "g:<clientGroup>" | "c:<normalized name>" | "j:<id>"
//   namesNearDuplicate("Arthur koptiv","Arthur Koptive") -> true
//   findMergeSuggestion(jobs) -> first non-dismissed near-duplicate pair
//   dismissPair / isDismissed -> permanent "Not the same" memory
//     (localStorage lepro_nomerge, key = sorted normalized pair)
//   snoozePair / isSnoozed -> "Ask me later" until next login
//     (sessionStorage lepro_merge_snooze — cleared on fresh app open)

import { fmt$, parseAmount } from "./format.js";
import { normalizePayments, remainingBalance, totalPaid, amountOwedAtStart } from "./payments.js";

/** Open balance for a job = the amount still owed.
 *  Priority: explicit job.openBalance -> a "balance: $X" / "owes $X" figure in
 *  notes or the follow-up text -> the job.amount when unpaid. Paid jobs with no
 *  explicit remainder are 0. Used for the customer-group "total balance due". */
export function openBalance(job) {
  if (!job) return 0;
  const pays = normalizePayments(job);
  if (pays.length) return remainingBalance(job, pays);
  if (job.openBalance != null && job.openBalance !== "") return parseAmount(job.openBalance);
  const hay = [job.notes, job.followUp && job.followUp.text].filter(Boolean).join(" ");
  const m = hay.match(/(?:open\s*balance|balance\s*due|balance|owes?|remaining|still\s*owes?)\D{0,8}\$?\s*([\d,]+(?:\.\d+)?)/i);
  if (m) return parseAmount(m[1]);
  return job.paid ? 0 : parseAmount(job.amount);
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
  const pays = normalizePayments(job);
  if (pays.length) return totalPaid(pays);
  const total = invoiceTotal(job);
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
  const invoiced = list.reduce((s, j) => s + invoiceTotal(j), 0);
  const paid = list.reduce((s, j) => s + amountPaid(j), 0);
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
export function jobsForCustomerKey(jobs, key, hints) {
  const active = (jobs || []).filter((j) => j && !j._archived && !j._deleted);
  if (!key) return [];
  // Parent company view — sub-entity jobs + any billed directly to the parent.
  if (key.startsWith("p:q:")) {
    const pqid = key.slice(4);
    return active.filter((j) => {
      if (String(j.parentQboCustomerId || "").trim() === pqid) return true;
      const qid = String(j.qboCustomerId || "").trim();
      return qid === pqid && !String(j.parentQboCustomerId || "").trim() && !normalizeCustomer(j.parentCustomerName);
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

export function isDismissed(a, b) {
  return loadDismissed().includes(pairId(a, b));
}

export function dismissPair(a, b) {
  const list = loadDismissed();
  const id = pairId(a, b);
  if (!list.includes(id)) {
    list.push(id);
    try {
      localStorage.setItem(NOMERGE_KEY, JSON.stringify(list));
    } catch {}
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
  const svc = (p) => (p.serviceAddresses || []).join("\n");
  return [
    { label: "Customer", left: profileA.name, right: profileB.name },
    { label: "Phone", left: profileA.phone, right: profileB.phone },
    { label: "Email", left: profileA.email, right: profileB.email },
    { label: "Billing", left: profileA.billingAddress, right: profileB.billingAddress },
    { label: "Service", left: svc(profileA), right: svc(profileB) },
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

/** First (deterministic) pair of distinct client keys whose names look like
 *  the same customer and that Levi hasn't already said "Not the same" to.
 *  Returns { id, a:{name,jobs}, b:{name,jobs} } or null. */
export function findMergeSuggestion(jobs) {
  const map = new Map();
  for (const j of jobs || []) {
    if (!j || j._archived || j._deleted) continue;
    const k = clientKey(j);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(j);
  }
  const entries = [...map.entries()];
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
      if (isSnoozed(na, nb)) continue;
      return {
        id: pairId(na, nb),
        reason: contactMatch ? "contact" : "name",
        a: { name: na, jobs: entries[i][1] },
        b: { name: nb, jobs: entries[k][1] },
      };
    }
  }
  return null;
}
