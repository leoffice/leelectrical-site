// Phase A — permit renew mock (Levi 2026-08-10).
// Email (address + permit details) → "Update or Renew Permit" → regular invoice
// pay page → $365 renew invoice + pay. Mock only on Levi Tester. Auto schedule OFF.
// Phase B (pay → notify → file DOB) is intentionally NOT here.

import { nextDocNumberFromJobs } from "./nextDocNumber.js";
import { normalizeEmail } from "./customers.js";
import { parseAmount } from "./format.js";
import { activeTenantConfig } from "./tenantBranding.js";
import { buildPayLandingUrl, buildShortPayLandingUrl } from "./payLanding.js";

/** Default city electrical permit renew fee (editable before send later). */
export const PERMIT_RENEW_FEE = 365;

/**
 * First real walk-through customer (after Phase A pass). Content for mock email
 * pretends this job; send address stays Levi Tester only.
 *
 * Levi 2026-08-10: expired permit is **L1** (issued 10/11/2024), not S1.
 * Service site = 40 Hampton Pl — never bill-to street.
 */
export const PHASE_A_HAMPTON_SCENARIO = {
  id: "hampton-yossi",
  displayCustomer: "Yosef Beshari",
  greetingName: "Yossi",
  address: "40 Hampton Pl",
  /** Expired city permit (L1). S1 is a different open permit — do not use for renew mock. */
  permitNo: "B01126007-L1-EL",
  issuedDate: "2024-10-11",
  fee: PERMIT_RENEW_FEE,
  /** Real customer — never Phase A recipient. */
  realEmail: "yossi6886@gmail.com",
};

/** Safe mock recipient — only this customer for Phase A sends. */
export const LEVI_TESTER = {
  customer: "levi tester",
  email: "levikumer@gmail.com",
  aliases: ["levi tester", "tester 2"],
};

