// Polish rough notes into professional electrical work descriptions (estimates, invoices, job scope).

export const WORK_DESCRIPTION_STYLES = [
  { key: "professional", label: "Professional scope", emoji: "💼" },
  { key: "commercial", label: "Commercial bid", emoji: "🏢" },
  { key: "breakdown", label: "Break it down", emoji: "📋" },
  { key: "brief", label: "Brief summary", emoji: "✂️" },
  { key: "detailed", label: "Detailed scope", emoji: "📐" },
  { key: "permit", label: "Permit-ready", emoji: "📄" },
  { key: "customer", label: "Customer-friendly", emoji: "🤝" },
  { key: "insurance", label: "Inspection report", emoji: "🔍" },
  { key: "estimate", label: "Estimate-ready", emoji: "📝" },
  { key: "invoice", label: "Invoice narrative", emoji: "🧾" },
];

function clean(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function punctuate(part) {
  const p = clean(part);
  if (!p) return "";
  return p.endsWith(".") ? p : p + ".";
}

/** Join scope parts on separate lines — never one long dotted sentence. */
function lines(parts) {
  return parts
    .map((p) => {
      const chunk = String(p || "").trim();
      if (!chunk) return "";
      if (chunk.includes("\n")) return chunk;
      return punctuate(chunk);
    })
    .filter(Boolean)
    .join("\n");
}

function bulletize(raw) {
  const chunks = String(raw || "")
    .split(/[\n;•]+|(?:\s+and\s+)/i)
    .map((c) => clean(c))
    .filter((c) => c.length > 2);
  if (chunks.length < 2) return null;
  return chunks.map((c) => "• " + punctuate(c)).join("\n");
}

/** Core work notes — bullets when splittable, otherwise one line. */
function workBody(raw) {
  const bullets = bulletize(raw);
  if (bullets) return bullets;
  const t = clean(raw);
  if (!t) return "";
  return punctuate(t);
}

/** True when a service/billing address is in New Jersey. */
export function addressInNewJersey(addr) {
  const s = String(addr || "").trim();
  if (!s) return false;
  return (
    /\bnew\s+jersey\b/i.test(s) ||
    /,\s*NJ\b(?:\s+\d{5}(?:-\d{4})?)?/i.test(s) ||
    /\bNJ\s+\d{5}(?:-\d{4})?\b/i.test(s)
  );
}

function addressInNewYork(addr) {
  const s = String(addr || "").trim();
  if (!s) return false;
  return (
    /\bnew\s+york\b/i.test(s) ||
    /,\s*NY\b(?:\s+\d{5}(?:-\d{4})?)?/i.test(s) ||
    /\bNY\s+\d{5}(?:-\d{4})?\b/i.test(s) ||
    /\b(brooklyn|queens|manhattan|bronx|staten\s+island)\b/i.test(s)
  );
}

function codeComplianceLine(addr) {
  if (addressInNewJersey(addr)) {
    return "Scope includes labor, materials coordination, and code-compliant installation per NJ requirements";
  }
  if (addressInNewYork(addr)) {
    return "Scope includes labor, materials coordination, and code-compliant installation per NYC requirements";
  }
  return "Scope includes labor, materials coordination, and code-compliant installation per applicable local code";
}

function permitLine(addr) {
  if (addressInNewJersey(addr)) {
    return "Work to be performed under applicable NJ / local permits as required";
  }
  if (addressInNewYork(addr)) {
    return "Work to be performed under applicable NYC DOB / local permits as required";
  }
  return "Work to be performed under applicable local permits as required";
}

/** NEC + local code affirmation — customer-facing, no company name. */
function necComplianceLine(addr) {
  if (addressInNewJersey(addr)) {
    return "Work performed in accordance with NEC and applicable NJ / local code requirements";
  }
  if (addressInNewYork(addr)) {
    return "Work performed in accordance with NEC and applicable NYC / local code requirements";
  }
  return "Work performed in accordance with NEC and applicable local code requirements";
}

/** Rewrite draft text for a work-description field. */
export function polishWorkDescription(raw, styleKey = "professional", ctx = {}) {
  const text = clean(raw);
  if (!text) return "";
  const job = ctx.jobTitle || ctx.serviceType || "";
  const addr = ctx.address || "";
  const lead = job ? `Electrical work at ${job}` : addr ? `Electrical services at ${addr}` : "Electrical services";

  const body = workBody(text);

  switch (styleKey) {
    case "commercial":
      return lines([
        lead,
        body,
        codeComplianceLine(addr),
        "Pricing subject to site conditions and permit requirements",
      ]);
    case "breakdown":
      return lines(["Scope of work:", body.startsWith("•") ? body : "• " + body]);
    case "brief": {
      const summary =
        text.length > 120 ? text.slice(0, 117).replace(/\s+\S*$/, "") + "…" : body;
      return lines(["Summary:", summary]);
    }
    case "detailed":
      return lines([
        lead,
        body,
        "Work performed in accordance with applicable NEC and local code",
        "Includes standard cleanup and owner walkthrough upon completion",
      ]);
    case "permit":
      return lines([
        body,
        permitLine(addr),
        "Includes filing coordination and inspection scheduling where applicable",
      ]);
    case "customer":
      return lines([
        `Hi — here's what we're doing:`,
        body,
        "We'll keep you posted and leave the area clean when we're done",
      ]);
    case "insurance":
      return lines([
        "Inspection / report scope:",
        body,
        "Findings documented per insurer requirements; corrective recommendations provided as applicable",
      ]);
    case "estimate":
      return lines([
        "Proposed scope of work:",
        body,
        "Estimate valid 30 days; final price may adjust after on-site verification",
      ]);
    case "invoice":
      return lines(["Work completed per agreement:", body, "Thank you for your business"]);
    case "professional":
    default:
      return lines([lead + ":", body, necComplianceLine(addr)]);
  }
}