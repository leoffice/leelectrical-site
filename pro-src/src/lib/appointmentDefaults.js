// Shared appointment title / notes / reminder defaults (create-appointment skill).
// Keep agent path, Add Appointment sheet, and email auto-schedule aligned.

/** Short calendar title — type + customer; address stays in Location. */
export function jobDefaultSummary(job, { type = "" } = {}) {
  if (!job) return "";
  const cust = (job.businessName || job.customer || job.personName || "").trim();
  const explicit = (type || "").trim().toLowerCase();
  const title = String(job.title || "");
  const siteVisit =
    explicit === "site visit" ||
    explicit === "site_visit" ||
    job.followUp?.type === "site_visit" ||
    job.status?.["Site Visit"]?.s === "done" ||
    job.status?.["Site Visit"]?.s === "pending" ||
    /^site\s*visit/i.test(title);
  const serviceCall =
    explicit === "service call" ||
    explicit === "service_call" ||
    /service\s*call/i.test(title);
  const followUp =
    explicit === "follow-up" ||
    explicit === "follow_up" ||
    /^follow[- ]?up/i.test(title);

  if (siteVisit && cust) return `Site visit — ${cust}`;
  if (serviceCall && cust) return `Service call — ${cust}`;
  if (followUp && cust) return `Follow-up — ${cust}`;
  if (cust && title && title.length <= 48 && !/\//.test(title)) {
    return title.includes(cust) ? title : `${title} — ${cust}`;
  }
  if (cust) return cust;
  return title.slice(0, 48) || "Appointment";
}

/**
 * Structured calendar notes (customer-safe layout).
 * Pricing / QBO ids stay on the job card, not here.
 */
export function jobDefaultNotes(job) {
  if (!job) return "";
  const lines = [];
  const name = (job.personName || job.customer || job.businessName || "").trim();
  if (name) lines.push(`Customer: ${name}`);
  if (job.phone) lines.push(`Phone: ${job.phone}`);
  if (job.email) lines.push(`Email: ${job.email}`);

  const scopeBits = [];
  const desc = String(job.description || "").trim();
  const notes = String(job.notes || "").trim();
  // Prefer short description; strip price $ lines for guest-safety default.
  const clean = (s) =>
    s
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/\$[\d,]/.test(l) && !/\bQBO\s*#/i.test(l) && !/^LE\s+Pro\s+job:/i.test(l) && !/job:\s*local-/i.test(l))
      .slice(0, 8);

  if (desc) scopeBits.push(...clean(desc));
  else if (notes) scopeBits.push(...clean(notes).slice(0, 5));

  if (scopeBits.length) {
    lines.push("");
    lines.push(...scopeBits);
  }
  return lines.join("\n").trim();
}

/** New (non-edit) reminder defaults — site visit 1h; inspection 1h + 1d. */
export function defaultReminders({ inspection = false } = {}) {
  return {
    h1: true,
    d1: !!inspection,
  };
}

/**
 * Guest notify default: inspections on when email known; regular site visits off
 * (Levi turns it on when the customer should get the invite).
 */
export function defaultNotifyCustomer(job, { inspection = false } = {}) {
  if (inspection) return !!(job?.email);
  return false;
}
