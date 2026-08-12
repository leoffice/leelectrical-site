// Permit renew — real Renewal Notifications (Levi 2026-08-10).
// Ready addresses → Send Email (placeholder inv only) → customer Renew → real invoice.
// Auto schedule OFF. Phase B (pay → file DOB) is intentionally NOT here.

import { nextDocNumberFromJobs } from "./nextDocNumber.js";
import { normalizeEmail } from "./customers.js";
import { parseAmount } from "./format.js";
import { activeTenantConfig } from "./tenantBranding.js";
import { buildPayLandingUrl, buildShortPayLandingUrl } from "./payLanding.js";
import { buildContactBillingAddress } from "./docBillTo.js";
import { loadLocalRenewSendHistory } from "./permitCache.js";
import {
  ensurePermitCacheSeeded,
  reservePlaceholderInvoiceNo,
  markPlaceholderMaterialized,
  appendRenewSendHistory,
  listRenewSendHistory,
  formatSendHistoryWhen,
  getPermitCacheEntry,
  getPermitCacheGeneration,
  loadPermitCache,
  scenarioFromCacheEntry,
  toPermitCacheEntry,
  isDriveCompletedSource,
  isDobRenewableForNotify,
  isLeviApprovedForNotify,
} from "./permitCache.js";

export {
  listRenewSendHistory,
  formatSendHistoryWhen,
  ensurePermitCacheSeeded,
  markPlaceholderMaterialized,
  getPermitCacheEntry,
  scenarioFromCacheEntry,
  toPermitCacheEntry,
  isDriveCompletedSource,
  isDobRenewableForNotify,
  isLeviApprovedForNotify,
};

/** Default city electrical permit renew fee (editable before send later). */
export const PERMIT_RENEW_FEE = 365;

/**
 * 40 Hampton Pl · Yosef Beshari · L1 issued 10/11/2024 (expired).
 * S1 is a different open permit — do not use for renew.
 */
export const RENEW_HAMPTON_SCENARIO = {
  id: "hampton-yossi",
  displayCustomer: "Yosef Beshari",
  greetingName: "Yossi",
  address: "40 Hampton Pl",
  permitNo: "B01126007-L1-EL",
  issuedDate: "2024-10-11",
  fee: PERMIT_RENEW_FEE,
  realEmail: "yossi6886@gmail.com",
  matchedCustomer: true,
  real: true,
  /** @deprecated use real — kept so older jobs / tests still match */
  realTest: true,
};

/** @deprecated use RENEW_HAMPTON_SCENARIO */
export const PHASE_A_HAMPTON_SCENARIO = RENEW_HAMPTON_SCENARIO;

/**
 * LEGACY only — Yossi Hackner · 364 Schenectady Avenue.
 * Levi 2026-08-10: **not our permit** — kept so old history / tests resolve,
 * but never listed under Renewal Application pending send.
 */
export const RENEW_HACKNER_SCENARIO = {
  id: "schenectady-hackner",
  displayCustomer: "Yossi Hackner",
  greetingName: "Yossi",
  businessName: "234 Schenectady Avenue LLC",
  address: "364 Schenectady Avenue",
  permitNo: "",
  issuedDate: "",
  fee: PERMIT_RENEW_FEE,
  realEmail: "yhackner@gmail.com",
  phone: "3476935123",
  matchedCustomer: true,
  real: true,
  realTest: true,
  qboCustomerId: "1610",
  parentCustomerName: "Yossi Hackner",
  parentQboCustomerId: "336",
  needsDobLookup: true,
  /** Never surface in pending renew notifications */
  notOurPermit: true,
  excludedFromReady: true,
};

