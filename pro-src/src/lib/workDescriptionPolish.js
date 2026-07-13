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

function sentences(parts) {
  return parts
    .map((p) => clean(p))
    .filter(Boolean)
    .map((p) => (p.endsWith(".") ? p : p + "."))
    .join(" ");
}

function bulletize(raw) {
  const chunks = String(raw || "")
    .split(/[\n;•]+|(?:\s+and\s+)/i)
    .map((c) => clean(c))
    .filter((c) => c.length > 2);
  if (chunks.length < 2) return null;
  return chunks.map((c) => "• " + (c.endsWith(".") ? c : c + ".")).join("\n");
}

/** Rewrite draft text for a work-description field. */
export function polishWorkDescription(raw, styleKey = "professional", ctx = {}) {
  const text = clean(raw);
  if (!text) return "";
  const job = ctx.jobTitle || ctx.serviceType || "";
  const addr = ctx.address || "";
  const lead = job ? `Electrical work at ${job}` : addr ? `Electrical services at ${addr}` : "Electrical services";

  switch (styleKey) {
    case "commercial":
      return sentences([
        lead,
        text,
        "Scope includes labor, materials coordination, and code-compliant installation per NYC/NJ requirements",
        "Pricing subject to site conditions and permit requirements",
      ]);
    case "breakdown": {
      const bullets = bulletize(text);
      if (bullets) return `Scope of work:\n${bullets}`;
      return `Scope of work:\n• ${text}.`;
    }
    case "brief":
      return text.length > 120 ? text.slice(0, 117).replace(/\s+\S*$/, "") + "…" : sentences([text]);
    case "detailed":
      return sentences([
        lead,
        text,
        "Work performed in accordance with applicable NEC and local code",
        "Includes standard cleanup and owner walkthrough upon completion",
      ]);
    case "permit":
      return sentences([
        text,
        "Work to be performed under applicable NYC DOB / local permits as required",
        "Includes filing coordination and inspection scheduling where applicable",
      ]);
    case "customer":
      return sentences([
        `Hi — here's what we're doing: ${text}`,
        "We'll keep you posted and leave the area clean when we're done",
      ]);
    case "insurance":
      return sentences([
        "Inspection / report scope:",
        text,
        "Findings documented per insurer requirements; corrective recommendations provided as applicable",
      ]);
    case "estimate":
      return sentences([
        "Proposed scope of work:",
        text,
        "Estimate valid 30 days; final price may adjust after on-site verification",
      ]);
    case "invoice":
      return sentences(["Work completed per agreement:", text, "Thank you for your business"]);
    case "professional":
    default:
      return sentences([lead + ":", text, "All work performed to code with LE Electrical standard of care"]);
  }
}