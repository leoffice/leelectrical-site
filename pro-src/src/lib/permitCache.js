/**
 * DOB / city permit cache for renewals (Levi 2026-08-10).
 *
 * Handy local facts: permit #, issue/expire dates, customer, email, phone,
 * business, address. One cache row per permit (or per address+permit) so
 * multi-address / multi-permit customers each get their own renew invoice.
 *
 * Seeded from:
 *  - ready renew scenarios (Hampton / Schenectady)
 *  - completedPermitsSeed.json (Drive BLZ Permits / Completed + Jose + Full Detailed)
 *
 * Host rebuild: ~/.hermes/shared/scripts/build_completed_permits_cache.py
 * Host DB: ~/.hermes/shared/completed_permits_cache.json
 *
 * Send history + reserved placeholders live in localStorage so notice emails
 * can reserve an invoice number without generating a real invoice yet.
 */

import { nextDocNumberFromJobs, isLeInvoiceNo, numericDocCore } from "./nextDocNumber.js";
import completedPermitsSeed from "../data/completedPermitsSeed.json";

const CACHE_KEY = "le-pro-dob-permit-cache";
const RESERVED_KEY = "le-pro-renew-reserved-inv";
const HISTORY_KEY = "le-pro-renew-send-history";

const DEFAULT_FEE = 365;

/** Drive completed-permits seed (permit #, issue/exp, customer, email when matched). */
export function loadCompletedPermitsSeedEntries() {
  const raw = completedPermitsSeed?.permits;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && (p.permitNo || p.address))
    .map((p) => ({
      permitNo: String(p.permitNo || "").trim(),
      issuedDate: String(p.issuedDate || "").trim().slice(0, 10),
      expiresDate: String(p.expiresDate || "").trim().slice(0, 10),
      address: String(p.address || "").trim(),
      customer: String(p.customer || "").trim(),
      displayCustomer: String(p.customer || "").trim(),
      businessName: String(p.businessName || "").trim(),
      email: String(p.email || "").trim(),
      realEmail: String(p.email || "").trim(),
      phone: String(p.phone || "").trim(),
      qboCustomerId: p.qboCustomerId ? String(p.qboCustomerId) : "",
      matchedCustomer: !!p.matchedCustomer,
      source: p.source || "drive:completed",
      fee: DEFAULT_FEE,
    }));
}

/** In-memory fallback when localStorage is missing (Node tests / private mode). */
const memoryStore = new Map();

