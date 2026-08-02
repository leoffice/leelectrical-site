/**
 * Completed Con Ed Form A file naming (productization §3).
 * Same name for Drive file + customer email attachment + LE Pro tab listing.
 *
 *   <service address> - <apartment / PLP / account name> - <person's name>.pdf
 *
 * Example: "555 Kingston Avenue - PLP - Test 2.pdf"
 */

const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g;

/** Strip illegal filesystem chars, collapse whitespace, trim. */
export function filesystemSafeSegment(raw, maxLen = 80) {
  let s = String(raw == null ? "" : raw)
    .replace(ILLEGAL, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Soften em/en dashes so names stay consistent across email/Drive/tab.
  s = s.replace(/[—–]/g, "-");
  if (s.length > maxLen) s = s.slice(0, maxLen).trim();
  return s;
}

/**
 * Per-meter middle segment: apt / PLP / store / account name.
 * @param {object} opts
 * @param {Record<string, any>} [opts.answers]
 * @param {object} [opts.job]
 * @param {string} [opts.meterLabel] explicit meter label from multi-meter setup
 */
export function resolveConedMeterLabel({ answers = {}, job = {}, meterLabel = "" } = {}) {
  const explicit = filesystemSafeSegment(meterLabel, 40);
  if (explicit) return explicit;

  const unit = filesystemSafeSegment(
    answers.serviceUnit || answers.billingUnit || job.apartment || job.unit || "",
    40
  );
  if (unit) {
    // Normalize common house-meter labels
    if (/^plp$/i.test(unit)) return "PLP";
    return unit;
  }

  const account = filesystemSafeSegment(
    answers.accountName || answers.businessName || job.customer || job.customerName || "",
    40
  );
  return account || "account";
}

/**
 * Build the canonical completed Form A filename (with .pdf).
 * @param {object} opts
 * @param {Record<string, any>} [opts.answers]
 * @param {object} [opts.job]
 * @param {string} [opts.meterLabel]
 * @returns {string}
 */
export function buildConedCompletedFileName({ answers = {}, job = {}, meterLabel = "" } = {}) {
  const a = answers || {};
  const address = filesystemSafeSegment(
    a.serviceAddress ||
      a.billingAddress ||
      job.serviceAddress ||
      job.address ||
      "Service address",
    80
  );
  const middle = resolveConedMeterLabel({ answers: a, job, meterLabel });
  const person = filesystemSafeSegment(
    a.accountName ||
      a.signatureName ||
      a.submittedByName ||
      job.customer ||
      job.customerName ||
      job.personName ||
      "Customer",
    60
  );
  const base = [address, middle, person].filter(Boolean).join(" - ") || "Con-Ed-Form-A";
  const safe = filesystemSafeSegment(base, 180) || "Con-Ed-Form-A";
  return safe.endsWith(".pdf") ? safe : `${safe}.pdf`;
}

/** Subject line for the customer copy of a completed application. */
export function customerConedApplicationSubject(job = {}, answers = {}) {
  const address = filesystemSafeSegment(
    answers.serviceAddress || job.serviceAddress || job.address || "",
    80
  );
  return address
    ? `Your Con Edison application - ${address}`
    : "Your Con Edison application";
}
