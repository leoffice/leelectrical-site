// Permit renew — real Renewal Notifications (Levi 2026-08-10).
// Ready addresses → Send Email (compose To + body) → pay full amount → update permit.
// Auto schedule OFF. Phase B (pay → file DOB) is intentionally NOT here.

import { nextDocNumberFromJobs } from "./nextDocNumber.js";
import { normalizeEmail } from "./customers.js";
import { parseAmount } from "./format.js";
import { activeTenantConfig } from "./tenantBranding.js";
import { buildPayLandingUrl, buildShortPayLandingUrl } from "./payLanding.js";

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
 * Yossi Hackner · 234 Schenectady LLC · 364 Schenectady Avenue.
 * Seeding the renew job creates the service address on the customer if missing.
 */
export const RENEW_HACKNER_SCENARIO = {
  id: "schenectady-hackner",
  displayCustomer: "Yossi Hackner",
  greetingName: "Yossi",
  businessName: "234 Schenectady LLC",
  address: "364 Schenectady Avenue",
  /** City filing # unknown until DOB pull — entity label until then. */
  permitNo: "234 Schenectady LLC",
  issuedDate: "",
  fee: PERMIT_RENEW_FEE,
  realEmail: "yhackner@gmail.com",
  phone: "3476935123",
  matchedCustomer: true,
  real: true,
  realTest: true,
  qboCustomerId: "336",
};

/** @deprecated use RENEW_HACKNER_SCENARIO */
export const REAL_TEST_HACKNER_SCENARIO = RENEW_HACKNER_SCENARIO;
/** @deprecated use RENEW_HACKNER_SCENARIO */
export const REAL_RENEW_SCHENECTADY_SCENARIO = RENEW_HACKNER_SCENARIO;

/**
 * Ready renew addresses (cache). Matched customers only for now.
 * Expand from host permits cache + QBO match later.
 */
export const READY_RENEW_SCENARIOS = [RENEW_HAMPTON_SCENARIO, RENEW_HACKNER_SCENARIO];

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
  if (!raw || !raw.includes("@")) {
    return { ok: false, error: "Enter an email address" };
  }
  if (isBlockedRenewRecipient(raw)) {
    return { ok: false, error: "That address is blocked for renew send" };
  }
  return {
    ok: true,
    email: raw,
    realTest: !isLeviTesterEmail(raw) || !!realTest,
  };
}

/** True if this is a leftover Levi-Tester mock renew (safe to delete). */
export function isLeviTesterMockRenewJob(job) {
  if (!job || !isPermitRenewJob(job)) return false;
  const pr = job.permitRenew || job.permitRenewMock || {};
  if (pr.realTest) return false;
  if (isLeviTesterEmail(job.email)) return true;
  if (isLeviTesterCustomer(job.customer) || isLeviTesterCustomer(job.businessName)) {
    return true;
  }
  // Mock without realTest and no real customer email
  return !!(pr.mock || pr.phase === "A" || pr.phase === 1) && !pr.realTest;
}

export function renewFeeFromScenario(scenario = PHASE_A_HAMPTON_SCENARIO) {
  const n = parseAmount(scenario?.fee);
  return n > 0 ? n : PERMIT_RENEW_FEE;
}

/** Invoice line items for a city permit renew. */
export function buildPermitRenewInvoiceLines({
  fee = PERMIT_RENEW_FEE,
  address = PHASE_A_HAMPTON_SCENARIO.address,
  permitNo = PHASE_A_HAMPTON_SCENARIO.permitNo,
} = {}) {
  const amt = parseAmount(fee) || PERMIT_RENEW_FEE;
  const addr = String(address || "").trim() || PHASE_A_HAMPTON_SCENARIO.address;
  const no = String(permitNo || "").trim() || PHASE_A_HAMPTON_SCENARIO.permitNo;
  return [
    {
      itemName: "City electrical permit renewal",
      description:
        `Renew / update city electrical permit for ${addr}` +
        (no ? ` (permit ${no})` : "") +
        ". Includes filing coordination for a new application year.",
      qty: 1,
      unitPrice: amt,
    },
  ];
}

