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
 */
export const PHASE_A_HAMPTON_SCENARIO = {
  id: "hampton-yossi",
  displayCustomer: "Yosef Beshari",
  greetingName: "Yossi",
  address: "40 Hampton Pl",
  permitNo: "B01126007-S1-EL",
  issuedDate: "2026-02-06",
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
    // Service site on the invoice Service Address field
    address: serviceAddr,
    serviceAddress: serviceAddr,
    // Distinct from service so the PDF always prints a Service Address column
    billingAddress: person,
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
    // Keep bill-to name as the person; service street on serviceAddress
    billingAddress: String(sc.displayCustomer || "").trim() || LEVI_TESTER.customer,
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
    ba: person,
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
 * Customer renew notice (Phase A) — same branded layout family as Con Ed
 * application-complete mail (header + body + signature + Powered by LE).
 *
 * Copy (Levi 2026-08-10):
 * - Bold application / issue # / issue date / expiration date
 * - Dates Month D, YYYY
 * - Has already expired (not "year coming up")
 * - Abandoned risk + ~$1,800 savings vs new filing
 * - CTA: Renew Permit → real payment link (invoice created on Send email)
 */
export function buildPermitRenewEmail({
  scenario = PHASE_A_HAMPTON_SCENARIO,
  fee,
  payUrl = "",
  invoiceNo = "",
  /** @deprecated Prefer creating invoice on send; kept for callers. */
  noticeOnly = false,
} = {}) {
  const sc = scenario || PHASE_A_HAMPTON_SCENARIO;
  const amount = fee != null ? parseAmount(fee) || PERMIT_RENEW_FEE : renewFeeFromScenario(sc);
  const feeStr = amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
  const inv = String(invoiceNo || "").trim();
  const company = brand();
  const subject = `Renew your city electrical permit — ${sc.address} — ${company}`;
  const greeting = sc.greetingName || sc.displayCustomer || "there";
  const issuedIso = String(sc.issuedDate || "").trim().slice(0, 10);
  const expiresIso =
    permitExpiresFromIssued(issuedIso) ||
    String(sc.expiresDate || "").trim().slice(0, 10);
  const issuedUs = formatPermitDateUs(issuedIso);
  const expiresUs = formatPermitDateUs(expiresIso);
  const website = activeTenantConfig().profile?.website || "";

  const lines = [
    `Hi ${greeting},`,
    "",
    "This is about the city electrical permit application for:",
    "",
    `Address: ${sc.address}`,
    `Application / issue number: ${sc.permitNo}`,
    issuedUs ? `Issue date: ${issuedUs}` : null,
    expiresUs ? `Expiration date: ${expiresUs}` : null,
    `Renew fee: ${feeStr}`,
    "",
    "This permit has expired. If it is not renewed, it can go into an abandoned status. Closing an abandoned application means filing a brand-new application.",
    "",
    "Renewing now can save you at least $1,800 compared with creating a new permit to reinstate an abandoned one.",
    "",
    inv
      ? `Invoice #${inv} is ready. Press Renew Permit below to open the payment page.`
      : "Press Renew Permit below to open the payment page and start the renewal.",
    "",
    "We handle the city filing after payment.",
    "",
    "Questions? Reply to this email or call us anytime.",
    "",
    "Thank you,",
    company,
    website,
  ].filter((ln) => ln != null);

  // Inner HTML for standard branded shell (customer-email / buildBrandedEmailHtml).
  // Bold the application facts Levi called out.
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
    `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">This is about the city electrical <strong>permit application</strong> for:</p>` +
    `<table style="border-collapse:collapse;width:100%;max-width:560px;margin:0 0 16px;font-family:Arial,Helvetica,sans-serif">` +
    row("Address", sc.address) +
    row("Application / issue number", sc.permitNo) +
    (issuedUs ? row("Issue date", issuedUs) : "") +
    (expiresUs ? row("Expiration date", expiresUs) : "") +
    row("Renew fee", feeStr) +
    (inv ? row("Invoice", `#${inv}`) : "") +
    `</table>` +
    `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0f172a">This permit <strong>has expired</strong>. If it is not renewed, it can go into an <strong>abandoned</strong> status. Closing an abandoned application means filing a brand-new application.</p>` +
    `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0f172a">Renewing now can save you <strong>at least $1,800</strong> compared with creating a new permit to reinstate an abandoned one.</p>` +
    `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0f172a">${
      inv
        ? `Invoice <strong>#${escHtml(inv)}</strong> is ready. Press <strong>Renew Permit</strong> below to open the payment page.`
        : `Press <strong>Renew Permit</strong> below to open the payment page and start the renewal.`
    }</p>` +
    `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0f172a">We handle the city filing after payment.</p>` +
    `<p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0f172a">Questions? Reply to this email or call us anytime.</p>`;

  void noticeOnly; // callers may still pass it; invoice is now created on Send email
  return {
    subject,
    body: lines.join("\n"),
    /** Inner HTML for standard branded email shell (meter-app style layout). */
    htmlBody,
    to: LEVI_TESTER.email,
    /** Primary button — payment link when invoice exists; fallback CTA otherwise. */
    ctaLabel: "Renew Permit",
    ctaUrl: String(payUrl || PHASE_A_RENEW_CTA_URL).trim() || PHASE_A_RENEW_CTA_URL,
    fee: amount,
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
