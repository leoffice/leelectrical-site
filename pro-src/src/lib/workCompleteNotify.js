/**
 * Work Complete milestone helpers (LEPRO §5 / S20).
 *
 * When DOB NOW emails "Work Complete … status updated to Complete", the city
 * brain advances the permit to signed_off and the §1 bridge marks job Progress
 * Done. This module powers the OPT-IN "Notify customer (work complete + invoice)"
 * action — never auto-sends.
 */

import { activeTenantConfig } from "./tenantBranding.js";

/** True when City/DOB (or Con Ed terminal) has reached signed-off / work complete. */
export function jobHasWorkCompleteMilestone(job) {
  if (!job) return false;
  const permits = Array.isArray(job.permits) ? job.permits : [];
  for (const p of permits) {
    if (!p || !p.currentStage) continue;
    if (
      (p.agency === "city" || p.agency === "dob") &&
      p.currentStage === "signed_off"
    ) {
      return true;
    }
    // Con Ed terminal equivalent (meter on / passed complete)
    if (
      p.agency === "coned" &&
      (p.currentStage === "passed_complete" || p.currentStage === "meter_turn_on")
    ) {
      return true;
    }
  }
  const dobStage = job.paperwork?.dob?.currentStage || "";
  if (dobStage === "signed_off") return true;
  const conedStage = job.paperwork?.coned?.currentStage || "";
  if (conedStage === "passed_complete" || conedStage === "meter_turn_on") return true;
  return false;
}

/** Short first name for greeting. */
function greetName(job) {
  const raw = String(job?.customer || "").trim();
  if (!raw) return "there";
  return raw.split(/\s+/)[0] || "there";
}

/**
 * Friendly customer-facing subject + body for work-complete + invoice.
 * Reuses the same brand voice as payment-link / invoice emails.
 * Attach the invoice PDF via the existing send-doc-email path (caller).
 */
export function buildWorkCompleteCustomerEmail(job = {}) {
  const profile = activeTenantConfig().profile || {};
  const brand = profile.shortName || profile.legalName || "LE Electrical";
  const website = profile.website || "";
  const first = greetName(job);
  const inv = String(job.invoiceNo || "").trim();
  const addr =
    String(job.serviceAddress || job.address || "")
      .split(",")[0]
      .trim() || "";

  const subject = inv
    ? `Work complete + Invoice #${inv} — ${brand}`
    : `Work complete — permit signed off — ${brand}`;

  const lines = [
    `Hi ${first},`,
    "",
    "Great news — the work is officially complete and the permit has been signed off.",
  ];
  if (addr) {
    lines.push(`Job site: ${addr}.`);
  }
  lines.push("");
  if (inv) {
    lines.push(
      `Your invoice #${inv} is attached so you have everything in one place.`,
      ""
    );
  } else {
    lines.push("We've wrapped up the permit paperwork on our end.", "");
  }
  lines.push(
    "Questions? Reply to this email or call us anytime.",
    "",
    "Thank you,",
    brand
  );
  if (website) lines.push(website);

  return {
    subject,
    body: lines.join("\n"),
    kind: "invoice",
    withPay: true,
  };
}

/**
 * Detect DOB Work Complete phrasing in subject/body (mirrors emailInsight + cityPermit).
 * Pure helper for tests / UI badges — not a second classifier.
 */
export function isDobWorkCompleteText(subject = "", body = "") {
  const s = `${subject || ""}\n${body || ""}`.toLowerCase();
  return /\bwork\s+complete\b/.test(s) || /\bstatus\s+updated\s+to\s+complete\b/.test(s);
}