export function isPermitRenewJob(job) {
  if (!job) return false;
  if (
    job.permitRenew &&
    (job.permitRenew.mock ||
      job.permitRenew.realTest ||
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
 * @param {object[]} jobs
 * @param {{ scenarioId?: string }} [opts] when set, only reuse matching scenario
 */
export function findOpenMockRenewJob(jobs, opts = {}) {
  const wantScenario = String(opts?.scenarioId || "").trim();
  const list = Array.isArray(jobs) ? jobs : [];
  for (const j of list) {
    if (!isPermitRenewJob(j)) continue;
    if (!String(j.invoiceNo || "").trim()) continue;
    if (j.paid) continue;
    const due =
      j.openBalance != null && j.openBalance !== ""
        ? parseAmount(j.openBalance)
        : parseAmount(j.amount);
    if (due <= 0.01) continue;
    const pr = j.permitRenew || j.permitRenewMock || {};
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
      pr.realTest
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
 * Fields for createJob — bill-to shows the real person's name (Hampton mock),
 * service address is the permit site, email stays Levi Tester only.
 * Invoice # is a normal LE-#### (not a local id / random token).
 */
export function buildPermitRenewJobFields({
  jobs = [],
  scenario = PHASE_A_HAMPTON_SCENARIO,
  fee,
} = {}) {
  const sc = scenario || PHASE_A_HAMPTON_SCENARIO;
  const amount = fee != null ? parseAmount(fee) || PERMIT_RENEW_FEE : renewFeeFromScenario(sc);
  const invoiceNo = nextDocNumberFromJobs(jobs, "invoice");
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
  return {
    customer: person,
    businessName: biz,
    personName: person,
    // Mock → tester; real test → customer email (compose still reviewable)
    email: isReal ? String(sc.realEmail || "").trim() || LEVI_TESTER.email : LEVI_TESTER.email,
    phone: String(sc.phone || "").trim(),
    title: sc.permitNo
      ? `City electrical permit renewal — ${sc.permitNo}`
      : `City electrical permit renewal — ${serviceAddr}`,
    // Job notes (not printed as line item). Line description carries permit #.
    description:
      `City electrical permit renewal for ${serviceAddr}` +
      (sc.permitNo ? ` · ${sc.permitNo}` : "") +
      (biz && biz !== person ? ` · ${biz}` : ""),
    // Service site only — never put the permit street under Bill To (Levi 2026-08-10)
    address: serviceAddr,
    serviceAddress: serviceAddr,
    // Empty billing street: bill-to is customer name; PDF must not fall back to service
    billingAddress: "",
    amount,
    invoiceNo,
    invoiceLines: lines,
    invoiceDate: new Date().toISOString().slice(0, 10),
    _invoiceConfirmed: true,
    ...(sc.qboCustomerId ? { qboCustomerId: String(sc.qboCustomerId) } : {}),
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

/** Patch applied after createJob so renew metadata survives. */
export function buildPermitRenewMetaPatch(scenario = PHASE_A_HAMPTON_SCENARIO, fee) {
  const sc = scenario || PHASE_A_HAMPTON_SCENARIO;
  const amount = fee != null ? parseAmount(fee) || PERMIT_RENEW_FEE : renewFeeFromScenario(sc);
  const issued = String(sc.issuedDate || "").trim().slice(0, 10);
  const expires = issued
    ? permitExpiresFromIssued(issued)
    : String(sc.expiresDate || "").trim().slice(0, 10);
  const isReal = !!sc.realTest;
  return {
    openBalance: amount,
    _invoiceConfirmed: true,
    email: isReal
      ? String(sc.realEmail || "").trim() || LEVI_TESTER.email
      : LEVI_TESTER.email,
    serviceAddress: sc.address,
    address: sc.address,
    // Bill-to = customer name only (invoicePdf); never put service street here
    billingAddress: "",
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
    const expires =
      String(pr.expiresDate || "").trim().slice(0, 10) ||
      permitExpiresFromIssued(issued);
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
      pr.scenarioId === "hampton-yossi"
    );
    const paid = !!(
      j.paid ||
      pr.paid ||
      (j.invoiceNo && due <= 0.01) ||
      pr.nextStep === "update_permit" ||
      ((phaseA || realTest) && anyPay)
    );
    const nextStep = String(
      pr.nextStep || (paid && (phaseA || realTest) ? "update_permit" : "")
    ).trim();
    const noticeSent = !!(pr.noticeSent || pr.emailSentAt || pr.noticeSentAt);
    let status = "Pending send";
    if (paid) status = nextStep === "update_permit" ? "Paid — update permit" : "Paid";
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
    const deployUpdate = paid && nextStep === "update_permit";
    // Hide emailed-but-unpaid from both boxes (only returns when paid)
    if (!pendingSend && !deployUpdate && !paid) return;
    rows.push({
      id: j.id,
      jobId: j.id,
      address: String(
        j.serviceAddress || j.address || pr.address || extra.address || "—"
      ).trim(),
      customer,
      businessName: businessName && businessName !== customer ? businessName : "",
      permitNo: String(pr.permitNo || pr.filing || extra.permitNo || "").trim(),
      invoiceNo: String(j.invoiceNo || "").trim(),
      fee: pr.fee != null ? parseAmount(pr.fee) : parseAmount(j.amount) || PERMIT_RENEW_FEE,
      issuedDate: issued,
      gradedDate: graded,
      expiresDate: expires,
      paid,
      status,
      nextStep,
      nextStepLabel:
        nextStep === "update_permit"
          ? "Payment received — next: add to Deploy queue to update the permit"
          : "",
      /** Expiration-driven notification stage (upcoming / soon / expired / near_abandon / abandoned). */
      stageTone,
      stageLabel: permitRenewStageLabel(stageTone),
      mock: phaseA && !realTest,
      realTest,
      email: String(j.email || pr.realEmail || "").trim(),
      noticeSent,
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
 * Always surfaces ready matched-customer addresses from the permit cache
 * until notice is sent; after full pay they move to the update-permit box.
 */
export function listPendingRenewCards(jobs = []) {
  const apps = listRenewApplications(jobs);
  const cards = [];
  for (const sc of READY_RENEW_SCENARIOS) {
    const job = findRenewJobForScenario(jobs, sc.id);
    if (job) {
      const row = apps.find((r) => r.id === job.id);
      if (row?.pendingSend) {
        cards.push({
          ...row,
          scenarioId: sc.id,
          scenario: sc,
          email: row.email || sc.realEmail || "",
        });
        continue;
      }
      // Emailed unpaid or paid/deploy — not in pending box
      if (row?.deployUpdate || row?.paid) continue;
      const pr = job.permitRenew || {};
      if (pr.noticeSent || pr.emailSentAt) continue;
      // Job exists but not yet in apps (edge) — still pending
    }
    const issued = String(sc.issuedDate || "").trim().slice(0, 10);
    const expires =
      String(sc.expiresDate || "").trim().slice(0, 10) ||
      permitExpiresFromIssued(issued);
    const stageTone = expires ? permitRenewStatusTone(expires) : "upcoming";
    cards.push({
      id: job?.id || `ready-${sc.id}`,
      jobId: job?.id || "",
      scenarioId: sc.id,
      scenario: sc,
      customer: sc.displayCustomer,
      businessName: sc.businessName || "",
      address: sc.address,
      permitNo: sc.permitNo || "",
      issuedDate: issued,
      gradedDate: issued,
      expiresDate: expires,
      fee: renewFeeFromScenario(sc),
      email: String(job?.email || sc.realEmail || "").trim(),
      status: job?.invoiceNo ? "Pending send" : "Ready",
      pendingSend: true,
      paid: false,
      deployUpdate: false,
      noticeSent: false,
      stageTone,
      stageLabel: permitRenewStageLabel(stageTone),
      invoiceNo: String(job?.invoiceNo || "").trim(),
      mock: false,
      realTest: true,
    });
  }
  return cards;
}

/** Paid renews ready for Deploy → update permit. */
export function listPaidUpdatePermitCards(jobs = []) {
  return listRenewApplications(jobs).filter(
    (r) => r.deployUpdate || (r.paid && r.nextStep === "update_permit")
  );
}

/**
 * Public entry for the email "Renew Permit" button.
 * Query survives redirects; main.jsx bootstraps it to a public pay landing
 * (no staff login) and marks that the invoice is generated on that tap.
 */
export const PHASE_A_RENEW_CTA_URL =
  "https://leelectrical.us/app/pro/?renewCta=phaseA";

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
  const inv =
    String(invoiceNo || "").trim() ||
    `LE-RENEW-${String(sc.permitNo || "mock").replace(/[^A-Za-z0-9]/g, "").slice(0, 10)}`;
  const person = String(sc.displayCustomer || "").trim() || "Customer";
  const addr = String(sc.address || "").trim();
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
    w:
      `City electrical permit renewal for ${addr}` +
      (sc.permitNo ? ` (permit ${sc.permitNo})` : "") +
      `. Renew fee ${feeStr}.`,
    t: feeStr,
    d: feeStr,
    p: "",
    ps: [],
    e: LEVI_TESTER.email,
    ph: "",
    sa: addr,
    // Service address only — never put the street in bill-to (Levi 2026-08-10)
    ba: "",
    z: "",
    sl: siteSlug,
    pay: "",
    as: new Date().toISOString().slice(0, 10),
    k: "i",
    lines: [
      {
        itemName: "City electrical permit renewal",
        description:
          `Renew / update city electrical permit for ${addr}` +
          (sc.permitNo ? ` (permit ${sc.permitNo})` : "") +
          ". Includes filing coordination for a new application year.",
        qty: 1,
        unitPrice: amount,
      },
    ],
    // Marker so PayLanding / staff can recognize a renew-generated invoice
    renewCta: "phaseA",
    renewScenarioId: sc.id || "hampton-yossi",
  };
}

/**
 * Customer renew notice (Phase A) — branded shell + Levi draft (2026-08-10).
 *
 * Rules:
 * - Call it **Permit** only (not Application / issue number)
 * - Service address is site; never bill-to street
 * - Status sentence + subject auto-switch by today vs expiration
 * - Abandoned = expiration + 12 months; ~$1,800 savings
 * - CTA: Renew Permit → payment link
 */
export function buildPermitRenewEmail({
  scenario = PHASE_A_HAMPTON_SCENARIO,
  fee,
  payUrl = "",
  invoiceNo = "",
  /** @deprecated Prefer creating invoice on send; kept for callers. */
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
  const expiresIso =
    String(sc.expiresDate || "").trim().slice(0, 10) ||
    permitExpiresFromIssued(issuedIso);
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
      `. A straight renewal is no longer available — reinstating means filing a brand-new permit, which typically costs at least $1,800 more than renewing on time. Reply or tap below and we'll help you apply for a new permit.`
    : isNearAbandon
      ? `The city marks a permit "abandoned" 12 months after it expires` +
        (abandonedUs ? ` (that date is ${abandonedUs})` : "") +
        `. Once abandoned, reinstating means filing a brand-new permit — typically at least $1,800 more than a straight renewal. Act now so you do not have to re-apply from scratch.`
      : pastExpire
        ? `Once a permit stays unrenewed for 12 months after it expires, the city marks it "abandoned." Reinstating an abandoned permit means filing a brand-new one — which typically costs at least $1,800 more than a straight renewal. Renewing now avoids that cost and keeps your work on record.`
        : `If a permit lapses and stays unrenewed for 12 months, the city marks it "abandoned," and reinstating it means filing a brand-new permit — which typically costs at least $1,800 more than renewing on time. Renewing now avoids that entirely.`;

  const payBlock = isAbandoned
    ? inv
      ? `Invoice ${invLabel} is ready if you want us to start the new filing — click ${ctaLabel} below and we'll take it from there.`
      : `Click ${ctaLabel} below and we'll help you file a brand-new permit application.`
    : inv
      ? pastExpire
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
      `. A straight renewal is no longer available — reinstating means filing a brand-new permit, which typically costs <strong>at least $1,800</strong> more than renewing on time. Reply or tap below and we&rsquo;ll help you apply for a new permit.`
    : isNearAbandon
      ? `The city marks a permit <strong>&quot;abandoned&quot;</strong> 12 months after it expires` +
        (abandonedUs ? ` (that date is <strong>${escHtml(abandonedUs)}</strong>)` : "") +
        `. Once abandoned, reinstating means filing a brand-new permit — typically <strong>at least $1,800</strong> more than a straight renewal. Act now so you do not have to re-apply from scratch.`
      : pastExpire
        ? `Once a permit stays unrenewed for <strong>12 months</strong> after it expires, the city marks it <strong>&quot;abandoned.&quot;</strong> Reinstating an abandoned permit means filing a brand-new one — which typically costs <strong>at least $1,800</strong> more than a straight renewal. Renewing now avoids that cost and keeps your work on record.`
        : `If a permit lapses and stays unrenewed for <strong>12 months</strong>, the city marks it <strong>&quot;abandoned,&quot;</strong> and reinstating it means filing a brand-new permit — which typically costs <strong>at least $1,800</strong> more than renewing on time. Renewing now avoids that entirely.`;
  const payBlockHtml = isAbandoned
    ? inv
      ? `Invoice <strong>${escHtml(invLabel)}</strong> is ready if you want us to start the new filing — click <strong>${escHtml(
          ctaLabel
        )}</strong> below and we&rsquo;ll take it from there.`
      : `Click <strong>${escHtml(ctaLabel)}</strong> below and we&rsquo;ll help you file a brand-new permit application.`
    : inv
      ? pastExpire
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
    invLabel ? `Invoice: ${invLabel}` : null,
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
    (invLabel ? row("Invoice", invLabel) : "") +
    `</table>` +
    `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0f172a">${statusLineHtml}</p>` +
    `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0f172a">${abandonBlockHtml}</p>` +
    `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0f172a">${payBlockHtml}</p>` +
    `<p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0f172a">Questions? Just reply to this email or call us anytime.</p>`;

  void noticeOnly;
  const defaultTo = sc.realTest
    ? String(sc.realEmail || "").trim() || LEVI_TESTER.email
    : LEVI_TESTER.email;
  return {
    subject,
    body: lines.join("\n"),
    htmlBody,
    to: defaultTo,
    ctaLabel,
    ctaUrl: String(payUrl || PHASE_A_RENEW_CTA_URL).trim() || PHASE_A_RENEW_CTA_URL,
    fee: amount,
    tone,
    stageLabel: permitRenewStageLabel(tone),
    expiresDate: expiresIso,
    abandonedDate: abandonedIso,
    renewByDate: renewByIso,
    realTest: !!sc.realTest,
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
 */
export function preparePhaseAMock({ jobs, scenario = PHASE_A_HAMPTON_SCENARIO, fee } = {}) {
  const sc = scenario || PHASE_A_HAMPTON_SCENARIO;
  const existing = findOpenMockRenewJob(jobs, { scenarioId: sc.id });
  if (existing) {
    return {
      reuse: true,
      job: existing,
      fields: null,
      meta: null,
      fee: parseAmount(existing.amount) || renewFeeFromScenario(sc),
      scenario: sc,
    };
  }
  const fields = buildPermitRenewJobFields({ jobs, scenario: sc, fee });
  const meta = buildPermitRenewMetaPatch(sc, fields.amount);
  return { reuse: false, job: null, fields, meta, fee: fields.amount, scenario: sc };
}

/**
 * Ensure a renew notice row exists for a scenario (creates service address via job).
 * Pure data — caller createJob / patchAndSave.
 */
export function prepareRenewScenario({ jobs, scenario, fee } = {}) {
  return preparePhaseAMock({
    jobs,
    scenario: scenario || RENEW_HACKNER_SCENARIO,
    fee,
  });
}
