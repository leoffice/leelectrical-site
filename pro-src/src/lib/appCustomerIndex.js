// App-local customer index — jobs carry contact info the app owns; QuickBooks
// index is separate. Merge both for search so app-only customers always appear
// (light orange = not verified in QuickBooks yet).
import { normalizeCustomer, customerContact, jobsForCustomerKey, clientKey } from "./customers.js";

/** True when this QBO id exists in the cached index row set. */
export function qboIdInIndex(qboCustomerId, qboIndex) {
  const id = String(qboCustomerId || "").trim();
  if (!id) return false;
  return (qboIndex || []).some((c) => String(c?.id || "") === id);
}

/** Return qboCustomerId only when it still exists in the QuickBooks index. */
export function trustedQboCustomerId(qboCustomerId, qboIndex) {
  const id = String(qboCustomerId || "").trim();
  if (!id) return "";
  return qboIdInIndex(id, qboIndex) ? id : "";
}

/** One row per customer group from active jobs — the app's customer file. */
export function buildAppCustomerIndex(jobs) {
  const active = (jobs || []).filter((j) => j && !j._archived && !j._deleted);
  const byKey = new Map();
  for (const j of active) {
    const key = clientKey(j);
    if (!key || key.startsWith("j:")) continue;
    const name = String(j.businessName || j.customer || "").trim();
    if (!name) continue;
    if (!byKey.has(key)) {
      const list = jobsForCustomerKey(active, key);
      const contact = customerContact(list);
      byKey.set(key, {
        id: contact.qboCustomerId || key,
        name: contact.businessName || contact.name || name,
        businessName: contact.businessName || contact.name || name,
        personName: contact.personName || "",
        phone: contact.phone || "",
        email: contact.email || "",
        billingAddress: contact.billingAddress || "",
        addr: contact.billingAddress || "",
        qboCustomerId: contact.qboCustomerId || "",
        _appKey: key,
        _fromApp: true,
      });
    }
  }
  return [...byKey.values()];
}

function rowMatchesQuery(row, needle) {
  const q = normalizeCustomer(needle);
  if (!q || q.length < 2) return false;
  const hay = [
    row.name,
    row.businessName,
    row.personName,
    row.phone,
    row.email,
    row.billingAddress,
    row.addr,
  ]
    .map((x) => normalizeCustomer(x))
    .filter(Boolean);
  return hay.some((h) => h.includes(q) || q.includes(h));
}

function rowDedupeKey(row) {
  const qid = String(row.qboCustomerId || row.id || "").trim();
  if (qid && !qid.startsWith("c:") && !qid.startsWith("q:") && !qid.startsWith("p:") && !qid.startsWith("g:")) {
    return "q:" + qid;
  }
  return "n:" + normalizeCustomer(row.businessName || row.name);
}

/** Merge QuickBooks search hits with app-local customers; mark pending sync. */
export function mergeCustomerSearchResults(qboResults, appIndex, query, qboFullIndex) {
  const qbo = Array.isArray(qboResults) ? qboResults : [];
  const app = Array.isArray(appIndex) ? appIndex : [];
  const full = Array.isArray(qboFullIndex) ? qboFullIndex : qbo;
  const needle = String(query || "").trim();
  const out = new Map();

  for (const c of qbo) {
    if (!c) continue;
    const key = rowDedupeKey(c);
    const qid = String(c.id || "").trim();
    out.set(key, { ...c, qboCustomerId: qid, _pendingQbo: false, _fromApp: false });
  }

  const appHits = needle.length >= 2 ? app.filter((c) => rowMatchesQuery(c, needle)) : [];
  for (const c of appHits) {
    const trusted = trustedQboCustomerId(c.qboCustomerId, full);
    const key = trusted ? "q:" + trusted : "a:" + normalizeCustomer(c.businessName || c.name);
    if (out.has("q:" + trusted) && trusted) continue;
    out.set(key, {
      ...c,
      id: trusted || c._appKey || c.id,
      qboCustomerId: trusted,
      _pendingQbo: !trusted,
      _fromApp: true,
    });
  }

  const rows = [...out.values()];
  const seen = new Set();
  const deduped = [];
  for (const row of rows.sort((a, b) => (a._fromApp ? 1 : 0) - (b._fromApp ? 1 : 0))) {
    const key = normalizeCustomer(row.businessName || row.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

/** Decorate rows when we only have the full QBO index (no query). */
export function markAppOnlyCustomers(rows, qboFullIndex) {
  return (rows || []).map((c) => {
    const trusted = trustedQboCustomerId(c.qboCustomerId || c.id, qboFullIndex);
    if (c._fromApp && !trusted) {
      return { ...c, qboCustomerId: "", _pendingQbo: true };
    }
    if (trusted) return { ...c, qboCustomerId: trusted, _pendingQbo: false };
    return c;
  });
}