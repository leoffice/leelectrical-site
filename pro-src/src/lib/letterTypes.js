// Letterhead letter types for LE Pro — grounded in real BLZ sample letters
// (see LEPRO_LETTERS_WHITELABEL_SIGNATURE_SPEC.md + letter-samples/).
// White-label: company/logo/signer always come from tenant profile — never hardcode BLZ in bodies.

/** @typedef {{ id: string, label: string, shortLabel: string, productMatch: RegExp, description: string, letterhead?: 'company'|'personal', photoSlots?: 'none'|'optional-multi', fields: Array<{ key: string, label: string, type?: string, required?: boolean, placeholder?: string, options?: string[] }> }} LetterType */

/** @type {LetterType[]} */
export const LETTER_TYPES = [
  {
    id: "load_letter",
    label: "Load letter",
    shortLabel: "Load",
    letterhead: "company",
    photoSlots: "optional-multi",
    productMatch: /load\s*letter/i,
    description:
      "Amp-probe load test letter (sample: Load Letter 903 Lenox Rd) — not the EV permit package.",
    fields: [
      { key: "county", label: "County of", type: "text", placeholder: "Brooklyn / Kings", required: true },
      { key: "state", label: "State of", type: "text", placeholder: "New York", required: true },
      { key: "address", label: "Property address", type: "text", placeholder: "Street, city, ZIP", required: true },
      {
        key: "scope",
        label: "What was inspected (notes)",
        type: "text",
        placeholder: "electrical sub-panel inspection of the apartment units",
      },
      {
        key: "checkedFor",
        label: "Checked for (notes)",
        type: "text",
        placeholder: "arcing, corrosion, other potential fire hazards",
      },
      { key: "unitCount", label: "# apartments / units tested", type: "text", placeholder: "e.g. apartments" },
      {
        key: "breakerRating",
        label: "Breaker / fuse rating",
        type: "text",
        placeholder: "40Amp double pole fuse per apartment",
        required: true,
      },
      { key: "phaseA", label: "Phase A amps", type: "text", placeholder: "3.72", required: true },
      { key: "phaseB", label: "Phase B amps", type: "text", placeholder: "3.98", required: true },
      { key: "phaseC", label: "Phase C amps (if any)", type: "text", placeholder: "optional" },
      { key: "capacityPct", label: "% of capacity", type: "text", placeholder: "10%–12% (auto or override)" },
      {
        key: "applianceList",
        label: "Loads considered",
        type: "textarea",
        placeholder:
          "Overhead lighting, table/floor lamps, refrigerator, TVs, AC units, small appliances",
      },
      { key: "conclusion", label: "Conclusion override", type: "textarea", placeholder: "Leave blank for standard sufficiency wording" },
    ],
  },
  {
    id: "shared_meter_affidavit",
    label: "Shared-meter affidavit",
    shortLabel: "Shared meter",
    letterhead: "company",
    photoSlots: "optional-multi",
    productMatch: /shared\s*meter|affidavit.*meter|meter.*affidavit/i,
    description: "Statement regarding shared meter correction (samples: Affidavit / 1446 Lincoln Pl).",
    fields: [
      { key: "address", label: "Property address", type: "text", required: true },
      { key: "unit", label: "Apartment / unit", type: "text", placeholder: "Apartment 3A / Apt FL 2", required: true },
      { key: "accountNumber", label: "Con Ed account #", type: "text", placeholder: "optional" },
      { key: "otherMeter", label: "Other meter name", type: "text", placeholder: "e.g. PLP meter" },
      {
        key: "corrective",
        label: "Corrective measures",
        type: "select",
        required: true,
        options: [
          "Reconfigured wiring so this unit's meter only measures this unit",
          "Removed cables incorrectly connected to / running through this meter",
        ],
      },
      {
        key: "currentStatus",
        label: "Current status",
        type: "textarea",
        placeholder: "No longer a shared meter condition…",
      },
    ],
  },
  {
    id: "equipment_safety_inspection",
    label: "Equipment safety inspection",
    shortLabel: "Equip. safety",
    letterhead: "company",
    photoSlots: "optional-multi",
    productMatch: /equipment\s*safety|safety\s*inspection|safety\s*check/i,
    description: "Main metering equipment safety inspection (sample: 5122 Church Ave).",
    fields: [
      { key: "address", label: "Property address", type: "text", required: true },
      {
        key: "equipment",
        label: "Equipment inspected",
        type: "text",
        placeholder: "main metering equipment",
        required: true,
      },
      {
        key: "methods",
        label: "What you did (notes)",
        type: "text",
        placeholder: "visual, operational test, checked integrity, grounding/bonding",
      },
      {
        key: "findings",
        label: "Findings (notes)",
        type: "textarea",
        placeholder: "safe, working fine, no immediate hazards",
      },
      {
        key: "notFound",
        label: "Not found / no issues (notes)",
        type: "text",
        placeholder: "no arcing, no corrosion, no burnt parts, no exposed live wiring",
      },
      {
        key: "condition",
        label: "Condition / age (optional)",
        type: "text",
        placeholder: "older equipment, normal wear, doesn't affect safety",
      },
      {
        key: "necConcern",
        label: "Code note + NEC refs (optional)",
        type: "textarea",
        placeholder: "grounding busbar accessible per NEC 250.68 / 250.64(B)",
      },
      {
        key: "purpose",
        label: "Purpose (optional)",
        type: "text",
        placeholder: "insurance",
      },
      {
        key: "recommendations",
        label: "Recommendations (optional)",
        type: "text",
        placeholder: "nothing urgent, monitor periodically",
      },
    ],
  },
  {
    id: "owner_inspection_request",
    label: "Owner inspection request",
    shortLabel: "Owner inspect",
    letterhead: "personal",
    photoSlots: "none",
    productMatch: /owner\s*inspection|courtesy\s*inspection|inspection\s*request/i,
    description: "Personal letterhead request to NYC DOB to close a permit (sample: 417 Owner Inspection).",
    fields: [
      { key: "ownerName", label: "Owner / manager name", type: "text", required: true },
      { key: "ownerEmail", label: "Owner email", type: "email", required: true },
      { key: "ownerPhone", label: "Owner phone", type: "tel", required: true },
      { key: "permitNumber", label: "Permit / application #", type: "text", required: true, placeholder: "B00273182" },
      { key: "address", label: "Property address", type: "text", required: true },
      {
        key: "contractorReason",
        label: "Why contractor of record is unavailable",
        type: "select",
        required: true,
        options: [
          "has unfortunately passed away",
          "is not responsive",
          "is no longer available to close the permit",
        ],
      },
    ],
  },
  {
    id: "violation_resolution",
    label: "Violation resolution proposal",
    shortLabel: "Violation",
    letterhead: "company",
    photoSlots: "optional-multi",
    productMatch: /violation\s*resolution|ecb\s*violation|nov\s*#/i,
    description: "Proposal for violation resolution & representation (sample: Violation Resolution Agreement).",
    fields: [
      { key: "address", label: "Property address + apt", type: "text", required: true },
      { key: "recipient", label: "Dear (recipient name)", type: "text", required: true },
      { key: "novNumber", label: "NOV #", type: "text", required: true, placeholder: "39161314N" },
      { key: "inspectionDate", label: "Inspection date", type: "date", required: true },
      {
        key: "observedWork",
        label: "What was observed",
        type: "textarea",
        required: true,
        placeholder: "e.g. new BX cables / boxes without permit",
      },
      {
        key: "codeSection",
        label: "Code section",
        type: "text",
        placeholder: "§28-105.1 NYC Admin Code",
      },
      { key: "penalty", label: "Penalty $", type: "text", placeholder: "2500" },
      { key: "fee", label: "Service fee $", type: "text", placeholder: "6000" },
      { key: "firstTimeFee", label: "First-time fee $", type: "text", placeholder: "5000" },
      { key: "depositPct", label: "Deposit %", type: "text", placeholder: "50" },
    ],
  },
  {
    id: "good_standing_request",
    label: "Letter of good standing request",
    shortLabel: "Good standing",
    letterhead: "company",
    photoSlots: "none",
    productMatch: /good\s*standing|certificate\s*of\s*status|certified\s*copy.*filing/i,
    description: "Written request to NYS Dept of State for Certificate of Status (sample: Good Standing letter).",
    fields: [
      {
        key: "variant",
        label: "Request type",
        type: "select",
        required: true,
        options: ["Certificate of Status / Letter of Good Standing", "Certified copy of filing record"],
      },
      { key: "corporationName", label: "Corporation name", type: "text", required: true },
      { key: "tin", label: "TIN / DOS ID", type: "text", required: true, placeholder: "11-2776676" },
      {
        key: "processingType",
        label: "Processing",
        type: "select",
        options: ["Expedited", "Standard"],
      },
      {
        key: "returnAddress",
        label: "Mail certificate to",
        type: "textarea",
        required: true,
        placeholder: "Street, city, state ZIP",
      },
      { key: "emailCopy", label: "Email a copy to", type: "email", placeholder: "Office@LEElectrical.us" },
    ],
  },
  {
    id: "code_compliance_safety_report",
    label: "Code-compliance safety report",
    shortLabel: "Code report",
    letterhead: "company",
    photoSlots: "optional-multi",
    productMatch: /code\s*compliance|safety\s*report|gfci|gfi\b/i,
    description: "Code compliance / occupant safety justification (sample: 334 E 176th Bathroom GFI).",
    fields: [
      { key: "address", label: "Project / address", type: "text", required: true },
      {
        key: "issueTitle",
        label: "Issue title",
        type: "text",
        required: true,
        placeholder: "Bathroom Vanity Light GFCI Protection — Code Compliance and Occupant Safety",
      },
      {
        key: "narrative",
        label: "Issue narrative",
        type: "textarea",
        required: true,
        placeholder: "Why the install is compliant / safe",
      },
      {
        key: "necRefs",
        label: "NEC / NYC references",
        type: "textarea",
        placeholder: "410.10(D), 110.3(B), 210.8(A)(1) + NYC amendments",
      },
    ],
  },
  {
    id: "work_confirmation",
    label: "Work confirmation / compliance",
    shortLabel: "Work confirm",
    letterhead: "company",
    photoSlots: "optional-multi",
    productMatch:
      /work\s*confirmation|confirmation\s*of\s*(completed\s*)?work|compliance\s*letter|insurance\s*compliance|completed\s*work\s*letter/i,
    description:
      "Confirmation of completed work for insurance / compliance (sample: 73-75 Grand Ave exit sign). Work description auto-fills from the job.",
    fields: [
      { key: "address", label: "Property address", type: "text", required: true },
      {
        key: "insured",
        label: "Insured / property owner",
        type: "text",
        placeholder: "The Grand 73 LLC",
        required: true,
      },
      { key: "policyNumber", label: "Policy # (optional)", type: "text", placeholder: "O1017PK000607-00" },
      {
        key: "recommendationRef",
        label: "Recommendation / reference (optional)",
        type: "text",
        placeholder: "Loss Control Recommendation #1",
      },
      { key: "workDate", label: "Date work completed", type: "date" },
      {
        key: "workDescription",
        label: "Work performed (notes)",
        type: "textarea",
        required: true,
        placeholder:
          "installed a new illuminated exit sign with battery backup above the rear exit door, hardwired to the building's electrical system",
      },
    ],
  },
  {
    id: "general",
    label: "General letter",
    shortLabel: "Letter",
    letterhead: "company",
    photoSlots: "optional-multi",
    productMatch: /\bletter\b|letterhead|affidavit/i,
    description: "Freeform professional letter on company letterhead (one-offs).",
    fields: [
      { key: "recipient", label: "Addressed to", type: "text", placeholder: "To Whom It May Concern", required: true },
      { key: "reLine", label: "RE line", type: "text", placeholder: "Subject of the letter" },
      { key: "body", label: "Letter body", type: "textarea", placeholder: "Full letter text", required: true },
    ],
  },
];