/** Real customer addresses that must never receive Phase A mock mail. */
export const PHASE_A_BLOCKED_EMAILS = [
  PHASE_A_HAMPTON_SCENARIO.realEmail,
  "yossi6886@gmail.com",
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

/**
 * Phase A recipient gate — only Levi Tester (or empty → default tester).
 * @returns {{ ok: true, email: string } | { ok: false, error: string }}
 */
export function assertPhaseARecipient(email) {
  const raw = String(email || "").trim();
  const resolved = raw || LEVI_TESTER.email;
  if (!resolved.includes("@")) {
    return { ok: false, error: "Need a real email address for the mock send" };
  }
  if (isBlockedRenewRecipient(resolved)) {
    return {
      ok: false,
      error: "Phase A mock cannot send to the real customer — use Levi Tester only",
    };
  }
  if (!isLeviTesterEmail(resolved)) {
    return {
      ok: false,
      error: "Phase A mock only sends to Levi Tester (" + LEVI_TESTER.email + ")",
    };
  }
  return { ok: true, email: resolved };
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
  if (job.permitRenew && (job.permitRenew.mock || job.permitRenew.phase === "A")) return true;
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

/** Open (unpaid) mock renew invoice still on the board — reuse instead of spam. */
export function findOpenMockRenewJob(jobs) {
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
    // Prefer tester customer
    if (
      isLeviTesterCustomer(j.customer) ||
      isLeviTesterCustomer(j.businessName) ||
      isLeviTesterEmail(j.email) ||
      j.permitRenew?.mock
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
  const serviceAddr = String(sc.address || "").trim();
  return {
    customer: person,
    businessName: person,
    personName: person,
    // Delivery only — gate still blocks real Yossi
    email: LEVI_TESTER.email,
    phone: "",
    title: `City electrical permit renewal — ${sc.permitNo}`,
    // Job notes (not printed as line item). Line description carries permit #.
    description: `City electrical permit renewal for ${serviceAddr} · permit ${sc.permitNo}`,
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
 * Auto status tone from today vs expiration (Levi 2026-08-10 yearly template).
 * @returns {"upcoming"|"soon"|"expired"}
 */
export function permitRenewStatusTone(expiresIso, { todayIso } = {}) {
  const exp = String(expiresIso || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return "upcoming";
  const today =
    String(todayIso || "").trim().slice(0, 10) ||
    new Date().toISOString().slice(0, 10);
  if (today >= exp) return "expired";
  const soonCutoff = addDaysIso(exp, -60); // ~2 months before
  if (soonCutoff && today >= soonCutoff) return "soon";
  return "upcoming";
}

/**
 * Single status sentence that auto-switches (never wrong for the date).
 * Levi 2026-08-10: exact yearly-template wording.
 */
export function permitRenewStatusSentence(address, expiresUs, tone) {
  const addr = String(address || "").trim() || "this address";
  const exp = String(expiresUs || "").trim() || "the expiration date";
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
  const expires = permitExpiresFromIssued(issued);
  return {
    openBalance: amount,
    _invoiceConfirmed: true,
    email: LEVI_TESTER.email,
    serviceAddress: sc.address,
    address: sc.address,
    // Bill-to = customer name only (invoicePdf); never put service street here
    billingAddress: "",
    // Unpaid renew offers do not count as customer balance due (Levi 2026-08-10)
    excludeFromBalanceDue: true,
    permitRenew: {
      mock: true,
      phase: "A",
      // Provisional until paid — left on file, not treated as money owed
      provisional: true,
      excludeFromBalanceDue: true,
      scenarioId: sc.id || "hampton-yossi",
      displayCustomer: sc.displayCustomer,
      address: sc.address,
      permitNo: sc.permitNo,
      issuedDate: issued,
      gradedDate: issued,
      expiresDate: expires,
      fee: amount,
      createdAt: new Date().toISOString(),
      autoEmail: false,
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
 * Rows for the purple MAC Renew box — mock invoices, wants-to-renew flags, paid.
 * Sorted: unpaid/open first, then paid, then draft notices.
 */
export function listRenewApplications(jobs = []) {
  const list = Array.isArray(jobs) ? jobs : [];
  const rows = [];
  const seen = new Set();

  const pushFromJob = (j, extra = {}) => {
    if (!j?.id || seen.has(j.id)) return;
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
    const paid = !!(j.paid || (j.invoiceNo && due <= 0.01));
    let status = "Wants renew";
    if (paid) status = "Paid";
    else if (j.invoiceNo) status = "Invoice open";
    else if (pr.mock || pr.phase === "A" || pr.phase === 1) status = "Mock draft";
    rows.push({
      id: j.id,
      jobId: j.id,
      address: String(
        j.serviceAddress || j.address || pr.address || extra.address || "—"
      ).trim(),
      customer: String(
        pr.displayCustomer || j.customer || j.personName || j.businessName || "—"
      ).trim(),
      permitNo: String(pr.permitNo || pr.filing || extra.permitNo || "").trim(),
      invoiceNo: String(j.invoiceNo || "").trim(),
      fee: pr.fee != null ? parseAmount(pr.fee) : parseAmount(j.amount) || PERMIT_RENEW_FEE,
      issuedDate: issued,
      gradedDate: graded,
      expiresDate: expires,
      paid,
      status,
      mock: !!(pr.mock || pr.phase === "A" || pr.phase === 1),
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
    if (r.status === "Invoice open") return 0;
    if (r.status === "Wants renew" || r.status === "Mock draft") return 1;
    if (r.status === "Paid") return 2;
    return 3;
  };
  rows.sort((a, b) => rank(a) - rank(b) || String(a.address).localeCompare(String(b.address)));
  return rows;
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
  const statusLine = permitRenewStatusSentence(sc.address, expiresUs, tone);
  const website = profile.website || "";
  const phone = profile.phone || "(718) 594-1850";
  const fromEmail = profile.email || "Office@LeElectrical.us";
  const signer = profile.ownerName || profile.contactName || "Levi Kumer, President";
  const lic = profile.licenseNo || profile.license || "11212";
  const companyLong = profile.legalName || profile.name || company;

  const subject =
    tone === "expired"
      ? `Your electrical permit has expired — ${sc.address} (renew before it's abandoned)`
      : `Time to renew your electrical permit — ${sc.address}`;

  const detailsHeader =
    tone === "expired"
      ? "Here are the details for your expired electrical permit:"
      : "Here are the details for your upcoming permit renewal:";

  const issuedLabel = "Issued";
  const expLabel = tone === "expired" ? "Expired" : "Expires";

  const abandonBlock =
    tone === "expired"
      ? `Once a permit stays unrenewed for 12 months after it expires, the city marks it "abandoned." Reinstating an abandoned permit means filing a brand-new one — which typically costs at least $1,800 more than a straight renewal. Renewing now avoids that cost and keeps your work on record.`
      : `If a permit lapses and stays unrenewed for 12 months, the city marks it "abandoned," and reinstating it means filing a brand-new permit — which typically costs at least $1,800 more than renewing on time. Renewing now avoids that entirely.`;

  const payBlock = inv
    ? tone === "expired"
      ? `Invoice ${invLabel} is ready — click Renew Permit below to pay, and we'll handle the city filing for you. To stay safely ahead of the abandoned deadline (${abandonedUs || "12 months after expire"}), please renew by ${renewByUs || "soon"}.`
      : `Invoice ${invLabel} is ready — click Renew Permit below to pay, and we'll handle the city filing for you. Please renew by ${renewByUs || expiresUs} to keep everything current.`
    : "Click Renew Permit below to open the payment page, and we'll handle the city filing for you.";

  // Light HTML emphasis on key facts (addresses/dates/fees already bold in table rows)
  const statusLineHtml = (() => {
    const addr = escHtml(sc.address || "this address");
    const exp = escHtml(expiresUs || "the expiration date");
    if (tone === "expired") {
      return `Your electrical permit at <strong>${addr}</strong> expired on <strong>${exp}</strong>. It can still be renewed now, but the 12-month abandoned clock has started.`;
    }
    if (tone === "soon") {
      return `Your electrical permit at <strong>${addr}</strong> expires soon, on <strong>${exp}</strong> — renewing now keeps it active.`;
    }
    return `Your electrical permit at <strong>${addr}</strong> is coming up for renewal — it expires on <strong>${exp}</strong>. Renewing on time keeps it active and continuous, with no re-inspection or refiling needed.`;
  })();
  const abandonBlockHtml =
    tone === "expired"
      ? `Once a permit stays unrenewed for <strong>12 months</strong> after it expires, the city marks it <strong>&quot;abandoned.&quot;</strong> Reinstating an abandoned permit means filing a brand-new one — which typically costs <strong>at least $1,800</strong> more than a straight renewal. Renewing now avoids that cost and keeps your work on record.`
      : `If a permit lapses and stays unrenewed for <strong>12 months</strong>, the city marks it <strong>&quot;abandoned,&quot;</strong> and reinstating it means filing a brand-new permit — which typically costs <strong>at least $1,800</strong> more than renewing on time. Renewing now avoids that entirely.`;
  const payBlockHtml = inv
    ? tone === "expired"
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
    `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0f172a">${escHtml(
      statusLine
    )}</p>` +
    `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0f172a">${escHtml(
      abandonBlock
    )}</p>` +
    `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0f172a">${escHtml(
      payBlock
    )}</p>` +
    `<p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0f172a">Questions? Just reply to this email or call us anytime.</p>`;

  void noticeOnly;
  return {
    subject,
    body: lines.join("\n"),
    htmlBody,
    to: LEVI_TESTER.email,
    ctaLabel: "Renew Permit",
    ctaUrl: String(payUrl || PHASE_A_RENEW_CTA_URL).trim() || PHASE_A_RENEW_CTA_URL,
    fee: amount,
    tone,
    expiresDate: expiresIso,
    abandonedDate: abandonedIso,
    renewByDate: renewByIso,
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
  const linkAmount = due > 0 ? due : fee || PERMIT_RENEW_FEE;
  const opts = {
    job,
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
  const existing = findOpenMockRenewJob(jobs);
  if (existing) {
    return {
      reuse: true,
      job: existing,
      fields: null,
      meta: null,
      fee: parseAmount(existing.amount) || renewFeeFromScenario(scenario),
    };
  }
  const fields = buildPermitRenewJobFields({ jobs, scenario, fee });
  const meta = buildPermitRenewMetaPatch(scenario, fields.amount);
  return { reuse: false, job: null, fields, meta, fee: fields.amount };
}