/** True when this service address must never get a renew notification. */
export function isExcludedRenewAddress(address = "") {
  const a = String(address || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  // Levi 2026-08-10: 364 Schenectady Avenue is not BLZ's permit
  if (/\b364\b/.test(a) && /schenectady/.test(a)) return true;
  return false;
}

function normalizeRenewAddrKey(address = "") {
  return String(address || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Real NYC DOB electrical permit / filing # (not a company name).
 * e.g. B01126007-L1-EL, M01442411-I1
 */
export function isRealCityPermitNo(permitNo = "") {
  const s = String(permitNo || "").trim().toUpperCase();
  if (!s || s.length < 6) return false;
  // Company / address masquerading as permit
  if (/LLC|INC|CORP|AVENUE|STREET|PLACE|ROAD|HACKNER|BESHARI/i.test(s)) return false;
  // DOB NOW style: letter + digits + optional -segment
  return /^[A-Z]\d{5,}(-[A-Z0-9]+)*(-EL)?$/i.test(s.replace(/\s+/g, ""));
}

/**
 * May staff send a renew notice for this scenario/cache row?
 * Requires real permit # (+ address). Issued date preferred but not required if permit known.
 */
export function canSendRenewNotice(scenario = {}) {
  const sc = scenario || {};
  const address = String(sc.address || "").trim();
  const permitNo = String(sc.permitNo || "").trim();
  if (!address) return { ok: false, reason: "Missing service address" };
  if (isExcludedRenewAddress(address) || sc.notOurPermit || sc.excludedFromReady) {
    return { ok: false, reason: "Not our permit — removed from renew list" };
  }
  if (!isRealCityPermitNo(permitNo)) {
    return {
      ok: false,
      reason: "Need real city permit # from DOB cache (not company name)",
    };
  }
  return { ok: true, reason: "" };
}

/** @deprecated use RENEW_HACKNER_SCENARIO */
export const REAL_TEST_HACKNER_SCENARIO = RENEW_HACKNER_SCENARIO;
/** @deprecated use RENEW_HACKNER_SCENARIO */
export const REAL_RENEW_SCHENECTADY_SCENARIO = RENEW_HACKNER_SCENARIO;

/**
 * Ready renew addresses (cache). Matched customers only for now.
 * Expand from host permits cache + QBO match later.
 * One scenario = one permit/address = its own invoice when renewed.
 */
/**
 * Ready renew addresses (staff can Send Email once real permit # is known).
 * Levi 2026-08-10: **remove 364 Schenectady / Hackner** — not our permit.
 * Future rows come from BLZ Permits/Completed cash-file cache, not hardcodes.
 */
export const READY_RENEW_SCENARIOS = [RENEW_HAMPTON_SCENARIO];

/** Seed / refresh the local DOB permit cache from ready scenarios. */
export function seedReadyPermitCache() {
  return ensurePermitCacheSeeded(READY_RENEW_SCENARIOS);
}

/** Safe mock recipient — only this customer for Phase A sends. */
export const LEVI_TESTER = {
  customer: "levi tester",
  email: "levikumer@gmail.com",
  aliases: ["levi tester", "tester 2"],
};

/**
 * Emails blocked from accidental blast (empty = none).
 * Bashari + Hackner are intentional real sends (Levi 2026-08-10).
 */
export const PHASE_A_BLOCKED_EMAILS = [];

/** Known customer emails on file for ready renews (compose can use or override). */
export const REAL_TEST_ALLOWED_EMAILS = [
  RENEW_HAMPTON_SCENARIO.realEmail,
  "yossi6886@gmail.com",
  RENEW_HACKNER_SCENARIO.realEmail,
  "yhackner@gmail.com",
];

function brand() {
  return activeTenantConfig().profile?.shortName || "BLZ Electric";
}

export function isLeviTesterEmail(email) {
  const e = normalizeEmail(email);
  if (!e) return false;
  return e === normalizeEmail(LEVI_TESTER.email) || e === "levikumer@gmail.com";
}

export function isLeviTesterCustomer(name) {
  const n = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!n) return false;
  return LEVI_TESTER.aliases.some((a) => n === a || n.includes(a));
}

export function isBlockedRenewRecipient(email) {
  const e = normalizeEmail(email);
  if (!e) return false;
  return PHASE_A_BLOCKED_EMAILS.some((b) => normalizeEmail(b) === e);
}

export function isRealTestAllowedEmail(email) {
  const e = normalizeEmail(email);
  if (!e) return false;
  return REAL_TEST_ALLOWED_EMAILS.some((b) => normalizeEmail(b) === e);
}

/**
 * Recipient gate for renew notices.
 * Staff may send to any real email (on-file or newly entered).
 * @returns {{ ok: true, email: string } | { ok: false, error: string }}
 */
export function assertPhaseARecipient(email) {
  const raw = String(email || "").trim();
  const resolved = raw || RENEW_HAMPTON_SCENARIO.realEmail || "";
  if (!resolved.includes("@")) {
    return { ok: false, error: "Need a real email address" };
  }
  if (isBlockedRenewRecipient(resolved)) {
    return { ok: false, error: "That address is blocked for renew send" };
  }
  return { ok: true, email: resolved };
}

/**
 * Compose send gate — any valid To address (existing on file or new).
 * @returns {{ ok: true, email: string, realTest: boolean } | { ok: false, error: string }}
 */
export function assertRenewComposeRecipient(email, { realTest = false } = {}) {
  const raw = String(email || "").trim();
  // On-file fields often hold "a@x.com, b@y.com" — validate EVERY address;
  // the server sends to all of them (split/trim/dedupe).
  const parts = raw
    .split(/[,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const seen = new Set();
  const list = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(p);
  }
  if (!list.length || list.some((p) => !p.includes("@"))) {
    return { ok: false, error: "Enter an email address" };
  }
  const blocked = list.find((p) => isBlockedRenewRecipient(p));
  if (blocked) {
    return { ok: false, error: `${blocked} is blocked for renew send` };
  }
  return {
    ok: true,
    email: list.join(", "),
    recipients: list,
    realTest: !list.every((p) => isLeviTesterEmail(p)) || !!realTest,
  };
}

/** True if this is a leftover Levi-Tester mock renew (safe to delete).
 *  Levi 2026-08-11: do NOT hide paid real-customer renews (or any money paid).
 *  Old rule treated every phase-A mock as tester junk — that hid Yosef LE-2702
 *  from Deploy after he paid $365. Only true Levi-tester leftovers go away.
 */
export function isLeviTesterMockRenewJob(job) {
  if (!job || !isPermitRenewJob(job)) return false;
  const pr = job.permitRenew || job.permitRenewMock || {};
  if (pr.realTest) return false;
  // Paid / queued for DOB renew — always keep on Deploy + paid lists
  if (
    job.paid ||
    pr.paid ||
    pr.nextStep === "update_permit" ||
    pr.queueUpdatePermit ||
    pr.deployUpdate
  ) {
    return false;
  }
  const pays = Array.isArray(job.payments) ? job.payments : [];
  if (pays.some((p) => parseAmount(p?.amount) > 0.009)) return false;
  // Real customer on the bill (not tester) — keep, even if phase still "A"
  const display =
    pr.displayCustomer || job.customer || job.personName || job.businessName || "";
  if (display && !isLeviTesterCustomer(display) && !isLeviTesterCustomer(job.customer)) {
    return false;
  }
  if (isLeviTesterEmail(job.email)) return true;
  if (
    isLeviTesterCustomer(job.customer) ||
    isLeviTesterCustomer(job.businessName) ||
    isLeviTesterCustomer(pr.displayCustomer)
  ) {
    return true;
  }
  // No real customer signal — only drop pure mock leftovers
  return !!(pr.mock || pr.phase === "A" || pr.phase === 1) && !pr.realTest;
}

export function renewFeeFromScenario(scenario = PHASE_A_HAMPTON_SCENARIO) {
  const n = parseAmount(scenario?.fee);
  return n > 0 ? n : PERMIT_RENEW_FEE;
}

/** Invoice line items for a city permit renew — 3-line professional description. */
export function buildPermitRenewInvoiceLines({
  fee = PERMIT_RENEW_FEE,
  address = PHASE_A_HAMPTON_SCENARIO.address,
  permitNo = PHASE_A_HAMPTON_SCENARIO.permitNo,
} = {}) {
  const amt = parseAmount(fee) || PERMIT_RENEW_FEE;
  const addr = String(address || "").trim() || PHASE_A_HAMPTON_SCENARIO.address;
  const no = String(permitNo || "").trim() || PHASE_A_HAMPTON_SCENARIO.permitNo;
  // Three short lines — readable on pay page + PDF (Levi 2026-08-10).
  const desc = [
    "City electrical permit renewal",
    no ? `Permit # ${no}` : "Permit renewal filing",
    `Service location: ${addr}`,
  ].join("\n");
  return [
    {
      itemName: "City electrical permit renewal",
      description: desc,
      qty: 1,
      unitPrice: amt,
    },
  ];
}

/** Bill-to block under customer name (not the service street). */
export function buildPermitRenewBillingAddress({
  billingAddress = "",
  mailAddress = "",
  email = "",
  phone = "",
  serviceAddress = "",
} = {}) {
  return buildContactBillingAddress({
    billingAddress,
    mailAddress,
    email,
    phone,
    serviceAddress,
  });
}

export function isPermitRenewJob(job) {
  if (!job) return false;
  if (
    job.permitRenew &&
    (job.permitRenew.mock ||
      job.permitRenew.realTest ||
      job.permitRenew.noticeOnly ||
      job.permitRenew.placeholderInvoiceNo ||
      job.permitRenew.phase === "A" ||
      job.permitRenew.phase === "real")
  ) {
    return true;
  }
  // Older seed from permitRenewInvoice.js (phase 1 marker)
  if (job.permitRenewMock && (job.permitRenewMock.mock || job.permitRenewMock.phase === 1)) {
    return true;
  }
  const title = String(job.title || "").toLowerCase();
  if (/permit\s+renew/i.test(title)) return true;
  const lines = Array.isArray(job.invoiceLines) ? job.invoiceLines : [];
  return lines.some((ln) =>
    /permit\s+renew|city electrical permit renewal|electrical permit renewal/i.test(
      String(ln?.itemName || "") + " " + String(ln?.description || "")
    )
  );
}

/**
 * Open (unpaid) renew invoice still on the board — reuse instead of spam.
 * Notice-only jobs (placeholder reserved, not yet materialized) also match
 * so we don't create a second row for the same permit/address.
 * @param {object[]} jobs
 * @param {{ scenarioId?: string, allowNoticeOnly?: boolean }} [opts]
 */
export function findOpenMockRenewJob(jobs, opts = {}) {
  const wantScenario = String(opts?.scenarioId || "").trim();
  const allowNoticeOnly = opts?.allowNoticeOnly !== false;
  const list = Array.isArray(jobs) ? jobs : [];
  for (const j of list) {
    if (!isPermitRenewJob(j)) continue;
    if (j.paid) continue;
    const pr = j.permitRenew || j.permitRenewMock || {};
    const noticeOnly = !!(pr.noticeOnly || (pr.placeholderInvoiceNo && !pr.invoiceMaterialized));
    const hasInv = !!String(j.invoiceNo || "").trim();
    const hasPlaceholder = !!String(pr.placeholderInvoiceNo || "").trim();
    // Real open invoice OR notice-only with reserved placeholder
    if (!hasInv && !(allowNoticeOnly && (noticeOnly || hasPlaceholder))) continue;
    if (hasInv && !noticeOnly) {
      const due =
        j.openBalance != null && j.openBalance !== ""
          ? parseAmount(j.openBalance)
          : parseAmount(j.amount);
      if (due <= 0.01) continue;
    }
    if (wantScenario) {
      const sid = String(pr.scenarioId || "").trim();
      // Legacy Phase A mocks without scenarioId count as hampton-yossi
      if (sid && sid !== wantScenario) continue;
      if (!sid && wantScenario !== "hampton-yossi") continue;
    }
    // Prefer tester / mock / real-test renews
    if (
      isLeviTesterCustomer(j.customer) ||
      isLeviTesterCustomer(j.businessName) ||
      isLeviTesterEmail(j.email) ||
      pr.mock ||
      pr.realTest ||
      pr.noticeOnly
    ) {
      return j;
    }
  }
  return null;
}

/**
 * City electrical permits are typically valid ~1 year from issue/grade.
 * Returns YYYY-MM-DD or "".
 */
export function permitExpiresFromIssued(issuedDate) {
  const raw = String(issuedDate || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const d = new Date(raw + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "";
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * True expiration date (Levi 2026-08-10 correction).
 *
 * DO NOT trust the printed "expiration date" on the PDF / OCR field — it is often
 * a false/clustered number. When we have an issue (or graded) date, expire is
 * always issue + 12 months. Printed expiresDate is only a last-resort fallback
 * when no issue date exists.
 *
 * Abandoned = true expire + 12 months (issue + 24 mo).
 */
export function permitTrueExpiresDate({ issuedDate, gradedDate, expiresDate } = {}) {
  const issued =
    String(issuedDate || gradedDate || "").trim().slice(0, 10) || "";
  if (issued) return permitExpiresFromIssued(issued);
  return String(expiresDate || "").trim().slice(0, 10);
}

/**
 * Fields for createJob — bill-to shows the real person's name,
 * service address is the permit site.
 *
 * @param {{ noticeOnly?: boolean, placeholderInvoiceNo?: string }} [opts]
 * noticeOnly: reserve a placeholder # for the email but do NOT generate a real
 * invoice (no invoiceNo / _invoiceConfirmed) until the customer taps Renew.
 */
export function buildPermitRenewJobFields({
  jobs = [],
  scenario = PHASE_A_HAMPTON_SCENARIO,
  fee,
  noticeOnly = false,
  placeholderInvoiceNo = "",
} = {}) {
  const sc = scenario || PHASE_A_HAMPTON_SCENARIO;
  const amount = fee != null ? parseAmount(fee) || PERMIT_RENEW_FEE : renewFeeFromScenario(sc);
  const reserved =
    String(placeholderInvoiceNo || "").trim() ||
    (noticeOnly
      ? reservePlaceholderInvoiceNo(jobs, {
          scenarioId: sc.id,
          permitNo: sc.permitNo,
          address: sc.address,
        })
      : nextDocNumberFromJobs(jobs, "invoice"));
  const lines = buildPermitRenewInvoiceLines({
    fee: amount,
    address: sc.address,
    permitNo: sc.permitNo,
  });
  // Person on the invoice (not "levi tester") — matches a normal customer invoice.
  const person = String(sc.displayCustomer || "").trim() || LEVI_TESTER.customer;
  const biz =
    String(sc.businessName || "").trim() ||
    (sc.realTest ? person : person);
  const serviceAddr = String(sc.address || "").trim();
  const isReal = !!sc.realTest;
  const email = isReal
    ? String(sc.realEmail || "").trim() || LEVI_TESTER.email
    : LEVI_TESTER.email;
  const phone = String(sc.phone || "").trim();
  // Full bill-to under the name (mail/email/phone) — never the service street
  // (Levi 2026-08-10: whole billing info + separate service address)
  const billingAddress = buildPermitRenewBillingAddress({
    billingAddress: sc.billingAddress || "",
    mailAddress: sc.mailAddress || "",
    email,
    phone,
    serviceAddress: serviceAddr,
  });
  return {
    // Sub-company LLC as customer when set (e.g. 234 Schenectady LLC under Hackner)
    customer: biz || person,
    businessName: biz || person,
    personName: person,
    email,
    phone,
    title: sc.permitNo
      ? `City electrical permit renewal — ${sc.permitNo}`
      : `City electrical permit renewal — ${serviceAddr}`,
    description: [
      "City electrical permit renewal",
      sc.permitNo ? `Permit # ${sc.permitNo}` : null,
      `Service location: ${serviceAddr}`,
    ]
      .filter(Boolean)
      .join("\n"),
    // Keep address = service for job index; PDF uses billingAddress + serviceAddress
    address: serviceAddr,
    serviceAddress: serviceAddr,
    billingAddress,
    amount: noticeOnly ? 0 : amount,
    // Notice-only: no real invoice # on the job until customer taps Renew
    invoiceNo: noticeOnly ? "" : reserved,
    invoiceLines: noticeOnly ? [] : lines,
    invoiceDate: noticeOnly ? "" : new Date().toISOString().slice(0, 10),
    _invoiceConfirmed: noticeOnly ? false : true,
    ...(sc.qboCustomerId ? { qboCustomerId: String(sc.qboCustomerId) } : {}),
    // Sub under parent (Yossi Hackner) — createJob must persist these
    ...(sc.parentCustomerName
      ? { parentCustomerName: String(sc.parentCustomerName).trim() }
      : {}),
    ...(sc.parentQboCustomerId
      ? { parentQboCustomerId: String(sc.parentQboCustomerId).trim() }
      : {}),
    // Always carry the reserved # for email + later materialize
    _placeholderInvoiceNo: reserved,
  };
}

/**
 * Format YYYY-MM-DD → "Month D, YYYY" for customer email (Levi 2026-08-10).
 * Empty / bad input → "".
 */
export function formatPermitDateUs(iso) {
  const raw = String(iso || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const [y, m, d] = raw.split("-").map((n) => Number(n));
  if (!y || !m || !d) return "";
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const name = months[m - 1];
  if (!name) return "";
  return `${name} ${d}, ${y}`;
}

/** YYYY-MM-DD → MM/DD/YYYY (Levi: month, day, year). */
export function formatPermitDateMdY(iso) {
  const raw = String(iso || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const [y, m, d] = raw.split("-");
  return `${m}/${d}/${y}`;
}

function parseIsoDateLocal(iso) {
  const raw = String(iso || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(raw + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDaysIso(iso, days) {
  const d = parseIsoDateLocal(iso);
  if (!d) return "";
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Abandoned date = expiration + 12 months (city marks abandoned after 12 mo unrenewed).
 */
export function permitAbandonedFromExpires(expiresIso) {
  return permitExpiresFromIssued(expiresIso); // +1 year helper is the same math
}

/**
 * Renew-by date for copy:
 * - expired: ~1 month before abandoned date
 * - not expired: ~7 days before expiration (floor today+1)
 */
export function permitRenewByDate(expiresIso, { todayIso } = {}) {
  const exp = String(expiresIso || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return "";
  const today =
    String(todayIso || "").trim().slice(0, 10) ||
    new Date().toISOString().slice(0, 10);
  const abandoned = permitAbandonedFromExpires(exp);
  if (today >= exp) {
    return addDaysIso(abandoned, -30) || "";
  }
  const weekBefore = addDaysIso(exp, -7);
  return weekBefore && weekBefore > today ? weekBefore : addDaysIso(today, 7);
}

/**
 * Auto status tone from today vs expiration (Levi 2026-08-10 stages).
 * @returns {"upcoming"|"soon"|"expired"|"near_abandon"|"abandoned"}
 *
 * Stages (notifications change by expiration date):
 * 1. upcoming — more than ~2 months before expire (early warning)
 * 2. soon — within ~2 months, not yet expired (upcoming / expires-soon warning)
 * 3. expired — on/after expire, not yet near abandoned
 * 4. near_abandon — within ~2 months of abandoned date (exp+12mo) — about to be banned/abandoned
 * 5. abandoned — on/after abandoned date — must apply for a brand-new permit (no renew)
 */
export function permitRenewStatusTone(expiresIso, { todayIso } = {}) {
  const exp = String(expiresIso || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return "upcoming";
  const today =
    String(todayIso || "").trim().slice(0, 10) ||
    new Date().toISOString().slice(0, 10);
  if (today < exp) {
    const soonCutoff = addDaysIso(exp, -60); // ~2 months before expire
    if (soonCutoff && today >= soonCutoff) return "soon";
    return "upcoming";
  }
  // Past expiration
  const abandoned = permitAbandonedFromExpires(exp);
  if (abandoned && today >= abandoned) return "abandoned";
  const nearAbandonCutoff = addDaysIso(abandoned, -60); // ~2 months before abandoned
  if (abandoned && nearAbandonCutoff && today >= nearAbandonCutoff) {
    return "near_abandon";
  }
  return "expired";
}

/** Short staff-facing label for the stage (purple renew list, chips). */
export function permitRenewStageLabel(tone) {
  switch (String(tone || "")) {
    case "soon":
      return "Expires soon";
    case "expired":
      return "Expired";
    case "near_abandon":
      return "Near abandoned";
    case "abandoned":
      return "Abandoned — re-apply";
    case "upcoming":
    default:
      return "Upcoming warning";
  }
}

/**
 * Single status sentence that auto-switches (never wrong for the date).
 * Levi 2026-08-10: stages include near-abandon + fully abandoned re-apply.
 */
export function permitRenewStatusSentence(address, expiresUs, tone, abandonedUs = "") {
  const addr = String(address || "").trim() || "this address";
  const exp = String(expiresUs || "").trim() || "the expiration date";
  const abd = String(abandonedUs || "").trim();
  if (tone === "abandoned") {
    return (
      `Your electrical permit at ${addr} expired on ${exp}` +
      (abd ? ` and is now abandoned (as of ${abd})` : " and is now abandoned") +
      `. It can no longer be renewed — you need to apply for a brand-new permit.`
    );
  }
  if (tone === "near_abandon") {
    return (
      `Your electrical permit at ${addr} expired on ${exp}` +
      (abd ? ` and is about to go into abandoned status on ${abd}` : " and is about to go into abandoned status") +
      `. Renew now — once abandoned, reinstating means filing a brand-new permit.`
    );
  }
  if (tone === "expired") {
    return `Your electrical permit at ${addr} expired on ${exp}. It can still be renewed now, but the 12-month abandoned clock has started.`;
  }
  if (tone === "soon") {
    return `Your electrical permit at ${addr} expires soon, on ${exp} — renewing now keeps it active.`;
  }
  return `Your electrical permit at ${addr} is coming up for renewal — it expires on ${exp}. Renewing on time keeps it active and continuous, with no re-inspection or refiling needed.`;
}

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Patch applied after createJob so renew metadata survives.
 * @param {object} [scenario]
 * @param {number} [fee]
 * @param {{ noticeOnly?: boolean, placeholderInvoiceNo?: string }} [opts]
 */
export function buildPermitRenewMetaPatch(scenario = PHASE_A_HAMPTON_SCENARIO, fee, opts = {}) {
  const sc = scenario || PHASE_A_HAMPTON_SCENARIO;
  const amount = fee != null ? parseAmount(fee) || PERMIT_RENEW_FEE : renewFeeFromScenario(sc);
  const issued = String(sc.issuedDate || "").trim().slice(0, 10);
  // Levi: issue + 12 months only — never printed expire when issue is known
  const expires = permitTrueExpiresDate({
    issuedDate: issued,
    expiresDate: sc.expiresDate,
  });
  const isReal = !!sc.realTest;
  const noticeOnly = !!opts.noticeOnly;
  const placeholder = String(opts.placeholderInvoiceNo || "").trim();
  return {
    // Notice-only: nothing owed until customer taps Renew and we materialize
    openBalance: noticeOnly ? 0 : amount,
    _invoiceConfirmed: noticeOnly ? false : true,
    email: isReal
      ? String(sc.realEmail || "").trim() || LEVI_TESTER.email
      : LEVI_TESTER.email,
    serviceAddress: sc.address,
    address: sc.address,
    // Bill-to contact block (email/phone) — not the service street
    billingAddress: buildPermitRenewBillingAddress({
      billingAddress: sc.billingAddress || "",
      mailAddress: sc.mailAddress || "",
      email: isReal ? String(sc.realEmail || "").trim() : LEVI_TESTER.email,
      phone: String(sc.phone || "").trim(),
      serviceAddress: sc.address,
    }),
    // Unpaid renew offers do not count as customer balance due (Levi 2026-08-10)
    excludeFromBalanceDue: true,
    permitRenew: {
      mock: !isReal,
      realTest: isReal,
      phase: isReal ? "real" : "A",
      // Provisional until paid — left on file, not treated as money owed
      provisional: true,
      excludeFromBalanceDue: true,
      // Levi 2026-08-10: real path = one amount only (no partials on pay page)
      fullPayOnly: true,
      // Notice path: email may show a reserved #; real invoice only on Renew tap
      noticeOnly,
      invoiceMaterialized: noticeOnly ? false : true,
      placeholderInvoiceNo: placeholder,
      scenarioId: sc.id || "hampton-yossi",
      displayCustomer: sc.displayCustomer,
      businessName: sc.businessName || "",
      address: sc.address,
      permitNo: sc.permitNo,
      issuedDate: issued,
      gradedDate: issued,
      expiresDate: expires,
      fee: amount,
      createdAt: new Date().toISOString(),
      autoEmail: false,
      noticeSent: false,
      sendHistory: [],
    },
    paperwork: {
      dob: {
        enabled: true,
        renewSchedule: {
          on: true,
          autoEmail: false,
          updatedAt: new Date().toISOString(),
          mockPhaseA: true,
        },
      },
      city: {
        enabled: true,
        renewSchedule: {
          on: true,
          autoEmail: false,
          updatedAt: new Date().toISOString(),
          mockPhaseA: true,
        },
      },
    },
  };
}

/**
 * Rows for Renewal Notifications — real customers pending send / paid→deploy.
 * Sorted: paid-update first, unpaid open, then drafts.
 * Levi 2026-08-10: hide leftover Levi-Tester mock renews (test phase over).
 */
export function listRenewApplications(jobs = [], { includeMock = false } = {}) {
  const list = Array.isArray(jobs) ? jobs : [];
  const rows = [];
  const seen = new Set();

  const pushFromJob = (j, extra = {}) => {
    if (!j?.id || seen.has(j.id)) return;
    if (j._deleted) return;
    if (!includeMock && isLeviTesterMockRenewJob(j)) return;
    seen.add(j.id);
    const pr = j.permitRenew || j.permitRenewMock || {};
    const issued = String(
      pr.issuedDate || pr.gradedDate || extra.issuedDate || ""
    )
      .trim()
      .slice(0, 10);
    const graded = String(pr.gradedDate || issued || "").trim().slice(0, 10);
    // Levi: true expire = issue + 12 mo (printed exp field is false)
    const expires = permitTrueExpiresDate({
      issuedDate: issued,
      gradedDate: graded,
      expiresDate: pr.expiresDate || extra.expiresDate,
    });
    const due =
      j.openBalance != null && j.openBalance !== ""
        ? parseAmount(j.openBalance)
        : parseAmount(j.amount);
    // Paid = fully settled, or renew with any card pay ($1 test / full).
    const pays = Array.isArray(j.payments) ? j.payments : [];
    const anyPay = pays.some((p) => parseAmount(p?.amount) > 0.009);
    const phaseA = !!(pr.mock || pr.phase === "A" || pr.phase === 1);
    const realTest = !!(
      pr.realTest ||
      pr.phase === "real" ||
      pr.scenarioId === "schenectady-hackner" ||
      pr.scenarioId === "hampton-yossi" ||
      (pr.scenarioId && String(pr.scenarioId).startsWith("drive:"))
    );
    // Any permit-renew row with money → Paid + update-permit queue (Levi 2026-08-11)
    const renewJob = isPermitRenewPaymentJob(j) || phaseA || realTest || !!pr.scenarioId;
    const paid = !!(
      j.paid ||
      pr.paid ||
      (j.invoiceNo && due <= 0.01) ||
      pr.nextStep === "update_permit" ||
      (renewJob && anyPay)
    );
    const nextStep = String(
      pr.nextStep || (paid && renewJob ? "update_permit" : "")
    ).trim();
    const noticeSent = !!(pr.noticeSent || pr.emailSentAt || pr.noticeSentAt);
    const noticeOnly = !!(pr.noticeOnly || (pr.placeholderInvoiceNo && !pr.invoiceMaterialized));
    const invoiceMaterialized = !!(pr.invoiceMaterialized || (j.invoiceNo && !noticeOnly));
    const placeholderInvoiceNo = String(
      pr.placeholderInvoiceNo || (!invoiceMaterialized ? j.invoiceNo : "") || ""
    ).trim();
    let status = "Pending send";
    if (paid) status = nextStep === "update_permit" ? "Paid — update permit" : "Paid";
    else if (noticeSent && !invoiceMaterialized)
      status = "Notice sent · invoice on Renew";
    else if (noticeSent) status = "Notice sent · awaiting pay";
    else if (j.invoiceNo) status = "Pending send";
    else if (realTest) status = "Pending send";
    else if (phaseA) status = "Mock draft";
    const stageTone = expires ? permitRenewStatusTone(expires) : "upcoming";
    const customer = String(
      pr.displayCustomer || j.customer || j.personName || j.businessName || "—"
    ).trim();
    const businessName = String(
      pr.businessName || j.businessName || (customer !== String(j.businessName || "").trim() ? j.businessName : "") || ""
    ).trim();
    // Levi 2026-08-10: after notice email is sent, drop from "pending send" list
    // until fully paid — then it reappears under update-permit / Deploy queue.
    const pendingSend = !paid && !noticeSent;
    // Paid renews stay on Deploy list until renew is marked done
    const deployDone =
      String(pr.deployStatus || "").toLowerCase() === "done" ||
      !!pr.renewComplete ||
      !!pr.renewDeployedDone;
    const deployUpdate =
      paid && nextStep === "update_permit" && !deployDone;
    // Hide emailed-but-unpaid from both boxes (only returns when paid)
    if (!pendingSend && !deployUpdate && !paid) return;
    const sendHistory = Array.isArray(pr.sendHistory) ? pr.sendHistory : [];
    rows.push({
      id: j.id,
      jobId: j.id,
      address: String(
        j.serviceAddress || j.address || pr.address || extra.address || "—"
      ).trim(),
      customer,
      businessName: businessName && businessName !== customer ? businessName : "",
      permitNo: String(pr.permitNo || pr.filing || extra.permitNo || "").trim(),
      invoiceNo: invoiceMaterialized ? String(j.invoiceNo || "").trim() : "",
      placeholderInvoiceNo,
      fee: pr.fee != null ? parseAmount(pr.fee) : parseAmount(j.amount) || PERMIT_RENEW_FEE,
      issuedDate: issued,
      gradedDate: graded,
      expiresDate: expires,
      paid,
      status,
      nextStep,
      nextStepLabel:
        nextStep === "update_permit"
          ? "Payment received — on Deploy queue; press Deploy to start DOB renew"
          : "",
      paidAt: String(pr.paidAt || "").trim().slice(0, 10),
      paidAmount:
        pr.paidAmount != null
          ? parseAmount(pr.paidAmount)
          : paid
            ? parseAmount(j.amount) || PERMIT_RENEW_FEE
            : 0,
      deployStatus: String(pr.deployStatus || "").trim(),
      /** Expiration-driven notification stage (upcoming / soon / expired / near_abandon / abandoned). */
      stageTone,
      stageLabel: permitRenewStageLabel(stageTone),
      // Paid real-customer renews never look like tester mocks on Deploy (Levi 2026-08-11)
      mock: phaseA && !realTest && !paid,
      realTest: realTest || !!(paid && !isLeviTesterCustomer(customer)),
      email: String(j.email || pr.realEmail || "").trim(),
      noticeSent,
      noticeOnly,
      invoiceMaterialized,
      sendHistory,
      lastSentAt: pr.emailSentAt || pr.noticeSentAt || sendHistory[0]?.at || "",
      pendingSend,
      /** Paid renews go to Deploy queue for permit update (Levi 2026-08-10). */
      deployUpdate,
    });
  };

  for (const j of list) {
    if (isPermitRenewJob(j)) pushFromJob(j);
  }
  // Also surface jobs with renew schedule ON but no mock invoice yet
  for (const j of list) {
    if (seen.has(j?.id)) continue;
    const on =
      j?.paperwork?.dob?.renewSchedule?.on ||
      j?.paperwork?.city?.renewSchedule?.on ||
      false;
    if (!on) continue;
    pushFromJob(j, {
      address: j.serviceAddress || j.address,
      permitNo:
        j?.paperwork?.dob?.filingNumber ||
        j?.paperwork?.dob?.permitNumber ||
        j?.paperwork?.city?.filingNumber ||
        "",
    });
  }

  const rank = (r) => {
    // Paid-with-next-step first so staff sees "update permit" immediately
    if (r.paid && r.nextStep === "update_permit") return 0;
    if (r.status === "Invoice open") return 1;
    if (r.status === "Wants renew" || r.status === "Mock draft") return 2;
    if (r.paid || String(r.status || "").startsWith("Paid")) return 3;
    return 4;
  };
  rows.sort((a, b) => rank(a) - rank(b) || String(a.address).localeCompare(String(b.address)));
  return rows;
}

/** Find renew job for a ready scenario (open, sent, or paid). */
export function findRenewJobForScenario(jobs = [], scenarioId = "") {
  const want = String(scenarioId || "").trim();
  if (!want) return null;
  const list = Array.isArray(jobs) ? jobs : [];
  let best = null;
  for (const j of list) {
    if (!j || j._deleted) continue;
    if (!isPermitRenewJob(j)) continue;
    const pr = j.permitRenew || j.permitRenewMock || {};
    const sid = String(pr.scenarioId || "").trim();
    const addr = String(j.serviceAddress || j.address || pr.address || "").toLowerCase();
    const match =
      sid === want ||
      (want === "hampton-yossi" && /hampton/i.test(addr)) ||
      (want === "schenectady-hackner" && /schenectady/i.test(addr));
    if (!match) continue;
    if (!best) best = j;
    // Prefer unpaid open / latest notice job over old paid
    const prB = best.permitRenew || {};
    if (!j.paid && best.paid) best = j;
    else if (!pr.noticeSent && prB.noticeSent && !j.paid) best = j;
  }
  return best;
}

/**
 * Pending Send Email cards for Renewal Notifications.
 * Surfaces: (1) hard-ready scenarios (Hampton) + (2) Drive completed-permit
 * cache rows that are matched + have email + real permit #.
 * Levi 2026-08-10: never include 364 Schenectady (not our permit).
 */
/** True if a notice email was already sent for this scenario (job or local history). */
export function scenarioNoticeAlreadySent(jobs = [], scenarioId = "", extra = {}) {
  const want = String(scenarioId || "").trim();
  if (want) {
    const job = findRenewJobForScenario(jobs, want);
    if (job) {
      const pr = job.permitRenew || job.permitRenewMock || {};
      if (pr.noticeSent || pr.emailSentAt || pr.noticeSentAt) return true;
    }
  }
  try {
    const hist = loadLocalRenewSendHistory();
    const no = String(extra.permitNo || "")
      .trim()
      .toUpperCase();
    const addr = normalizeRenewAddrKey(extra.address || "");
    return hist.some((h) => {
      if (want && String(h.scenarioId || "").trim() === want) return true;
      const hNo = String(h.permitNo || "")
        .trim()
        .toUpperCase();
      if (no && hNo && hNo === no) return true;
      if (addr && no && hNo === no && normalizeRenewAddrKey(h.address) === addr) {
        return true;
      }
      return false;
    });
  } catch {
    return false;
  }
}

/**
 * Drive completed-permit rows ready for staff Send Email.
 *
 * Levi 2026-08-10/11 gates:
 *  - Only **Completed** folder (not Jose / Sima-CIMA / Full Detailed / Eli / Smith)
 *  - Only after DOB NOW shows **Renew application** (PAA → subsequent)
 *  - Levi Approve=Yes on workbook (or app) — DOB alone is not enough
 *  - Matched + email + real city permit #
 *  - Excludes 364 Schenectady and multi-match "ask Levi" rows
 */
/** In-session memo — rebuilding this list on every expand was laggy (Levi 2026-08-11). */
let _driveReadyMemo = null;
let _driveReadyMemoGen = -1;

export function listDriveReadyRenewScenarios() {
  ensurePermitCacheSeeded(READY_RENEW_SCENARIOS);
  // Invalidate when permit cache is written (tests + live upserts).
  const gen = getPermitCacheGeneration();
  if (_driveReadyMemo && _driveReadyMemoGen === gen) {
    return _driveReadyMemo;
  }
  const entries = loadPermitCache();
  const readyIds = new Set(READY_RENEW_SCENARIOS.map((s) => s.id));
  const readyPermitNos = new Set(
    READY_RENEW_SCENARIOS.map((s) => String(s.permitNo || "").trim().toUpperCase()).filter(
      Boolean
    )
  );
  const readyAddrs = new Set(
    READY_RENEW_SCENARIOS.map((s) => normalizeRenewAddrKey(s.address)).filter(Boolean)
  );
  const out = [];
  const seen = new Set();
  for (const e of entries) {
    if (!e || typeof e !== "object") continue;
    const address = String(e.address || "").trim();
    const permitNo = String(e.permitNo || "").trim();
    const email = String(e.email || "").trim();
    const sid = String(e.scenarioId || "").trim();
    if (!address || !email || !isRealCityPermitNo(permitNo)) continue;
    if (isExcludedRenewAddress(address)) continue;
    if (e.multiMatchNeedsConfirm) continue;
    if (e.matchedCustomer === false) continue;
    // Jose / Sima / other named folders never auto-notify from Drive seed
    if (!isDriveCompletedSource(e.source, e.sourceFolder)) continue;
    // Do not charge or notify until DOB NOW confirms Renew application
    if (!isDobRenewableForNotify(e)) continue;
    // Levi must Approve=Yes on Ready-to-notify before pending Send Email cards
    if (!isLeviApprovedForNotify(e)) continue;
    // Hard-ready scenarios are added separately with authoritative facts
    if (sid && readyIds.has(sid)) continue;
    const pKey = permitNo.toUpperCase();
    if (readyPermitNos.has(pKey)) continue;
    if (readyAddrs.has(normalizeRenewAddrKey(address))) continue;
    const dedupe = `${pKey}|${normalizeRenewAddrKey(address)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    // Stable send/history id — never reuse cache keys (p:… / sc:…)
    const id =
      sid && !/^(sc:|p:|a:|drive:)/i.test(sid) ? sid : `drive:${pKey}`;
    const sc = scenarioFromCacheEntry(
      { ...e, scenarioId: id },
      {
        id,
        fee: e.fee != null ? e.fee : PERMIT_RENEW_FEE,
        source: e.source || "drive:completed",
        sourceFolder: e.sourceFolder || "completed",
        dobRenewable: true,
        dobRenewCheckStatus: e.dobRenewCheckStatus || "renewable",
        leviApproveNotify: true,
        notifyEligible: true,
        real: true,
        realTest: true,
        matchedCustomer: true,
      }
    );
    out.push({ ...sc, id, scenarioId: id });
  }
  // Urgency: near_abandon → expired → soon → abandoned → upcoming
  const rank = (sc) => {
    const exp = permitTrueExpiresDate(sc);
    const tone = exp ? permitRenewStatusTone(exp) : "upcoming";
    return (
      { near_abandon: 0, expired: 1, soon: 2, abandoned: 3, upcoming: 4 }[tone] ?? 5
    );
  };
  out.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      String(a.address || "").localeCompare(String(b.address || ""))
  );
  _driveReadyMemo = out;
  _driveReadyMemoGen = gen;
  return out;
}

function cardFromReadyScenario(sc, jobs, apps) {
  if (!sc || sc.notOurPermit || sc.excludedFromReady) return null;
  if (isExcludedRenewAddress(sc.address)) return null;

  const scIssued = String(sc.issuedDate || "").trim().slice(0, 10);
  const scExpires = permitTrueExpiresDate({
    issuedDate: scIssued,
    expiresDate: sc.expiresDate,
  });

  const fillFromScenario = (row = {}) => {
    const issued =
      String(row.issuedDate || row.gradedDate || scIssued || "").trim().slice(0, 10) ||
      scIssued;
    // Levi: issue + 12 mo wins over any stored/printed expire
    const expires = permitTrueExpiresDate({
      issuedDate: issued,
      gradedDate: row.gradedDate,
      expiresDate: row.expiresDate || scExpires,
    });
    const stageTone = expires ? permitRenewStatusTone(expires) : "upcoming";
    return {
      ...row,
      scenarioId: sc.id,
      scenario: sc,
      customer: row.customer || sc.displayCustomer,
      businessName: row.businessName || sc.businessName || "",
      address: row.address || sc.address,
      permitNo: String(row.permitNo || sc.permitNo || "").trim(),
      issuedDate: issued,
      gradedDate: row.gradedDate || issued,
      expiresDate: expires,
      fee: row.fee != null ? row.fee : renewFeeFromScenario(sc),
      email: row.email || sc.realEmail || "",
      stageTone: stageTone,
      stageLabel: permitRenewStageLabel(stageTone),
    };
  };

  const job = findRenewJobForScenario(jobs, sc.id);
  if (job) {
    const row = apps.find((r) => r.id === job.id);
    if (row?.pendingSend) {
      return fillFromScenario({
        ...row,
        email: row.email || sc.realEmail || "",
      });
    }
    if (row?.deployUpdate || row?.paid) return null;
    const pr = job.permitRenew || {};
    if (pr.noticeSent || pr.emailSentAt) return null;
  }
  if (
    scenarioNoticeAlreadySent(jobs, sc.id, {
      permitNo: sc.permitNo,
      address: sc.address,
    })
  ) {
    return null;
  }
  return fillFromScenario({
    id: job?.id || `ready-${sc.id}`,
    jobId: job?.id || "",
    status: job?.invoiceNo ? "Pending send" : "Ready",
    pendingSend: true,
    paid: false,
    deployUpdate: false,
    noticeSent: false,
    invoiceNo: String(job?.invoiceNo || "").trim(),
    mock: false,
    realTest: true,
    email: String(job?.email || sc.realEmail || "").trim(),
  });
}

export function listPendingRenewCards(jobs = []) {
  const apps = listRenewApplications(jobs);
  const cards = [];
  const seenKeys = new Set();

  const pushCard = (card) => {
    if (!card) return;
    if (isExcludedRenewAddress(card.address)) return;
    const key =
      `${String(card.permitNo || "").trim().toUpperCase()}|` +
      normalizeRenewAddrKey(card.address);
    if (seenKeys.has(key) && key !== "|") return;
    if (key !== "|") seenKeys.add(key);
    cards.push(card);
  };

  for (const sc of READY_RENEW_SCENARIOS) {
    pushCard(cardFromReadyScenario(sc, jobs, apps));
  }
  for (const sc of listDriveReadyRenewScenarios()) {
    pushCard(cardFromReadyScenario(sc, jobs, apps));
  }
  // Row identity must be unique — the UI expands rows by id, so a repeated id
  // (same permit # cached at two address spellings, cache re-upserts) makes
  // every matching row expand together: tap one → all look selected.
  const seenIds = new Map();
  for (const card of cards) {
    const base = String(card.id || "").trim() || `renew-${seenIds.size}`;
    const n = (seenIds.get(base) || 0) + 1;
    seenIds.set(base, n);
    card.id = n > 1 ? `${base}#${n}` : base;
  }
  return cards;
}

/**
 * Paid renews ready for Deploy → update permit.
 * One row per permit/address (Levi 2026-08-11) — LE-2701 mock + LE-2702 real
 * for the same Hampton permit must not double on Deploy / Renewal.
 */
export function listPaidUpdatePermitCards(jobs = []) {
  const paid = listRenewApplications(jobs).filter(
    (r) => r.deployUpdate || (r.paid && r.nextStep === "update_permit")
  );
  const byKey = new Map();
  const rank = (r) => {
    let n = 0;
    if (r.realTest) n += 40;
    if (!r.mock) n += 20;
    if (r.invoiceNo) n += 5;
    if (r.paidAt) n += 2;
    // Prefer full fee over $1/$2 test charges
    const amt = Number(r.paidAmount || r.fee || 0);
    if (amt >= 100) n += 10;
    else if (amt > 0) n += 1;
    // Prefer non-tester display name
    const cust = String(r.customer || "").toLowerCase();
    if (cust && !/levi\s*tester|tester/.test(cust)) n += 15;
    return n;
  };
  for (const r of paid) {
    const key =
      `${String(r.permitNo || "").trim().toUpperCase()}|` +
      normalizeRenewAddrKey(r.address);
    const prev = byKey.get(key);
    if (!prev || rank(r) > rank(prev)) byKey.set(key, r);
  }
  return [...byKey.values()];
}

/**
 * True when this job is a permit-renew invoice (notice, mock, or real).
 * Used by payment paths to stamp Paid + queue update_permit.
 */
export function isPermitRenewPaymentJob(job = {}) {
  if (!job || typeof job !== "object") return false;
  const pr = job.permitRenew || job.permitRenewMock || {};
  if (
    pr.mock ||
    pr.realTest ||
    pr.noticeOnly ||
    pr.scenarioId ||
    pr.placeholderInvoiceNo ||
    pr.cta ||
    pr.phase === "A" ||
    pr.phase === "real" ||
    pr.phase === 1 ||
    pr.nextStep === "update_permit"
  ) {
    return true;
  }
  const title = String(job.title || "").toLowerCase();
  return title.includes("permit renew") || title.includes("permit renewal");
}

/**
 * Patch after money lands on a renew invoice — Paid + queue to update the permit.
 * Pure data; caller patchAndSave / host overlay.
 */
export function buildPermitRenewPaidPatch(job, { amount, date, ref } = {}) {
  const pr = (job && (job.permitRenew || job.permitRenewMock)) || {};
  const paidAt = String(date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const paidAmount =
    amount != null && amount !== ""
      ? parseAmount(amount)
      : pr.paidAmount != null
        ? parseAmount(pr.paidAmount)
        : parseAmount(job?.amount) || PERMIT_RENEW_FEE;
  // Always resurrect if mock-cleanup soft-deleted before pay landed (LE-2702).
  // Without this, paid + update_permit sits on a deleted overlay row → Deploy empty.
  return {
    paid: true,
    openBalance: 0,
    excludeFromBalanceDue: false,
    _balanceExempt: false,
    _deleted: false,
    _archived: false,
    deletedAt: "",
    status: {
      Paid: { s: "done", d: paidAt },
      "Follow-up": { s: "done", d: paidAt },
    },
    permitRenew: {
      ...pr,
      provisional: false,
      excludeFromBalanceDue: false,
      dismissed: false,
      paid: true,
      paidAt,
      paidAmount,
      paidRef: ref != null ? String(ref) : pr.paidRef || "",
      nextStep: pr.nextStep || "update_permit",
      queueUpdatePermit: true,
      deployUpdate: true,
    },
  };
}

/**
 * True when a soft-deleted overlay row is a paid city-permit renew that must
 * stay on the board / Deploy list (payment landed after leftover cleanup).
 * Pure data — used by mergeJobs so Deploy never goes empty for paid renews.
 */
export function isPaidPermitRenewKeepVisible(jobOrOverlay = {}) {
  if (!jobOrOverlay || typeof jobOrOverlay !== "object") return false;
  const pr = jobOrOverlay.permitRenew || jobOrOverlay.permitRenewMock || {};
  const title = String(jobOrOverlay.title || "").toLowerCase();
  const isRenew =
    !!(
      pr.mock ||
      pr.realTest ||
      pr.noticeOnly ||
      pr.scenarioId ||
      pr.placeholderInvoiceNo ||
      pr.cta ||
      pr.provisional ||
      pr.invoiceMaterialized ||
      pr.phase === "A" ||
      pr.phase === "real" ||
      pr.phase === 1 ||
      pr.nextStep === "update_permit" ||
      pr.queueUpdatePermit ||
      pr.deployUpdate ||
      pr.paid
    ) ||
    title.includes("permit renew") ||
    title.includes("permit renewal");
  if (!isRenew) return false;
  if (jobOrOverlay.paid || pr.paid) return true;
  if (pr.nextStep === "update_permit" || pr.queueUpdatePermit || pr.deployUpdate) {
    return true;
  }
  const pays = Array.isArray(jobOrOverlay.payments) ? jobOrOverlay.payments : [];
  return pays.some((p) => parseAmount(p?.amount) > 0.009);
}

/**
 * Plain Telegram / bubble line when a customer pays for permit renew.
 * Who + address + permit # so Levi knows who to renew with.
 */
export function formatPermitRenewPaidNotify(job = {}, { amount } = {}) {
  const pr = job.permitRenew || job.permitRenewMock || {};
  const customer = String(
    pr.displayCustomer || job.customer || job.personName || job.businessName || "Customer"
  ).trim();
  const address = String(
    pr.address || job.serviceAddress || job.address || "—"
  ).trim();
  const permitNo = String(pr.permitNo || "").trim();
  const inv = String(job.invoiceNo || pr.placeholderInvoiceNo || "").trim();
  const amt =
    amount != null && amount !== ""
      ? parseAmount(amount)
      : pr.paidAmount != null
        ? parseAmount(pr.paidAmount)
        : parseAmount(job.amount) || PERMIT_RENEW_FEE;
  const feeStr = amt.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
  const lines = [
    "💵 Customer paid — permit renew",
    `${customer} · ${address}`,
  ];
  if (permitNo) lines.push(`Permit ${permitNo}`);
  if (inv) lines.push(`Invoice ${inv} · ${feeStr}`);
  else lines.push(feeStr);
  lines.push(
    "On Permits → Deploy list. Press Deploy to start the DOB renew (improves with practice)."
  );
  return lines.join("\n");
}

/**
 * Patch when staff presses Deploy on a paid renew row.
 * Stamps deploying so the queue shows Deploying… and host/Israel start DOB.
 */
export function buildPermitRenewDeployStartPatch(job = {}, { note } = {}) {
  const pr = (job && (job.permitRenew || job.permitRenewMock)) || {};
  const now = new Date().toISOString();
  return {
    permitRenew: {
      ...pr,
      nextStep: pr.nextStep || "update_permit",
      queueUpdatePermit: true,
      deployStatus: "deploying",
      deployError: "",
      deployStartedAt: now,
      deployNote: note != null ? String(note) : pr.deployNote || "",
    },
  };
}

/**
 * Payload for command bus permit_renew_update (host → Israel DOB renew).
 */
export function buildPermitRenewDeployPayload(job = {}, item = {}) {
  const pr = (job && (job.permitRenew || job.permitRenewMock)) || {};
  const card = item?.renewCard || item?.card || {};
  return {
    skill: "dob_renew_work_permit",
    version: 1,
    kind: "permit_renew",
    jobId: String(job?.id || item?.jobId || "").trim(),
    customer: String(
      card.customer ||
        pr.displayCustomer ||
        job?.customer ||
        job?.personName ||
        job?.businessName ||
        ""
    ).trim(),
    address: String(
      card.address || pr.address || job?.serviceAddress || job?.address || ""
    ).trim(),
    permitNo: String(card.permitNo || pr.permitNo || pr.filing || "").trim(),
    invoiceNo: String(
      card.invoiceNo || job?.invoiceNo || pr.placeholderInvoiceNo || ""
    ).trim(),
    fee:
      card.fee != null
        ? Number(card.fee)
        : pr.paidAmount != null
          ? Number(pr.paidAmount)
          : pr.fee != null
            ? Number(pr.fee)
            : Number(job?.amount) || PERMIT_RENEW_FEE,
    paidAt: String(card.paidAt || pr.paidAt || "").slice(0, 10),
    expiresDate: String(card.expiresDate || pr.expiresDate || "").slice(0, 10),
    issuedDate: String(pr.issuedDate || pr.gradedDate || "").slice(0, 10),
    stopAt: "review",
    autoSubmit: false,
    improveWithExperience: true,
  };
}

/**
 * Public entry for the email "Renew Permit" button.
 * Query survives redirects; main.jsx bootstraps it to a public pay landing
 * (no staff login) and marks that the invoice is generated on that tap.
 */
export const PHASE_A_RENEW_CTA_URL =
  "https://leelectrical.us/app/pro/?renewCta=phaseA";

/**
 * Staff notice email CTA — invoice is NOT created until the customer taps
 * Renew Permit (Levi 2026-08-10). Placeholder inv is reserved only.
 * @param {{ scenarioId?: string, invoiceNo?: string, origin?: string }} opts
 */
export function buildRenewNoticeCtaUrl({
  scenarioId = "",
  invoiceNo = "",
  origin = "https://leelectrical.us",
} = {}) {
  const base = String(origin || "https://leelectrical.us").replace(/\/$/, "");
  const u = new URL(`${base}/app/pro/`);
  u.searchParams.set("renewCta", "phaseA");
  const sid = String(scenarioId || "").trim();
  const inv = String(invoiceNo || "").trim();
  if (sid) u.searchParams.set("scenario", sid);
  if (inv) u.searchParams.set("inv", inv);
  return u.toString();
}

/** Resolve ready scenario by id (CTA query / history). */
export function renewScenarioById(scenarioId = "") {
  const want = String(scenarioId || "").trim();
  if (!want) return RENEW_HAMPTON_SCENARIO;
  const ready = READY_RENEW_SCENARIOS.find((s) => s.id === want);
  if (ready) return ready;
  if (want === "hampton-yossi" || /^hampton/i.test(want)) return RENEW_HAMPTON_SCENARIO;
  // Legacy history only — not in ready list
  if (want === "schenectady-hackner" || /schenectady/i.test(want)) {
    return RENEW_HACKNER_SCENARIO;
  }
  try {
    const driveHit = listDriveReadyRenewScenarios().find((s) => s.id === want);
    if (driveHit) return driveHit;
    const entry =
      getPermitCacheEntry({ scenarioId: want }) ||
      (want.startsWith("drive:")
        ? getPermitCacheEntry({ permitNo: want.slice(6) })
        : getPermitCacheEntry({ permitNo: want }));
    if (entry && !isExcludedRenewAddress(entry.address)) {
      return scenarioFromCacheEntry(entry, {
        id: entry.scenarioId || entry.id || want,
        fee: PERMIT_RENEW_FEE,
        real: true,
        realTest: true,
      });
    }
  } catch {
    /* ignore */
  }
  // Unknown id (aged out of the cache) → null, NEVER the Hampton fallback —
  // a resend/CTA must not silently prefill another customer's permit.
  return null;
}

/**
 * Pay-landing payload for Phase A CTA — customer sees the renew invoice when
 * they press Renew Permit. Does not require a saved job (generated on tap).
 */
export function buildPhaseACtaPayPayload({
  scenario = PHASE_A_HAMPTON_SCENARIO,
  fee,
  invoiceNo = "",
  siteSlug = "blzelectric",
} = {}) {
  const sc = scenario || PHASE_A_HAMPTON_SCENARIO;
  const amount = fee != null ? parseAmount(fee) || PERMIT_RENEW_FEE : renewFeeFromScenario(sc);
  // Use reserved placeholder from the notice email when present
  const inv =
    String(invoiceNo || "").trim() ||
    `LE-RENEW-${String(sc.permitNo || "mock").replace(/[^A-Za-z0-9]/g, "").slice(0, 10)}`;
  if (String(invoiceNo || "").trim()) {
    try {
      markPlaceholderMaterialized(invoiceNo);
    } catch {
      /* ignore */
    }
  }
  const person = String(sc.displayCustomer || "").trim() || "Customer";
  const addr = String(sc.address || "").trim();
  const isReal = !!(sc.realTest || sc.real);
  const email = isReal
    ? String(sc.realEmail || "").trim() || LEVI_TESTER.email
    : LEVI_TESTER.email;
  const phone = String(sc.phone || "").trim();
  const billTo = buildPermitRenewBillingAddress({
    billingAddress: sc.billingAddress || "",
    mailAddress: sc.mailAddress || "",
    email,
    phone,
    serviceAddress: addr,
  });
  const lines = buildPermitRenewInvoiceLines({
    fee: amount,
    address: addr,
    permitNo: sc.permitNo,
  });
  const feeStr = amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
  return {
    j: "",
    i: inv,
    a: amount,
    fe: 1,
    c: person,
    // Three-line work block matches line description (Levi 2026-08-10)
    w: String(lines[0]?.description || "").trim() || `City electrical permit renewal\nService location: ${addr}`,
    t: feeStr,
    d: feeStr,
    p: "",
    ps: [],
    e: email,
    ph: phone,
    sa: addr,
    // Full billing contact — never the service street alone (Levi 2026-08-10)
    ba: billTo,
    z: "",
    sl: siteSlug,
    pay: "",
    as: new Date().toISOString().slice(0, 10),
    k: "i",
    lines,
    // Marker so PayLanding / staff can recognize a renew-generated invoice
    renewCta: "phaseA",
    renewScenarioId: sc.id || "hampton-yossi",
    /** Show "Loading invoice" briefly on public pay (customer just tapped Renew). */
    renewLoading: true,
    permitRenew: {
      cta: true,
      fullPayOnly: true,
      phase: isReal ? "real" : "A",
      invoiceMaterialized: true,
      placeholderInvoiceNo: inv,
      scenarioId: sc.id || "hampton-yossi",
      permitNo: sc.permitNo,
      address: addr,
    },
    // One amount only — pay page shows invoice total (Levi 2026-08-10)
    fo: 1,
    fullPayOnly: true,
  };
}

/**
 * Customer renew notice (Phase A) — branded shell + Levi draft (2026-08-10).
 *
 * Rules:
 * - Call it **Permit** only (not Application / issue number)
 * - Service address is site; never bill-to street
 * - Status sentence + subject auto-switch by today vs expiration
 * - Abandoned = expiration + 12 months; ~$2,300 plus filing fees savings
 * - CTA: Renew Permit → payment link
 */
export function buildPermitRenewEmail({
  scenario = PHASE_A_HAMPTON_SCENARIO,
  fee,
  payUrl = "",
  invoiceNo = "",
  /**
   * Notice email only — placeholder invoice # may be shown, but no real
   * invoice job was created (materializes when customer taps Renew).
   */
  noticeOnly = false,
  /** Override "today" for tests (YYYY-MM-DD). */
  todayIso = "",
} = {}) {
  const sc = scenario || PHASE_A_HAMPTON_SCENARIO;
  const amount = fee != null ? parseAmount(fee) || PERMIT_RENEW_FEE : renewFeeFromScenario(sc);
  const feeStr = amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
  const inv = String(invoiceNo || "").trim();
  const invLabel = inv ? (inv.startsWith("#") ? inv : `#${inv}`) : "";
  const company = brand();
  const profile = activeTenantConfig().profile || {};
  const greeting = sc.greetingName || sc.displayCustomer || "there";
  const issuedIso = String(sc.issuedDate || "").trim().slice(0, 10);
  // Levi: true expire = issue + 12 months (printed expire is false)
  const expiresIso = permitTrueExpiresDate({
    issuedDate: issuedIso,
    expiresDate: sc.expiresDate,
  });
  const issuedUs = formatPermitDateUs(issuedIso);
  const expiresUs = formatPermitDateUs(expiresIso);
  const abandonedIso = permitAbandonedFromExpires(expiresIso);
  const abandonedUs = formatPermitDateUs(abandonedIso);
  const renewByIso = permitRenewByDate(expiresIso, { todayIso });
  const renewByUs = formatPermitDateUs(renewByIso);
  const tone = permitRenewStatusTone(expiresIso, { todayIso });
  const pastExpire =
    tone === "expired" || tone === "near_abandon" || tone === "abandoned";
  const isAbandoned = tone === "abandoned";
  const isNearAbandon = tone === "near_abandon";
  const statusLine = permitRenewStatusSentence(
    sc.address,
    expiresUs,
    tone,
    abandonedUs
  );
  const website = profile.website || "";
  const phone = profile.phone || "(718) 594-1850";
  const fromEmail = profile.email || "Office@LeElectrical.us";
  const signer = profile.ownerName || profile.contactName || "Levi Kumer, President";
  const lic = profile.licenseNo || profile.license || "11212";
  const companyLong = profile.legalName || profile.name || company;
  const ctaLabel = isAbandoned ? "Apply for new permit" : "Renew Permit";

  const subject = isAbandoned
    ? `Your electrical permit is abandoned — apply for a new one — ${sc.address}`
    : isNearAbandon
      ? `Your electrical permit is about to be abandoned — ${sc.address} (renew now)`
      : tone === "expired"
        ? `Your electrical permit has expired — ${sc.address} (renew before it's abandoned)`
        : tone === "soon"
          ? `Your electrical permit expires soon — ${sc.address}`
          : `Time to renew your electrical permit — ${sc.address}`;

  const detailsHeader = isAbandoned
    ? "Here are the details for your abandoned electrical permit — a new application is required:"
    : isNearAbandon
      ? "Here are the details for your electrical permit — abandoned status is approaching:"
      : pastExpire
        ? "Here are the details for your expired electrical permit:"
        : "Here are the details for your upcoming permit renewal:";

  const issuedLabel = "Issued";
  const expLabel = pastExpire ? "Expired" : "Expires";

  const abandonBlock = isAbandoned
    ? `The city has marked this permit "abandoned"` +
      (abandonedUs ? ` as of ${abandonedUs}` : " (12 months after expiration)") +
      `. A straight renewal is no longer available — reinstating means filing a brand-new permit, which typically costs $2,300 plus filing fees. Reply or tap below and we'll help you apply for a new permit.`
    : isNearAbandon
      ? `The city marks a permit "abandoned" 12 months after it expires` +
        (abandonedUs ? ` (that date is ${abandonedUs})` : "") +
        `. Once abandoned, reinstating means filing a brand-new permit — typically $2,300 plus filing fees. Act now so you do not have to re-apply from scratch.`
      : pastExpire
        ? `Once a permit stays unrenewed for 12 months after it expires, the city marks it "abandoned." Reinstating an abandoned permit means filing a brand-new one — which typically costs $2,300 plus filing fees. Renewing now avoids that cost and keeps your work on record.`
        : `If a permit lapses and stays unrenewed for 12 months, the city marks it "abandoned," and reinstating it means filing a brand-new permit — which typically costs $2,300 plus filing fees. Renewing now avoids that entirely.`;

  const payBlock = isAbandoned
    ? inv
      ? noticeOnly
        ? `Reference ${invLabel} is reserved for you — click ${ctaLabel} below when you're ready and we'll open the invoice then.`
        : `Invoice ${invLabel} is ready if you want us to start the new filing — click ${ctaLabel} below and we'll take it from there.`
      : `Click ${ctaLabel} below and we'll help you file a brand-new permit application.`
    : inv
      ? noticeOnly
        ? pastExpire
          ? `Reference ${invLabel} is reserved — click Renew Permit below when you're ready to pay (invoice opens then), and we'll handle the city filing. To stay ahead of the abandoned deadline (${abandonedUs || "12 months after expire"}), please renew by ${renewByUs || "soon"}.`
          : `Reference ${invLabel} is reserved — click Renew Permit below when you're ready to pay (invoice opens then), and we'll handle the city filing. Please renew by ${renewByUs || expiresUs} to keep everything current.`
        : pastExpire
          ? `Invoice ${invLabel} is ready — click Renew Permit below to pay, and we'll handle the city filing for you. To stay safely ahead of the abandoned deadline (${abandonedUs || "12 months after expire"}), please renew by ${renewByUs || "soon"}.`
          : `Invoice ${invLabel} is ready — click Renew Permit below to pay, and we'll handle the city filing for you. Please renew by ${renewByUs || expiresUs} to keep everything current.`
      : "Click Renew Permit below to open the payment page, and we'll handle the city filing for you.";

  // Light HTML emphasis on key facts (addresses/dates/fees already bold in table rows)
  const statusLineHtml = (() => {
    const addr = escHtml(sc.address || "this address");
    const exp = escHtml(expiresUs || "the expiration date");
    const abd = escHtml(abandonedUs || "");
    if (tone === "abandoned") {
      return (
        `Your electrical permit at <strong>${addr}</strong> expired on <strong>${exp}</strong>` +
        (abd
          ? ` and is now abandoned (as of <strong>${abd}</strong>)`
          : " and is now abandoned") +
        `. It can no longer be renewed — you need to apply for a brand-new permit.`
      );
    }
    if (tone === "near_abandon") {
      return (
        `Your electrical permit at <strong>${addr}</strong> expired on <strong>${exp}</strong>` +
        (abd
          ? ` and is about to go into abandoned status on <strong>${abd}</strong>`
          : " and is about to go into abandoned status") +
        `. Renew now — once abandoned, reinstating means filing a brand-new permit.`
      );
    }
    if (tone === "expired") {
      return `Your electrical permit at <strong>${addr}</strong> expired on <strong>${exp}</strong>. It can still be renewed now, but the 12-month abandoned clock has started.`;
    }
    if (tone === "soon") {
      return `Your electrical permit at <strong>${addr}</strong> expires soon, on <strong>${exp}</strong> — renewing now keeps it active.`;
    }
    return `Your electrical permit at <strong>${addr}</strong> is coming up for renewal — it expires on <strong>${exp}</strong>. Renewing on time keeps it active and continuous, with no re-inspection or refiling needed.`;
  })();
  const abandonBlockHtml = isAbandoned
    ? `The city has marked this permit <strong>&quot;abandoned&quot;</strong>` +
      (abandonedUs
        ? ` as of <strong>${escHtml(abandonedUs)}</strong>`
        : " (12 months after expiration)") +
      `. A straight renewal is no longer available — reinstating means filing a brand-new permit, which typically costs <strong>$2,300 plus filing fees</strong>. Reply or tap below and we&rsquo;ll help you apply for a new permit.`
    : isNearAbandon
      ? `The city marks a permit <strong>&quot;abandoned&quot;</strong> 12 months after it expires` +
        (abandonedUs ? ` (that date is <strong>${escHtml(abandonedUs)}</strong>)` : "") +
        `. Once abandoned, reinstating means filing a brand-new permit — typically <strong>$2,300 plus filing fees</strong>. Act now so you do not have to re-apply from scratch.`
      : pastExpire
        ? `Once a permit stays unrenewed for <strong>12 months</strong> after it expires, the city marks it <strong>&quot;abandoned.&quot;</strong> Reinstating an abandoned permit means filing a brand-new one — which typically costs <strong>$2,300 plus filing fees</strong>. Renewing now avoids that cost and keeps your work on record.`
        : `If a permit lapses and stays unrenewed for <strong>12 months</strong>, the city marks it <strong>&quot;abandoned,&quot;</strong> and reinstating it means filing a brand-new permit — which typically costs <strong>$2,300 plus filing fees</strong>. Renewing now avoids that entirely.`;
  const payBlockHtml = isAbandoned
    ? inv
      ? noticeOnly
        ? `Reference <strong>${escHtml(invLabel)}</strong> is reserved for you — click <strong>${escHtml(
            ctaLabel
          )}</strong> below when you&rsquo;re ready and we&rsquo;ll open the invoice then.`
        : `Invoice <strong>${escHtml(invLabel)}</strong> is ready if you want us to start the new filing — click <strong>${escHtml(
            ctaLabel
          )}</strong> below and we&rsquo;ll take it from there.`
      : `Click <strong>${escHtml(ctaLabel)}</strong> below and we&rsquo;ll help you file a brand-new permit application.`
    : inv
      ? noticeOnly
        ? pastExpire
          ? `Reference <strong>${escHtml(invLabel)}</strong> is reserved — click <strong>Renew Permit</strong> below when you&rsquo;re ready to pay (invoice opens then), and we&rsquo;ll handle the city filing. To stay ahead of the abandoned deadline (${escHtml(
              abandonedUs || "12 months after expire"
            )}), please renew by <strong>${escHtml(renewByUs || "soon")}</strong>.`
          : `Reference <strong>${escHtml(invLabel)}</strong> is reserved — click <strong>Renew Permit</strong> below when you&rsquo;re ready to pay (invoice opens then), and we&rsquo;ll handle the city filing. Please renew by <strong>${escHtml(
              renewByUs || expiresUs
            )}</strong> to keep everything current.`
        : pastExpire
          ? `Invoice <strong>${escHtml(invLabel)}</strong> is ready — click <strong>Renew Permit</strong> below to pay, and we&rsquo;ll handle the city filing for you. To stay safely ahead of the abandoned deadline (${escHtml(
              abandonedUs || "12 months after expire"
            )}), please renew by <strong>${escHtml(renewByUs || "soon")}</strong>.`
          : `Invoice <strong>${escHtml(invLabel)}</strong> is ready — click <strong>Renew Permit</strong> below to pay, and we&rsquo;ll handle the city filing for you. Please renew by <strong>${escHtml(
              renewByUs || expiresUs
            )}</strong> to keep everything current.`
      : `Click <strong>Renew Permit</strong> below to open the payment page, and we&rsquo;ll handle the city filing for you.`;

  const lines = [
    `Hi ${greeting},`,
    "",
    detailsHeader,
    "",
    `Address: ${sc.address}`,
    `Permit number: ${sc.permitNo}`,
    issuedUs ? `${issuedLabel}: ${issuedUs}` : null,
    expiresUs ? `${expLabel}: ${expiresUs}` : null,
    `Renewal fee: ${feeStr}`,
    invLabel ? (noticeOnly ? `Reference: ${invLabel}` : `Invoice: ${invLabel}`) : null,
    "",
    statusLine,
    "",
    abandonBlock,
    "",
    payBlock,
    "",
    "Questions? Just reply to this email or call us anytime.",
    "",
    "Thank you,",
    signer,
    `${companyLong} · Lic #${lic}`,
    `${phone} · ${fromEmail}`,
    website || null,
  ].filter((ln) => ln != null);

  const row = (label, value, strong = true) => {
    if (!value) return "";
    const v = strong
      ? `<strong style="font-weight:700;color:#0f172a">${escHtml(value)}</strong>`
      : escHtml(value);
    return (
      `<tr>` +
      `<td style="padding:4px 14px 4px 0;vertical-align:top;color:#64748b;font-size:14px;width:42%">${escHtml(
        label
      )}</td>` +
      `<td style="padding:4px 0;vertical-align:top;font-size:14px;color:#0f172a">${v}</td>` +
      `</tr>`
    );
  };

  const htmlBody =
    `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">Hi ${escHtml(
      greeting
    )},</p>` +
    `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">${escHtml(
      detailsHeader
    )}</p>` +
    `<table style="border-collapse:collapse;width:100%;max-width:560px;margin:0 0 16px;font-family:Arial,Helvetica,sans-serif">` +
    row("Address", sc.address) +
    row("Permit number", sc.permitNo) +
    (issuedUs ? row(issuedLabel, issuedUs) : "") +
    (expiresUs ? row(expLabel, expiresUs) : "") +
    row("Renewal fee", feeStr) +
    (invLabel ? row(noticeOnly ? "Reference" : "Invoice", invLabel) : "") +
    `</table>` +
    `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0f172a">${statusLineHtml}</p>` +
    `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0f172a">${abandonBlockHtml}</p>` +
    `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0f172a">${payBlockHtml}</p>` +
    `<p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0f172a">Questions? Just reply to this email or call us anytime.</p>`;

  const defaultTo = sc.realTest
    ? String(sc.realEmail || "").trim() || LEVI_TESTER.email
    : LEVI_TESTER.email;
  // Default CTA: renew notice link (invoice materializes on tap)
  const defaultCta = buildRenewNoticeCtaUrl({
    scenarioId: sc.id || "hampton-yossi",
    invoiceNo: inv,
  });
  return {
    subject,
    body: lines.join("\n"),
    htmlBody,
    to: defaultTo,
    ctaLabel,
    ctaUrl: String(payUrl || defaultCta || PHASE_A_RENEW_CTA_URL).trim() || PHASE_A_RENEW_CTA_URL,
    fee: amount,
    tone,
    stageLabel: permitRenewStageLabel(tone),
    expiresDate: expiresIso,
    abandonedDate: abandonedIso,
    renewByDate: renewByIso,
    realTest: !!sc.realTest,
    noticeOnly: !!noticeOnly,
    placeholderInvoiceNo: inv,
  };
}

/** mailto: for Phase A mock (system mail — never auto-fires to real customer). */
export function buildPermitRenewMailto({ to, subject, body }) {
  const gate = assertPhaseARecipient(to);
  if (!gate.ok) return { ok: false, error: gate.error, href: "" };
  const href =
    `mailto:${encodeURIComponent(gate.email)}` +
    `?subject=${encodeURIComponent(subject || "")}` +
    `&body=${encodeURIComponent(body || "")}`;
  return { ok: true, href, email: gate.email };
}

/**
 * Build View & Pay URL for the renew invoice (regular invoice pay page).
 * Prefers short link; falls back to long embedded token.
 */
export async function buildPermitRenewPayUrl(job, { fee, siteSlug = "blzelectric" } = {}) {
  if (!job?.invoiceNo) throw new Error("Renew invoice needs an invoice number");
  const due =
    job.openBalance != null && job.openBalance !== ""
      ? parseAmount(job.openBalance)
      : parseAmount(job.amount) || fee || PERMIT_RENEW_FEE;
  // Always full remaining balance — no partial renew pay (Levi 2026-08-10).
  const linkAmount = due > 0 ? due : fee || PERMIT_RENEW_FEE;
  const opts = {
    job: {
      ...job,
      permitRenew: {
        ...(job.permitRenew || {}),
        fullPayOnly: true,
      },
    },
    linkAmount,
    inv: job.invoiceNo,
    siteSlug,
    includeFee: true,
  };
  try {
    return await buildShortPayLandingUrl(opts);
  } catch {
    return buildPayLandingUrl(opts);
  }
}

/**
 * Orchestrate Phase A: ensure mock invoice job fields are ready.
 * Caller creates/patches the job via store; this only builds pure data.
 * Prefer prepareRenewNotice for staff email (no real invoice until Renew).
 */
export function preparePhaseAMock({
  jobs,
  scenario = PHASE_A_HAMPTON_SCENARIO,
  fee,
  noticeOnly = false,
} = {}) {
  const sc = scenario || PHASE_A_HAMPTON_SCENARIO;
  try {
    ensurePermitCacheSeeded(READY_RENEW_SCENARIOS);
  } catch {
    /* ignore */
  }
  const existing = findOpenMockRenewJob(jobs, {
    scenarioId: sc.id,
    allowNoticeOnly: true,
  });
  if (existing) {
    const pr = existing.permitRenew || {};
    const placeholder = String(
      pr.placeholderInvoiceNo || existing.invoiceNo || ""
    ).trim();
    const amt =
      pr.fee != null
        ? parseAmount(pr.fee)
        : parseAmount(existing.amount) || renewFeeFromScenario(sc);
    return {
      reuse: true,
      job: existing,
      fields: null,
      meta: null,
      fee: amt,
      scenario: sc,
      noticeOnly: !!(pr.noticeOnly || !pr.invoiceMaterialized),
      placeholderInvoiceNo: placeholder,
    };
  }
  const fields = buildPermitRenewJobFields({
    jobs,
    scenario: sc,
    fee,
    noticeOnly,
  });
  const amount =
    fee != null ? parseAmount(fee) || PERMIT_RENEW_FEE : renewFeeFromScenario(sc);
  const placeholder = String(fields._placeholderInvoiceNo || fields.invoiceNo || "").trim();
  const meta = buildPermitRenewMetaPatch(sc, amount, {
    noticeOnly,
    placeholderInvoiceNo: placeholder,
  });
  const { _placeholderInvoiceNo, ...cleanFields } = fields;
  void _placeholderInvoiceNo;
  return {
    reuse: false,
    job: null,
    fields: cleanFields,
    meta,
    fee: amount,
    scenario: sc,
    noticeOnly: !!noticeOnly,
    placeholderInvoiceNo: placeholder,
  };
}

/**
 * Staff "Send Email" path — reserve placeholder, no real invoice.
 * Pure data — caller createJob / patchAndSave.
 */
export function prepareRenewNotice({ jobs, scenario, fee } = {}) {
  return preparePhaseAMock({
    jobs,
    scenario: scenario || RENEW_HAMPTON_SCENARIO,
    fee,
    noticeOnly: true,
  });
}

/**
 * Ensure a renew notice row exists for a scenario (creates service address via job).
 * Pure data — caller createJob / patchAndSave.
 * Defaults to notice-only (Levi 2026-08-10 — invoice only on Renew tap).
 */
export function prepareRenewScenario({ jobs, scenario, fee, noticeOnly = true } = {}) {
  return preparePhaseAMock({
    jobs,
    scenario: scenario || RENEW_HACKNER_SCENARIO,
    fee,
    noticeOnly,
  });
}

/**
 * Patch that turns a notice-only row into a real open invoice
 * (customer tapped Renew, or staff force-materialize).
 */
export function materializeRenewInvoicePatch(job, { fee } = {}) {
  const pr = (job && job.permitRenew) || {};
  // Scenario may have aged out of the cache — job/pr fields carry the facts.
  const sc = renewScenarioById(pr.scenarioId || "hampton-yossi") || {};
  const amount =
    fee != null
      ? parseAmount(fee) || PERMIT_RENEW_FEE
      : pr.fee != null
        ? parseAmount(pr.fee) || PERMIT_RENEW_FEE
        : renewFeeFromScenario(sc);
  const inv = String(
    pr.placeholderInvoiceNo || job?.invoiceNo || ""
  ).trim();
  if (inv) {
    try {
      markPlaceholderMaterialized(inv);
    } catch {
      /* ignore */
    }
  }
  const lines = buildPermitRenewInvoiceLines({
    fee: amount,
    address: pr.address || sc.address || job?.serviceAddress || job?.address,
    permitNo: pr.permitNo || sc.permitNo,
  });
  return {
    invoiceNo: inv,
    amount,
    openBalance: amount,
    invoiceLines: lines,
    invoiceDate: new Date().toISOString().slice(0, 10),
    _invoiceConfirmed: true,
    excludeFromBalanceDue: true,
    permitRenew: {
      ...pr,
      noticeOnly: false,
      invoiceMaterialized: true,
      provisional: true,
      excludeFromBalanceDue: true,
      fullPayOnly: true,
      placeholderInvoiceNo: inv,
      fee: amount,
      materializedAt: new Date().toISOString(),
    },
  };
}

/**
 * Patch after staff successfully sends the renew notice email.
 * Appends send history; does not materialize the invoice.
 */
export function buildRenewNoticeSentPatch(job, { to, subject, placeholderInvoiceNo } = {}) {
  const pr = (job && job.permitRenew) || {};
  const at = new Date().toISOString();
  const inv = String(
    placeholderInvoiceNo || pr.placeholderInvoiceNo || job?.invoiceNo || ""
  ).trim();
  const entry = {
    id: `send-${Date.now()}`,
    at,
    to: String(to || "").trim(),
    subject: String(subject || "").trim(),
    placeholderInvoiceNo: inv,
  };
  const sendHistory = [entry, ...(Array.isArray(pr.sendHistory) ? pr.sendHistory : [])].slice(
    0,
    50
  );
  try {
    appendRenewSendHistory({
      jobId: job?.id || "",
      to: entry.to,
      subject: entry.subject,
      placeholderInvoiceNo: inv,
      address: pr.address || job?.serviceAddress || job?.address || "",
      customer: pr.displayCustomer || job?.customer || "",
      permitNo: pr.permitNo || "",
      scenarioId: pr.scenarioId || "",
    });
  } catch {
    /* ignore */
  }
  return {
    permitRenew: {
      ...pr,
      noticeOnly: pr.invoiceMaterialized ? false : true,
      invoiceMaterialized: !!pr.invoiceMaterialized,
      placeholderInvoiceNo: inv || pr.placeholderInvoiceNo || "",
      noticeSent: true,
      noticeSentAt: at,
      emailSentAt: at,
      noticeTo: entry.to,
      sendHistory,
    },
  };
}