/**
 * Match a catalog product / line name to a letter type.
 * More specific types win over general "letter".
 * @param {string} itemName
 * @returns {LetterType | null}
 */
export function matchLetterType(itemName) {
  const name = String(itemName || "").trim();
  if (!name) return null;
  const order = [
    "load_letter",
    "shared_meter_affidavit",
    "equipment_safety_inspection",
    "owner_inspection_request",
    "violation_resolution",
    "good_standing_request",
    "code_compliance_safety_report",
    "work_confirmation",
    "general",
  ];
  for (const id of order) {
    const t = LETTER_TYPES.find((x) => x.id === id);
    if (t && t.productMatch.test(name)) return t;
  }
  return null;
}

/** True when this line item is a letter product that should open the questionnaire. */
export function isLetterProduct(itemName) {
  return !!matchLetterType(itemName);
}

/**
 * Human line for invoice description after letter is filled.
 */
export function letterLineDescription(type, answers, siteAddress = "") {
  const bits = [type.label];
  const site = siteAddress || answers.address || "";
  if (site) bits.push(String(site).trim());
  if (answers.breakerRating) bits.push(answers.breakerRating);
  if (answers.unit) bits.push(answers.unit);
  if (answers.permitNumber) bits.push("Permit " + answers.permitNumber);
  if (answers.novNumber) bits.push("NOV " + answers.novNumber);
  if (answers.issueTitle) bits.push(String(answers.issueTitle).slice(0, 60));
  if (answers.equipment) bits.push(String(answers.equipment).slice(0, 60));
  return bits.filter(Boolean).join(" — ");
}

