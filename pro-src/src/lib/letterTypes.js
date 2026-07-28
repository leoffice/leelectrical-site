// Letterhead letter types for LE Pro — product match + questionnaire fields.
// Perfected over time from real sample letters dropped in letter-samples/.

/** @typedef {{ id: string, label: string, shortLabel: string, productMatch: RegExp, description: string, fields: Array<{ key: string, label: string, type?: string, required?: boolean, placeholder?: string, options?: string[] }> }} LetterType */

/** @type {LetterType[]} */
export const LETTER_TYPES = [
  {
    id: "load_letter",
    label: "Load letter",
    shortLabel: "Load",
    productMatch: /load\s*letter/i,
    description: "Electrical load calculation letter for utility / DOB / AHJ.",
    fields: [
      { key: "recipient", label: "Addressed to", type: "text", placeholder: "Electrical Subcode Official / utility", required: true },
      { key: "recipientOffice", label: "Office / municipality", type: "text", placeholder: "e.g. Brooklyn Borough, Con Edison" },
      { key: "ownerName", label: "Property owner", type: "text", placeholder: "Owner of record" },
      { key: "blockLot", label: "Block / lot", type: "text", placeholder: "Block · Lot" },
      { key: "existingService", label: "Existing service", type: "text", placeholder: "e.g. 200 A, 1Ø, 120/240 V", required: true },
      { key: "proposedWork", label: "Proposed work", type: "textarea", placeholder: "What is being added or changed", required: true },
      { key: "newEquipment", label: "New equipment", type: "textarea", placeholder: "Panels, chargers, breakers, etc." },
      { key: "loadCalcNotes", label: "Load calculation notes", type: "textarea", placeholder: "Key numbers, NEC refs, spare capacity" },
      { key: "testResults", label: "Test / measurement results", type: "textarea", placeholder: "Optional meter / load test data" },
      { key: "conclusion", label: "Conclusion", type: "textarea", placeholder: "Service is adequate / recommendation" },
      { key: "attachmentsNote", label: "Attachments listed in letter", type: "text", placeholder: "One-line, cut sheets, photos" },
    ],
  },
  {
    id: "safety",
    label: "Safety letter",
    shortLabel: "Safety",
    productMatch: /\bsafety\b(?!.*equipment)/i,
    description: "General electrical safety / compliance letter.",
    fields: [
      { key: "recipient", label: "Addressed to", type: "text", placeholder: "Insurance / owner / board", required: true },
      { key: "scope", label: "Scope of inspection", type: "textarea", placeholder: "What was reviewed", required: true },
      { key: "findings", label: "Findings", type: "textarea", placeholder: "Conditions observed", required: true },
      { key: "corrective", label: "Corrective actions", type: "textarea", placeholder: "Work performed or recommended" },
      { key: "conclusion", label: "Conclusion", type: "textarea", placeholder: "Safe for occupancy / continued use" },
    ],
  },
  {
    id: "equipment_safety",
    label: "Equipment safety check",
    shortLabel: "Equip. safety",
    productMatch: /equipment\s*safety|safety\s*check/i,
    description: "Equipment safety check / verification letter.",
    fields: [
      { key: "recipient", label: "Addressed to", type: "text", placeholder: "Owner / GC / facility manager", required: true },
      { key: "equipment", label: "Equipment checked", type: "textarea", placeholder: "Make, model, location", required: true },
      { key: "checksPerformed", label: "Checks performed", type: "textarea", placeholder: "Tests and visual inspections", required: true },
      { key: "results", label: "Results", type: "textarea", placeholder: "Pass / fail / notes", required: true },
      { key: "recommendations", label: "Recommendations", type: "textarea", placeholder: "Follow-up items if any" },
      { key: "conclusion", label: "Conclusion", type: "textarea", placeholder: "Cleared for use / limited use" },
    ],
  },
  {
    id: "affidavit",
    label: "Affidavit",
    shortLabel: "Affidavit",
    productMatch: /affidavit/i,
    description: "Sworn statement on company letterhead.",
    fields: [
      { key: "recipient", label: "Addressed to / for", type: "text", placeholder: "Agency or purpose", required: true },
      { key: "statement", label: "Statement body", type: "textarea", placeholder: "Facts being affirmed", required: true },
      { key: "notaryNote", label: "Notary / witness notes", type: "text", placeholder: "Optional" },
    ],
  },
  {
    id: "general",
    label: "General letter",
    shortLabel: "Letter",
    productMatch: /\bletter\b|letterhead/i,
    description: "Freeform professional letter on company letterhead.",
    fields: [
      { key: "recipient", label: "Addressed to", type: "text", placeholder: "Name or office", required: true },
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
  // Prefer specific ids before general letter
  const order = ["load_letter", "equipment_safety", "safety", "affidavit", "general"];
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
 * @param {LetterType} type
 * @param {Record<string, string>} answers
 * @param {string} siteAddress
 */
export function letterLineDescription(type, answers, siteAddress = "") {
  const bits = [type.label];
  if (siteAddress) bits.push(String(siteAddress).trim());
  if (answers.existingService) bits.push(answers.existingService);
  if (answers.proposedWork) bits.push(String(answers.proposedWork).slice(0, 80));
  if (answers.equipment) bits.push(String(answers.equipment).slice(0, 80));
  if (answers.scope) bits.push(String(answers.scope).slice(0, 80));
  return bits.filter(Boolean).join(" — ");
}

/** Empty answers map for a type. */
export function emptyLetterAnswers(type) {
  const out = {};
  for (const f of type?.fields || []) out[f.key] = "";
  return out;
}

/**
 * Seed answers from job context (address, customer, owner).
 * @param {object} job
 * @param {LetterType} type
 */
export function seedLetterAnswersFromJob(job = {}, type) {
  const answers = emptyLetterAnswers(type);
  const owner = job.personName || job.customer || job.businessName || "";
  if (answers.ownerName !== undefined && owner) answers.ownerName = owner;
  if (answers.recipient !== undefined && !answers.recipient) {
    if (type.id === "load_letter") answers.recipient = "Electrical Subcode Official";
    else if (type.id === "safety") answers.recipient = "To Whom It May Concern";
  }
  return answers;
}
