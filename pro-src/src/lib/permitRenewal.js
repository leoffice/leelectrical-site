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
 * Fields for createJob — Levi Tester as customer, Hampton content on the invoice.
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
  return {
    customer: LEVI_TESTER.customer,
    businessName: LEVI_TESTER.customer,
    personName: LEVI_TESTER.customer,
    email: LEVI_TESTER.email,
    phone: "",
    title: `City electrical permit renewal — ${sc.permitNo}`,
    description:
      `Mock Phase A renew for ${sc.displayCustomer} · ${sc.address} · ${sc.permitNo}. ` +
      `Invoice to Levi Tester only — not the real customer.`,
    address: sc.address,
    serviceAddress: sc.address,
    billingAddress: sc.address,
    amount,
    invoiceNo,
    invoiceLines: lines,
  };
}

/** Patch applied after createJob so renew metadata survives. */
export function buildPermitRenewMetaPatch(scenario = PHASE_A_HAMPTON_SCENARIO, fee) {
  const sc = scenario || PHASE_A_HAMPTON_SCENARIO;
  const amount = fee != null ? parseAmount(fee) || PERMIT_RENEW_FEE : renewFeeFromScenario(sc);
  return {
    openBalance: amount,
    _invoiceConfirmed: true,
    email: LEVI_TESTER.email,
    permitRenew: {
      mock: true,
      phase: "A",
      scenarioId: sc.id || "hampton-yossi",
      displayCustomer: sc.displayCustomer,
      address: sc.address,
      permitNo: sc.permitNo,
      issuedDate: sc.issuedDate,
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
 * Customer-style email: address + permit details + CTA "Update or Renew Permit".
 * Greeting uses display name (Yossi); send-to is always Levi Tester.
 */
export function buildPermitRenewEmail({
  scenario = PHASE_A_HAMPTON_SCENARIO,
  fee,
  payUrl = "",
  invoiceNo = "",
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
  const subject = inv
    ? `Update or renew your city permit — invoice #${inv} — ${company}`
    : `Update or renew your city permit — ${sc.address} — ${company}`;

  const lines = [
    `Hi ${sc.greetingName || sc.displayCustomer || "there"},`,
    "",
    `This is a reminder about the city electrical permit for:`,
    "",
    `  Address: ${sc.address}`,
    `  Permit: ${sc.permitNo}`,
    sc.issuedDate ? `  Issued: ${sc.issuedDate}` : null,
    `  Renew fee: ${feeStr}`,
    "",
    "Your permit year is coming up. You can update or renew through us — we handle the city filing after payment.",
    "",
    inv ? `Invoice #${inv} is ready to view and pay online.` : "Your renew invoice is ready to view and pay online.",
    "",
    "Update or Renew Permit:",
    payUrl || "(payment link)",
    "",
    "That link opens your invoice page — pay there when you're ready.",
    "",
    "Questions? Reply to this email or call us anytime.",
    "",
    "Thank you,",
    company,
    activeTenantConfig().profile?.website || "",
  ].filter((ln) => ln != null);

  return {
    subject,
    body: lines.join("\n"),
    to: LEVI_TESTER.email,
    ctaLabel: "Update or Renew Permit",
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
