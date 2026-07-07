// Customer identity — grouping keys + near-duplicate detection for the
// "Same customer?" combine prompt (bugs #1/#2).
//
//   normalizeCustomer("  Meir  Kabakov. ") -> "meir kabakov"
//   clientKey(job)  -> "g:<clientGroup>" | "c:<normalized name>" | "j:<id>"
//   namesNearDuplicate("Arthur koptiv","Arthur Koptive") -> true
//   findMergeSuggestion(jobs) -> first non-dismissed near-duplicate pair
//   dismissPair / isDismissed -> permanent "Not the same" memory
//     (localStorage lepro_nomerge, key = sorted normalized pair)

import { parseAmount } from "./format.js";

/** Open balance for a job = the amount still owed.
 *  Priority: explicit job.openBalance -> a "balance: $X" / "owes $X" figure in
 *  notes or the follow-up text -> the job.amount when unpaid. Paid jobs with no
 *  explicit remainder are 0. Used for the customer-group "total balance due". */
export function openBalance(job) {
  if (!job) return 0;
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

export function normalizeCustomer(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\s.,;:!?]+$/, "");
}

/** Grouping key: explicit clientGroup first, then the normalized customer
 *  name (so "Meir Kabakov" and "meir kabakov " share a row), and only
 *  jobs with no customer at all stand alone. */
export function clientKey(job) {
  if (job.clientGroup) return "g:" + job.clientGroup;
  const n = normalizeCustomer(job.customer);
  return n ? "c:" + n : "j:" + job.id;
}

/** All active jobs belonging to one customer group, resolved the SAME way the
 *  Jobs list groups them: primary key (clientGroup "g:" or normalized name
 *  "c:"), plus any name-keyed jobs folded into a matching clientGroup. Returns
 *  the jobs array (unsorted; caller can sort). */
export function jobsForCustomerKey(jobs, key) {
  const active = (jobs || []).filter((j) => j && !j._archived && !j._deleted);
  if (!key) return [];
  // Map clientGroup keys to the set of normalized names they contain, so a
  // "c:<name>" key also collects jobs sitting under that group.
  if (key.startsWith("g:")) {
    const grp = key.slice(2);
    const names = new Set();
    for (const j of active) if (j.clientGroup === grp) names.add(normalizeCustomer(j.customer));
    return active.filter(
      (j) => j.clientGroup === grp || (!j.clientGroup && names.has(normalizeCustomer(j.customer)))
    );
  }
  if (key.startsWith("c:")) {
    const name = key.slice(2);
    // A job with this name may have been folded into a clientGroup — find it.
    const grp = active.find((j) => j.clientGroup && normalizeCustomer(j.customer) === name);
    if (grp) return jobsForCustomerKey(active, "g:" + grp.clientGroup);
    return active.filter((j) => !j.clientGroup && normalizeCustomer(j.customer) === name);
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
    address: pick("serviceAddress") || pick("address"),
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
    const idStr = c.id != null ? String(c.id) : "";
    patch.qboCustomerId = idStr;
    const key = normalizeCustomer(c.name);
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
  // Only when the match object itself carries a site line (not from other jobs).
  if (c.address) patch.serviceAddress = c.address;
  if (c.apartment) patch.apartment = c.apartment;
  return patch;
}

/** QBO customers from the name index that are NOT already present in the app as
 *  an active job (matched by normalized name) — the "not here yet" set the
 *  Jobs tab offers to import (#56). */
export function unknownCustomers(list, jobs) {
  const have = new Set(
    (jobs || [])
      .filter((j) => j && !j._archived && !j._deleted)
      .map((j) => normalizeCustomer(j.customer))
      .filter(Boolean)
  );
  return (Array.isArray(list) ? list : []).filter((c) => c && !have.has(normalizeCustomer(c.name)));
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
    const na = entries[i][1][0].customer;
    for (let k = i + 1; k < entries.length; k++) {
      const nb = entries[k][1][0].customer;
      if (!namesNearDuplicate(na, nb)) continue;
      if (isDismissed(na, nb)) continue;
      return {
        id: pairId(na, nb),
        a: { name: na, jobs: entries[i][1] },
        b: { name: nb, jobs: entries[k][1] },
      };
    }
  }
  return null;
}