/* -------------------------------------------------------------------------
 * Invoice line description — Levi 2026-08-10.
 * The one-line summary above reads like an internal note. What the customer
 * sees on the invoice should say, professionally, what the price covers, in a
 * few lines built from the letter TYPE plus the questionnaire's own answers.
 * ---------------------------------------------------------------------- */

/** Lower-case a fragment for mid-sentence use, keeping acronyms intact. */
function mid(s) {
  const t = String(s || "").trim().replace(/[.\s]+$/, "");
  if (!t) return "";
  return /^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

/** Give a noun phrase an article, so "performing an electrical inspection". */
function anArticle(phrase) {
  const p = String(phrase || "").trim().replace(/[.\s]+$/, "");
  if (!p) return "";
  if (/^(a|an|the)\s/i.test(p)) return p;
  return (/^[aeiou]/i.test(p) ? "an " : "a ") + p;
}

/** Unit labels ("Apt 2R", "FL 2") keep their capitalization mid-sentence. */
function unitLabel(s) {
  return String(s || "").trim().replace(/[.\s]+$/, "");
}

/** Past-tense corrective note → gerund, so it reads inside a "includes …" list. */
function asGerund(s) {
  const t = mid(s);
  if (!t) return "";
  return t.replace(
    /^(remov|reconfigur|rewir|correct|replac|reconnect|separat|reroute|isolat)ed\b/i,
    (m, stem) => stem + "ing"
  );
}

/**
 * Inspection-method notes → the standard phrases (same normalization the
 * letter body uses, so the invoice line and the letter agree word-for-word).
 */
export function methodPhrases(raw) {
  const out = [];
  const seen = new Set();
  const add = (p) => {
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  };
  for (const item of String(raw || "").split(/[,;\n]+|\/| and /i)) {
    const t = item.trim();
    if (!t) continue;
    if (/visual/i.test(t)) add("a visual examination");
    else if (/operational|op(?:\s|-)?test/i.test(t)) add("operational testing");
    else if (/integrity/i.test(t)) add("verification of electrical integrity");
    else if (/ground|bond/i.test(t)) add("verification of the grounding and bonding connections");
    else add(mid(t));
  }
  return out;
}

/** Grammar-join already-normalized phrases. */
function joinPhrases(items, conj = "and") {
  const list = (items || []).filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} ${conj} ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, ${conj} ${list[list.length - 1]}`;
}

/** "a, b, and c" from a free-form comma/newline list. */
function listOf(raw, conj = "and") {
  const items = String(raw || "")
    .split(/[,;\n]+/)
    .map((s) => mid(s))
    .filter(Boolean);
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${conj} ${items[items.length - 1]}`;
}

