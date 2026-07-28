// Letter drafts linked to invoice lines — generate body, approve, attach on send.
import {
  LETTER_TYPES,
  emptyLetterAnswers,
  isLetterProduct,
  letterLineDescription,
  matchLetterType,
  seedLetterAnswersFromJob,
} from "./letterTypes.js";
import { tenantCompany, tenantShortName } from "./tenantBranding.js";

export { LETTER_TYPES, isLetterProduct, matchLetterType, letterLineDescription, emptyLetterAnswers, seedLetterAnswersFromJob };

/**
 * @typedef {object} LetterDraft
 * @property {string} id
 * @property {string} typeId
 * @property {string} typeLabel
 * @property {number} lineIndex
 * @property {string} itemName
 * @property {string} siteAddress
 * @property {string} customerName
 * @property {Record<string, string>} answers
 * @property {Array<{ id: string, name: string, url: string, mime?: string }>} photos
 * @property {"draft"|"approved"} status
 * @property {string} bodyText
 * @property {string} reLine
 * @property {number} updatedAt
 */

export function newLetterId() {
  return "letter-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
}

/**
 * Build professional letter body from type + answers + job context.
 * Templates are starting points — refined when sample letters arrive.
 */
export function buildLetterBody(type, answers = {}, job = {}) {
  const site =
    [job.serviceAddress || job.address, job.apartment ? "Apt " + job.apartment : ""]
      .filter(Boolean)
      .join(", ") || "the premises";
  const company = tenantShortName() || tenantCompany().name || "our firm";
  const a = answers || {};

  if (type.id === "load_letter") {
    const parts = [
      `This letter is submitted regarding electrical load at ${site}.`,
      a.ownerName ? `Property owner: ${a.ownerName}.` : "",
      a.blockLot ? `Block/lot: ${a.blockLot}.` : "",
      a.existingService ? `1. Existing service: ${a.existingService}.` : "1. Existing service: [to be confirmed].",
      a.proposedWork ? `2. Proposed installation: ${a.proposedWork}.` : "2. Proposed installation: [to be confirmed].",
      a.newEquipment ? `3. New equipment: ${a.newEquipment}.` : "",
      a.loadCalcNotes ? `4. Load calculation: ${a.loadCalcNotes}.` : "4. Load calculation: See attached notes / field measurements.",
      a.testResults ? `5. Test results: ${a.testResults}.` : "",
      a.conclusion
        ? `6. Conclusion: ${a.conclusion}`
        : `6. Conclusion: Based on the information above, ${company} finds the service adequate for the proposed work, subject to final field verification and applicable code.`,
      a.attachmentsNote ? `Attachments: ${a.attachmentsNote}.` : "",
      "Please contact us with any questions.",
    ];
    return parts.filter(Boolean).join("\n\n");
  }

  if (type.id === "safety") {
    return [
      `This safety letter concerns electrical conditions at ${site}.`,
      a.scope ? `Scope: ${a.scope}` : "",
      a.findings ? `Findings: ${a.findings}` : "",
      a.corrective ? `Corrective actions: ${a.corrective}` : "",
      a.conclusion
        ? `Conclusion: ${a.conclusion}`
        : `Conclusion: Based on the inspection described, ${company} reports the electrical work reviewed is consistent with applicable safety standards for the stated use.`,
      "Please contact us with any questions.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (type.id === "equipment_safety") {
    return [
      `This equipment safety check letter is for equipment at ${site}.`,
      a.equipment ? `Equipment: ${a.equipment}` : "",
      a.checksPerformed ? `Checks performed: ${a.checksPerformed}` : "",
      a.results ? `Results: ${a.results}` : "",
      a.recommendations ? `Recommendations: ${a.recommendations}` : "",
      a.conclusion
        ? `Conclusion: ${a.conclusion}`
        : `Conclusion: The equipment listed was checked as described and is cleared for the intended use, subject to normal maintenance.`,
      "Please contact us with any questions.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (type.id === "affidavit") {
    return [
      `I, a representative of ${company}, affirm the following regarding ${site}:`,
      a.statement || "[Statement of facts]",
      a.notaryNote ? `Notary / witness: ${a.notaryNote}` : "",
      "I declare that the foregoing is true and correct to the best of my knowledge.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  // general
  if (a.body) return String(a.body).trim();
  return `Regarding ${site}.\n\n[Letter body]`;
}

export function defaultReLine(type, job = {}, answers = {}) {
  if (answers.reLine) return answers.reLine;
  const site = job.serviceAddress || job.address || "";
  const label = type?.label || "Letter";
  return site ? `${label} — ${site}` : label;
}

/**
 * Create a new draft for a line item + job.
 * @returns {LetterDraft}
 */
export function createLetterDraft({ type, job = {}, lineIndex = 0, itemName = "", answers, photos = [] } = {}) {
  const t = type || matchLetterType(itemName) || LETTER_TYPES.find((x) => x.id === "general");
  const ans = answers || seedLetterAnswersFromJob(job, t);
  const bodyText = buildLetterBody(t, ans, job);
  const site = [job.serviceAddress || job.address, job.apartment ? "Apt " + job.apartment : ""]
    .filter(Boolean)
    .join(", ");
  return {
    id: newLetterId(),
    typeId: t.id,
    typeLabel: t.label,
    lineIndex,
    itemName: itemName || t.label,
    siteAddress: site,
    customerName: job.customer || job.businessName || "",
    answers: ans,
    photos: photos || [],
    status: "draft",
    bodyText,
    reLine: defaultReLine(t, job, ans),
    updatedAt: Date.now(),
  };
}

/** Rebuild body + description fields after questionnaire edit. */
export function refreshLetterDraft(draft, { answers, photos, status, bodyText, reLine, job } = {}) {
  const type = LETTER_TYPES.find((t) => t.id === draft.typeId) || LETTER_TYPES.find((t) => t.id === "general");
  const nextAnswers = answers != null ? answers : draft.answers;
  const j = job || {
    serviceAddress: draft.siteAddress,
    customer: draft.customerName,
    businessName: draft.customerName,
  };
  return {
    ...draft,
    answers: nextAnswers,
    photos: photos != null ? photos : draft.photos,
    status: status || draft.status,
    bodyText: bodyText != null ? bodyText : buildLetterBody(type, nextAnswers, j),
    reLine: reLine != null ? reLine : defaultReLine(type, j, nextAnswers),
    updatedAt: Date.now(),
  };
}

/** Required fields filled? */
export function letterDraftReady(draft) {
  const type = LETTER_TYPES.find((t) => t.id === draft?.typeId);
  if (!type) return false;
  for (const f of type.fields) {
    if (f.required && !String(draft.answers?.[f.key] || "").trim()) return false;
  }
  return !!(draft.bodyText || "").trim();
}

/**
 * Attachment record for invoice email / job store.
 * @param {LetterDraft} draft
 * @param {{ url: string, name?: string }} file
 */
export function letterAttachmentFromUpload(draft, file) {
  const safeType = String(draft.typeLabel || "Letter").replace(/[^\w\s.-]+/g, "").trim() || "Letter";
  const name = file.name || `${safeType}.pdf`;
  return {
    id: draft.id,
    name,
    url: file.url,
    mime: file.mime || "application/pdf",
    attachToEmail: true,
    letterId: draft.id,
    letterType: draft.typeId,
    letterStatus: draft.status,
  };
}

/** Collect letter drafts from job (if any). */
export function jobLetterDrafts(job) {
  const list = job?.letterDrafts;
  return Array.isArray(list) ? list : [];
}

/** Merge / upsert one draft on a job patch. */
export function upsertJobLetterDraft(job, draft) {
  const prev = jobLetterDrafts(job);
  const i = prev.findIndex((d) => d.id === draft.id || (d.lineIndex === draft.lineIndex && d.typeId === draft.typeId));
  const next = prev.slice();
  if (i >= 0) next[i] = draft;
  else next.push(draft);
  return next;
}