/** Stable key for one permit at one address (separate invoice each). */
export function permitCacheKey({ permitNo = "", address = "", scenarioId = "" } = {}) {
  const sid = String(scenarioId || "").trim().toLowerCase();
  if (sid) return `sc:${sid}`;
  const no = String(permitNo || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const addr = String(address || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (no && addr) return `p:${no}|a:${addr}`;
  if (no) return `p:${no}`;
  if (addr) return `a:${addr}`;
  return "";
}

function expiresFromIssued(issuedDate) {
  const raw = String(issuedDate || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const d = new Date(raw + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "";
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/** Normalize a scenario / raw object into a cache entry. */
export function toPermitCacheEntry(sc) {
  if (!sc || typeof sc !== "object") return null;
  const issued = String(sc.issuedDate || "").trim().slice(0, 10);
  const expires =
    String(sc.expiresDate || "").trim().slice(0, 10) ||
    (issued ? expiresFromIssued(issued) : "");
  const scenarioId = String(sc.id || sc.scenarioId || "").trim();
  const permitNo = String(sc.permitNo || "").trim();
  const address = String(sc.address || "").trim();
  const id =
    String(sc.cacheId || "").trim() ||
    permitCacheKey({ permitNo, address, scenarioId }) ||
    `row-${Date.now()}`;
  return {
    id,
    scenarioId,
    permitNo,
    issuedDate: issued,
    expiresDate: expires,
    address,
    customer: String(sc.displayCustomer || sc.customer || "").trim(),
    businessName: String(sc.businessName || "").trim(),
    email: String(sc.realEmail || sc.email || "").trim(),
    phone: String(sc.phone || "").trim(),
    fee: sc.fee != null && Number(sc.fee) > 0 ? Number(sc.fee) : DEFAULT_FEE,
    qboCustomerId: sc.qboCustomerId ? String(sc.qboCustomerId) : "",
    matchedCustomer: !!(sc.matchedCustomer || sc.real || sc.realTest),
    source: sc.source || "scenario",
    updatedAt: new Date().toISOString(),
  };
}

function readJson(key, fallback) {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(key);
      if (raw == null || raw === "") {
        // Prefer memory if LS empty (tests that only wrote memory)
        if (memoryStore.has(key)) {
          const m = memoryStore.get(key);
          return m == null ? fallback : m;
        }
        return fallback;
      }
      const v = JSON.parse(raw);
      return v == null ? fallback : v;
    }
    if (memoryStore.has(key)) {
      const m = memoryStore.get(key);
      return m == null ? fallback : m;
    }
    return fallback;
  } catch {
    if (memoryStore.has(key)) {
      const m = memoryStore.get(key);
      return m == null ? fallback : m;
    }
    return fallback;
  }
}

function writeJson(key, value) {
  memoryStore.set(key, value);
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota — memory still holds it */
  }
}

/** Test helper — clear memory + localStorage keys. */
export function clearPermitCacheForTests() {
  memoryStore.clear();
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(RESERVED_KEY);
      localStorage.removeItem(HISTORY_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Full permit cache from localStorage.
 * Call ensurePermitCacheSeeded(scenarios) first from app code.
 */
export function loadPermitCache() {
  const stored = readJson(CACHE_KEY, null);
  const extras = Array.isArray(stored?.permits)
    ? stored.permits
    : Array.isArray(stored)
      ? stored
      : [];
  const byId = new Map();
  for (const e of extras) {
    if (!e || typeof e !== "object") continue;
    const id =
      e.id ||
      permitCacheKey({
        permitNo: e.permitNo,
        address: e.address,
        scenarioId: e.scenarioId,
      });
    if (!id) continue;
    byId.set(id, { ...e, id });
  }
  return Array.from(byId.values()).sort((a, b) =>
    String(a.address || "").localeCompare(String(b.address || ""))
  );
}

/**
 * Merge scenario seeds + Drive completed seed + any extra entries into the cache.
 * Safe to call often — upserts by id.
 * Ready scenarios win over drive rows for the same address/permit when both set.
 */
export function ensurePermitCacheSeeded(scenarios = [], extras = []) {
  const fromDrive = loadCompletedPermitsSeedEntries()
    .map(toPermitCacheEntry)
    .filter(Boolean);
  const fromSc = (Array.isArray(scenarios) ? scenarios : [])
    .map(toPermitCacheEntry)
    .filter(Boolean);
  const fromEx = (Array.isArray(extras) ? extras : [])
    .map(toPermitCacheEntry)
    .filter(Boolean);
  // Drive first, then scenarios/extras overwrite so ready renew facts stay authoritative
  return upsertPermitCacheEntries([...fromDrive, ...fromSc, ...fromEx]);
}

/** Upsert one or more cache rows (merge by id / permit+address). */
export function upsertPermitCacheEntries(entries = []) {
  const list = Array.isArray(entries) ? entries : [entries];
  const current = loadPermitCache();
  const byId = new Map(current.map((e) => [e.id, e]));
  for (const raw of list) {
    const entry = toPermitCacheEntry(raw) || (raw?.id ? raw : null);
    if (!entry?.id) continue;
    byId.set(entry.id, {
      ...(byId.get(entry.id) || {}),
      ...entry,
      updatedAt: new Date().toISOString(),
    });
  }
  const permits = Array.from(byId.values());
  writeJson(CACHE_KEY, { updatedAt: new Date().toISOString(), permits });
  return permits;
}

export function getPermitCacheEntry(query = {}) {
  const key = permitCacheKey(query);
  const all = loadPermitCache();
  if (key) {
    const hit = all.find((e) => e.id === key || permitCacheKey(e) === key);
    if (hit) return hit;
  }
  const no = String(query.permitNo || "").trim().toUpperCase();
  if (no) {
    const hit = all.find(
      (e) => String(e.permitNo || "").trim().toUpperCase() === no
    );
    if (hit) return hit;
  }
  const addr = String(query.address || "").trim().toLowerCase();
  if (addr) {
    return (
      all.find((e) =>
        String(e.address || "").trim().toLowerCase().includes(addr)
      ) || null
    );
  }
  return null;
}

/** Scenario-shaped object from a cache entry (for renew email / invoice). */
export function scenarioFromCacheEntry(entry, baseScenario = null) {
  if (!entry) return baseScenario;
  const base = baseScenario && typeof baseScenario === "object" ? { ...baseScenario } : {};
  return {
    ...base,
    id: entry.scenarioId || entry.id || base.id,
    displayCustomer: entry.customer || base.displayCustomer || "",
    greetingName:
      base.greetingName ||
      String(entry.customer || "")
        .trim()
        .split(/\s+/)[0] ||
      "there",
    businessName: entry.businessName || base.businessName || "",
    address: entry.address || base.address || "",
    permitNo: entry.permitNo || base.permitNo || "",
    issuedDate: entry.issuedDate || base.issuedDate || "",
    expiresDate: entry.expiresDate || base.expiresDate || "",
    fee: entry.fee != null ? entry.fee : base.fee != null ? base.fee : DEFAULT_FEE,
    realEmail: entry.email || base.realEmail || "",
    phone: entry.phone || base.phone || "",
    matchedCustomer: true,
    real: true,
    realTest: true,
    qboCustomerId: entry.qboCustomerId || base.qboCustomerId || "",
  };
}

/** Reserved placeholder invoice numbers (not real invoices until materialize). */
export function listReservedPlaceholderInvoices() {
  const arr = readJson(RESERVED_KEY, []);
  return Array.isArray(arr) ? arr : [];
}

export function isReservedPlaceholderInvoice(invoiceNo) {
  const inv = String(invoiceNo || "").trim().toUpperCase();
  if (!inv) return false;
  return listReservedPlaceholderInvoices().some(
    (r) => String(r.invoiceNo || "").trim().toUpperCase() === inv && !r.materialized
  );
}

/**
 * Reserve next LE-#### as a placeholder for a renew notice.
 * Bumps the local counter so other creates won't reuse it.
 * Does NOT create a job invoice.
 */
export function reservePlaceholderInvoiceNo(jobs = [], meta = {}) {
  const reserved = listReservedPlaceholderInvoices();
  // Include reserved numbers in max so nextDocNumber doesn't collide
  const ghostJobs = reserved.map((r) => ({
    invoiceNo: r.invoiceNo,
  }));
  const invoiceNo = nextDocNumberFromJobs([...(jobs || []), ...ghostJobs], "invoice");
  const row = {
    invoiceNo,
    scenarioId: String(meta.scenarioId || "").trim(),
    permitNo: String(meta.permitNo || "").trim(),
    address: String(meta.address || "").trim(),
    reservedAt: new Date().toISOString(),
    materialized: false,
  };
  reserved.push(row);
  writeJson(RESERVED_KEY, reserved);
  return invoiceNo;
}

/** Mark placeholder as realized (customer tapped Renew / invoice generated). */
export function markPlaceholderMaterialized(invoiceNo) {
  const inv = String(invoiceNo || "").trim();
  if (!inv) return;
  const reserved = listReservedPlaceholderInvoices().map((r) =>
    String(r.invoiceNo || "").trim() === inv
      ? { ...r, materialized: true, materializedAt: new Date().toISOString() }
      : r
  );
  writeJson(RESERVED_KEY, reserved);
}

/** Append a send-history row (local). Also mergeable from job.permitRenew.sendHistory. */
export function appendRenewSendHistory(entry) {
  const list = readJson(HISTORY_KEY, []);
  const arr = Array.isArray(list) ? list : [];
  const row = {
    id: `send-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    ...entry,
  };
  arr.unshift(row);
  writeJson(HISTORY_KEY, arr.slice(0, 200));
  return row;
}

export function loadLocalRenewSendHistory() {
  const list = readJson(HISTORY_KEY, []);
  return Array.isArray(list) ? list : [];
}

/**
 * Combined send history from jobs + local cache.
 * Newest first. Multiple sends to same permit all listed.
 */
export function listRenewSendHistory(jobs = []) {
  const rows = [];
  const seen = new Set();

  for (const j of jobs || []) {
    if (!j || j._deleted) continue;
    const pr = j.permitRenew || j.permitRenewMock || {};
    const hist = Array.isArray(pr.sendHistory) ? pr.sendHistory : [];
    const base = {
      jobId: j.id,
      address: String(j.serviceAddress || j.address || pr.address || "").trim(),
      customer: String(pr.displayCustomer || j.customer || "").trim(),
      permitNo: String(pr.permitNo || "").trim(),
      scenarioId: String(pr.scenarioId || "").trim(),
      placeholderInvoiceNo: String(
        pr.placeholderInvoiceNo ||
          (!pr.invoiceMaterialized ? j.invoiceNo : "") ||
          ""
      ).trim(),
      invoiceNo: pr.invoiceMaterialized
        ? String(j.invoiceNo || pr.placeholderInvoiceNo || "").trim()
        : "",
      invoiceMaterialized: !!pr.invoiceMaterialized,
    };
    for (const h of hist) {
      const id = h.id || `${j.id}-${h.at || h.sentAt || ""}`;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push({
        ...base,
        id,
        at: h.at || h.sentAt || pr.emailSentAt || pr.noticeSentAt || "",
        to: h.to || h.email || pr.noticeTo || j.email || "",
        subject: h.subject || "",
        placeholderInvoiceNo:
          h.placeholderInvoiceNo || base.placeholderInvoiceNo || "",
      });
    }
    // Single noticeSent without history array
    if (!hist.length && (pr.noticeSent || pr.emailSentAt || pr.noticeSentAt)) {
      const id = `${j.id}-notice`;
      if (!seen.has(id)) {
        seen.add(id);
        rows.push({
          ...base,
          id,
          at: pr.emailSentAt || pr.noticeSentAt || pr.createdAt || "",
          to: pr.noticeTo || j.email || "",
          subject: "",
        });
      }
    }
  }

  for (const h of loadLocalRenewSendHistory()) {
    const id = h.id || `local-${h.at}`;
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({
      id,
      jobId: h.jobId || "",
      at: h.at || "",
      to: h.to || h.email || "",
      subject: h.subject || "",
      address: h.address || "",
      customer: h.customer || "",
      permitNo: h.permitNo || "",
      scenarioId: h.scenarioId || "",
      placeholderInvoiceNo: h.placeholderInvoiceNo || h.invoiceNo || "",
      invoiceNo: h.invoiceMaterialized ? h.invoiceNo || "" : "",
      invoiceMaterialized: !!h.invoiceMaterialized,
    });
  }

  rows.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  return rows;
}

/** Format ISO → short local for history chips. */
export function formatSendHistoryWhen(iso) {
  const raw = String(iso || "").trim();
  if (!raw) return "—";
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw.slice(0, 16);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return raw.slice(0, 16);
  }
}

/** Highest reserved LE core (for tests). */
export function maxReservedLeCore() {
  let max = 0;
  for (const r of listReservedPlaceholderInvoices()) {
    if (!isLeInvoiceNo(r.invoiceNo)) continue;
    const n = numericDocCore(r.invoiceNo);
    if (n > max) max = n;
  }
  return max;
}
