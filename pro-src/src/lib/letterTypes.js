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
        key: "findings",
        label: "Findings",
        type: "textarea",
        placeholder: "Safe working condition, no immediate hazards",
      },
      {
        key: "necConcern",
        label: "Optional concern + NEC refs",
        type: "textarea",
        placeholder: "e.g. NEC 250.68 / 250.64(B) grounding busbar accessibility",
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
        "Lighting in the apartments, including use of Overhead Lighting, Table and Floor Lamps, Refrigerator, Televisions, AC Units and other small appliances.";
    }
    if (!answers.state) answers.state = "New York";
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

  return answers;
}