/**
 * Multi-line "what the price includes" blurb for a letter product line.
 *
 * @param {LetterType} type
 * @param {Record<string,string>} answers questionnaire answers
 * @param {string} [siteAddress]
 * @returns {string} newline-separated lines (3+ for the main letter types)
 */
export function letterInvoiceDescription(type, answers = {}, siteAddress = "") {
  const a = answers || {};
  const site = String(siteAddress || a.address || "").trim();
  const at = site ? ` at ${site}` : "";
  const lines = [];

  if (type?.id === "load_letter") {
    const device = a.breakerRating ? mid(a.breakerRating) : "the protective device";
    lines.push(
      `Electrical load test and signed Load Letter${at}.`,
      `Price includes performing ${anArticle(mid(a.scope || "electrical sub-panel inspection of the apartment units"))}, ` +
        `inspecting the panels for ${listOf(a.checkedFor || "arcing, corrosion, other potential fire hazards")}, ` +
        `and completing a load test of the service buses.`,
      `Amp-probe readings are taken at the ${device} and evaluated against its rated capacity.`,
      "Includes preparation of the signed load letter on company letterhead for submission to the utility or agency."
    );
  } else if (type?.id === "equipment_safety_inspection") {
    lines.push(
      `Equipment safety inspection and signed report${at}.`,
      `Price includes performing a safety inspection of ${anArticle(mid(a.equipment || "main metering equipment")).replace(/^an? /, "the ")}, ` +
        `${joinPhrases(methodPhrases(a.methods || "visual, operational test, integrity")) || "a visual examination"}, ` +
        `and testing for corrosion, overheating, and wear.`,
      "Includes documenting the findings and submitting the required paperwork on company letterhead."
    );
    if (a.necConcern) {
      lines.push("Includes code-compliance review and the applicable NEC references for the equipment as installed.");
    }
  } else if (type?.id === "shared_meter_affidavit") {
    const unit = a.unit ? unitLabel(a.unit) : "the affected unit";
    lines.push(
      `Shared-meter correction and signed affidavit${at}${a.unit ? ` (${a.unit})` : ""}.`,
      `Price includes inspecting the metering and wiring serving ${unit}, ` +
        `${asGerund(a.corrective) || "correcting the shared meter condition"}, ` +
        "and verifying that only the lines dedicated to that unit remain connected.",
      "Includes preparation of the signed affidavit on company letterhead for submission to Con Edison."
    );
    if (a.accountNumber) lines.push(`Con Edison account ${a.accountNumber}.`);
  } else if (type?.id === "violation_resolution") {
    lines.push(
      `Violation resolution and representation${at}.`,
      `Price includes reviewing the violation${a.novNumber ? ` (NOV #${a.novNumber})` : ""}, ` +
        "filing the electrical permit covering the work performed, and coordinating with the Department of Buildings.",
      "Includes preparation of the required paperwork and representation through hearing and certificate of correction."
    );
  } else if (type?.id === "good_standing_request") {
    lines.push(
      `${a.variant || "Certificate of Status / Letter of Good Standing"} request.`,
      "Price includes preparing and submitting the written request to the NYS Department of State with the required corporation details.",
      "Includes processing, follow-up, and delivery of the returned certificate."
    );
  } else if (type?.id === "code_compliance_safety_report") {
    lines.push(
      `Code-compliance safety report${at}.`,
      `Price includes reviewing the installation${a.issueTitle ? ` (${mid(a.issueTitle)})` : ""}, ` +
        "verifying compliance with the applicable code sections, and assessing occupant safety.",
      "Includes preparation of the signed report on company letterhead with the supporting code references."
    );
  } else if (type?.id === "work_confirmation") {
    lines.push(
      `Work confirmation / compliance letter${at}.`,
      "Price includes preparing the signed confirmation-of-completed-work letter on company letterhead, describing the work performed" +
        (a.policyNumber || a.recommendationRef
          ? " with the insurance policy and recommendation references"
          : "") +
        ".",
      "Includes review, signature, and delivery of the finished document for submission to the insurance carrier or agency."
    );
  } else if (type?.id === "owner_inspection_request") {
    lines.push(
      `Owner inspection request${a.permitNumber ? ` for permit ${a.permitNumber}` : ""}${at}.`,
      "Price includes preparing the written request to the NYC Department of Buildings and coordinating the courtesy inspection appointment.",
      "Includes attendance by a licensed electrician at the scheduled inspection."
    );
  } else {
    lines.push(
      `${type?.label || "Letter"}${at}.`,
      "Price includes preparing the letter on company letterhead with the details supplied for this property.",
      "Includes review, signature, and delivery of the finished document."
    );
  }

  if (Array.isArray(a._photos) && a._photos.length) {
    lines.push("Includes site photographs documenting the observed conditions.");
  }

  return lines.filter(Boolean).join("\n");
}

/**
 * Work-description seed for the work-confirmation letter — "the description of
 * the work for the letter takes the information from what's being filled in."
 * Pulls the line descriptions already written on the job's invoice / estimate
 * (same source order the pay page uses), skipping the letter product lines
 * themselves; falls back to the job title.
 */
export function jobWorkDescriptionSeed(job = {}) {
  const lineSets = [job?.changeOrderLines, job?.invoiceLines, job?.items, job?.estimateLines];
  const parts = [];
  for (const set of lineSets) {
    if (!Array.isArray(set) || !set.length) continue;
    for (const ln of set) {
      const itemName = String(ln?.itemName || ln?.item || "");
      if (itemName && matchLetterType(itemName)) continue; // the letter line is not the work
      const d = String(ln?.description || itemName || "").trim();
      if (d && !parts.includes(d)) parts.push(d);
    }
    if (parts.length) break;
  }
  if (parts.length) return parts.join("\n").slice(0, 2000);
  return String(job?.title || "").trim();
}

/** Empty answers map for a type. */
export function emptyLetterAnswers(type) {
  const out = {};
  for (const f of type?.fields || []) out[f.key] = "";
  return out;
}

/**
 * Seed answers from job + tenant profile context.
 * @param {object} job
 * @param {LetterType} type
 * @param {object} [profile] tenant profile
 */
export function seedLetterAnswersFromJob(job = {}, type, profile = null) {
  const answers = emptyLetterAnswers(type);
  const site =
    [job.serviceAddress || job.address, job.apartment ? "Apt " + job.apartment : ""]
      .filter(Boolean)
      .join(", ") || "";
  const owner = job.personName || job.customer || job.businessName || "";

  if (answers.address !== undefined && site) answers.address = site;
  if (answers.ownerName !== undefined && owner) answers.ownerName = owner;
  if (answers.recipient !== undefined && !answers.recipient) {
    if (type.id === "general") answers.recipient = "To Whom It May Concern";
  }

  if (profile) {
    if (answers.county !== undefined && profile.county) answers.county = profile.county;
    if (answers.state !== undefined && (profile.state || "New York")) {
      answers.state = profile.state === "NY" ? "New York" : profile.state || "New York";
    }
    if (answers.corporationName !== undefined) {
      answers.corporationName = profile.companyName || answers.corporationName;
    }
    if (answers.tin !== undefined && profile.ein) answers.tin = profile.ein;
    if (answers.emailCopy !== undefined && profile.email) answers.emailCopy = profile.email;
    if (type.id === "owner_inspection_request") {
      const owners = Array.isArray(profile.owners) ? profile.owners : [];
      const def = owners.find((o) => o.isDefaultSigner) || owners[0];
      if (def) {
        if (!answers.ownerName) answers.ownerName = def.fullName || "";
        if (!answers.ownerEmail) answers.ownerEmail = def.personalEmail || profile.email || "";
        if (!answers.ownerPhone) answers.ownerPhone = def.personalPhone || profile.phone || "";
      }
    }
  }

  if (type.id === "load_letter") {
    if (!answers.applianceList) {
      answers.applianceList =
        "overhead lighting, table and floor lamps, refrigerators, televisions, AC units, small appliances";
    }
    if (!answers.state) answers.state = "New York";
    if (answers.scope !== undefined && !answers.scope) {
      answers.scope = "electrical sub-panel inspection of the apartment units";
    }
    if (answers.checkedFor !== undefined && !answers.checkedFor) {
      answers.checkedFor = "arcing, corrosion, other potential fire hazards";
    }
  }
  if (type.id === "equipment_safety_inspection" && answers.methods !== undefined && !answers.methods) {
    answers.methods = "visual, operational test, checked integrity, grounding/bonding";
  }
  if (type.id === "equipment_safety_inspection" && answers.notFound !== undefined && !answers.notFound) {
    answers.notFound = "no arcing, no corrosion, no burnt parts, no exposed live wiring";
  }
  if (type.id === "equipment_safety_inspection" && !answers.equipment) {
    answers.equipment = "main metering equipment";
  }
  if (type.id === "equipment_safety_inspection" && !answers.findings) {
    answers.findings =
      "The equipment was found to be in safe working condition with no immediate hazards observed.";
  }
  if (type.id === "good_standing_request" && !answers.variant) {
    answers.variant = "Certificate of Status / Letter of Good Standing";
  }
  if (type.id === "good_standing_request" && !answers.processingType) {
    answers.processingType = "Expedited";
  }
  if (type.id === "shared_meter_affidavit" && !answers.corrective) {
    answers.corrective = "Reconfigured wiring so this unit's meter only measures this unit";
  }
  if (type.id === "work_confirmation") {
    // Auto-populate the letter's work description from what's already filled
    // in on the job (invoice / estimate line descriptions, then job title).
    if (!answers.workDescription) {
      answers.workDescription = jobWorkDescriptionSeed(job);
    }
    if (!answers.insured) {
      answers.insured = job.businessName || job.customer || job.personName || "";
    }
  }

  return answers;
}
