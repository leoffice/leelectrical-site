/**
 * Customer-fill intake for the Con Edison application (S27).
 *
 * The office picks the meters, then either fills the form themselves or sends
 * the customer a personal fill link (/app/coned/apply.html). This module is
 * the app side of that loop: create the request (server emails the link),
 * check for submissions, and map the customer page's answers onto the in-app
 * conedFormA answer keys so the office can review/continue in the same sheet.
 */
import { functionsBase } from "../functionsBase.js";
import { authHeader } from "../session.js";

const s = (v) => (v == null ? "" : String(v).trim());

/** Meter prefill suggestion for the start sheet (fill-then-correct). */
export function suggestMeters(job = {}) {
  const name = s(job.customer || job.customerName || job.personName);
  return [{ name: name || "Meter 1", unit: "" }];
}

/** Prefill payload for the customer link, from the job. */
export function intakePrefillFromJob(job = {}) {
  const addr = s(job.serviceAddress || job.address);
  // "555 Kingston Avenue, Brooklyn NY 11225" — keep the street; city/zip best-effort.
  const street = addr.split(",")[0] || addr;
  const zip = (addr.match(/\b(\d{5})(?:-\d{4})?\b\s*$/) || [])[1] || "";
  const cityMatch = addr.match(/,\s*([^,]+?)\s*(?:,\s*NY|NY)?\s*\d{5}/i);
  return {
    customer: s(job.customer || job.customerName),
    serviceStreet: s(street),
    serviceCity: s(cityMatch?.[1]) || "Brooklyn",
    serviceState: "NY",
    serviceZip: zip,
    phone: s(job.phone),
    email: s(job.email || job.customerEmail),
  };
}

/**
 * Register a customer-fill request; the server builds the personal link and
 * (when the customer has an email) sends the branded link email.
 */
export async function requestCustomerFill({
  job = {},
  meters = [],
  to = "",
  sendEmail = true,
  base = functionsBase,
} = {}) {
  try {
    const res = await fetch(`${base()}/coned-intake`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({
        op: "request",
        jobId: s(job.id || job.jobId),
        prefill: intakePrefillFromJob(job),
        meters: (meters || []).map((m) => ({
          name: s(m.name),
          ...(s(m.unit) ? { unit: s(m.unit) } : {}),
          ...(s(m.account) ? { account: s(m.account) } : {}),
          ...(m.type ? { type: m.type } : {}),
        })),
        to: s(to || job.email || job.customerEmail),
        sendEmail: sendEmail !== false,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || `intake HTTP ${res.status}` };
    }
    return {
      ok: true,
      token: data.token || "",
      link: data.link || "",
      emailed: !!data.emailed?.ok,
      emailError: data.emailed?.ok ? "" : data.emailed?.error || data.emailed?.reason || "",
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/** Poll for a customer submission on this job. */
export async function checkCustomerIntake(jobId, { base = functionsBase } = {}) {
  try {
    const res = await fetch(`${base()}/coned-intake`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ op: "check", jobId: s(jobId) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || `intake HTTP ${res.status}` };
    }
    return { ok: true, request: data.request || null, submission: data.submission || null };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/**
 * Map the customer page's per-meter answers (apply.html keys) onto the in-app
 * conedFormA answer keys, so "review & finish" opens the normal sheet with the
 * customer's data in place. Only maps what the customer page collects; the
 * office reviews and completes the rest.
 */
export function mapIntakeAnswersToConed(intake = {}, job = {}) {
  const a = intake && typeof intake === "object" ? intake : {};
  const street = s(a.serviceStreet) || s(job.serviceAddress || job.address);
  const unit = s(a.unit);
  const out = {
    accountName: s(a.accountName) || s(job.customer),
    customerType: a.customerType === "Commercial" ? "Commercial" : "Residential",
    serviceAddress: street,
    serviceUnit: unit,
    serviceCity: s(a.serviceCity),
    serviceZip: s(a.serviceZip),
    // Billing mirrors service on the customer page (mailing handled below).
    serviceSameAsBilling: true,
    billingAddress: street,
    billingUnit: unit,
    billingCity: s(a.serviceCity),
    billingZip: s(a.serviceZip),
    mailingSame: a.mailingSame !== false,
    phone: s(a.phone),
    email: s(a.email),
    controlsAccess: a.accessOk !== false,
    servicesRequested: ["Electric"],
    submittedByName: s(a.printName) || s(a.signName) || s(a.accountName),
    affiliation: s(a.signAffil) || "Owner",
    signatureName: s(a.signName) || s(a.printName),
    signatureDate: s(a.signDate),
  };
  if (a.mailingSame === false) {
    out.mailingAddress = s(a.mailStreet);
    out.mailingCity = s(a.mailCity);
    out.mailingZip = s(a.mailZip);
  }
  if (a.accessOk === false) {
    out.accessContactName = s(a.accessName);
    out.accessContactPhone = s(a.accessPhone);
  }
  if (s(a.businessName)) out.businessName = s(a.businessName);
  if (a.taxExempt === true) {
    out.taxStatus = "Exempt";
    if (s(a.taxCert)) out.taxExemptCert = s(a.taxCert);
  }
  if (s(a.signAffilOther)) out.affiliationOther = s(a.signAffilOther);
  return out;
}

/**
 * Turn a checked submission into Con Edison Application tab file records
 * (one per meter), served from the docs store like office-completed files.
 */
export function intakeSubmissionToCompletedFiles(submission, { base = functionsBase } = {}) {
  const meters = submission?.meters && typeof submission.meters === "object" ? submission.meters : {};
  return Object.values(meters)
    .filter((m) => m && m.docKey)
    .map((m) => ({
      name: s(m.filename) || "Con Ed Form A.pdf",
      docKey: m.docKey,
      url: `${base()}/docs?key=${encodeURIComponent(m.docKey)}`,
      meterLabel: s(m.meterLabel),
      personName: s(m.answers?.accountName),
      serviceAddress: s(m.answers?.serviceStreet),
      status: "customer_submitted",
      submittedAt: m.submittedAt || "",
      storeOk: true,
      storeError: "",
      source: "customer_intake",
    }));
}
