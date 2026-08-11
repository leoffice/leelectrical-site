// Letter drafts linked to invoice lines — generate body, approve, attach on send.
// Bodies are grounded in real BLZ sample wording (spec §1) but company/signer
// always come from the tenant profile (white-label).
import {
  LETTER_TYPES,
  emptyLetterAnswers,
  isLetterProduct,
  letterLineDescription,
  matchLetterType,
  seedLetterAnswersFromJob,
} from "./letterTypes.js";
import { tenantCompany, tenantShortName, activeTenantConfig } from "./tenantBranding.js";
import { resolveSigner } from "./signatureService.js";

export { LETTER_TYPES, isLetterProduct, matchLetterType, letterLineDescription, emptyLetterAnswers, seedLetterAnswersFromJob };

/**
 * @typedef {object} LetterDraft
 * @property {string} id
 * @property {string} typeId
 * @property {string} typeLabel
 * @property {string} [letterhead]
 * @property {number} lineIndex
 * @property {string} itemName
 * @property {string} siteAddress
 * @property {string} customerName
 * @property {Record<string, string>} answers
 * @property {Array<{ id: string, name: string, url: string, mime?: string }>} photos
 * @property {"draft"|"approved"} status
 * @property {string} bodyText
 * @property {string} reLine
 * @property {string} [ownerId]
 * @property {number} updatedAt
 */

export function newLetterId() {
  return "letter-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
}

function siteFrom(job, answers) {
  if (answers?.address) return String(answers.address).trim();
  return (
    [job?.serviceAddress || job?.address, job?.apartment ? "Apt " + job.apartment : ""]
      .filter(Boolean)
      .join(", ") || "the premises"
  );
}

function pctCapacity(answers) {
  if (answers.capacityPct) return String(answers.capacityPct).trim();
  const a = parseFloat(answers.phaseA);
  const b = parseFloat(answers.phaseB);
  const rating = parseFloat(String(answers.breakerRating || "").replace(/[^\d.]/g, ""));
  if (!rating || (!a && !b)) return "";
  const avg = ((a || 0) + (b || 0)) / (a && b ? 2 : 1);
  const pct = Math.round((avg / rating) * 100);
  const lo = Math.max(0, pct - 1);
  const hi = pct + 1;
  return `${lo}%–${hi}%`;
}

/**
 * Build professional letter body from type + answers + job context.
 * Templates match real sample structure — refined from Drive BLZ letters.
 */
export function buildLetterBody(type, answers = {}, job = {}) {
  const site = siteFrom(job, answers);
  const company = tenantShortName() || tenantCompany().name || "our firm";
  const a = answers || {};

  if (type.id === "load_letter") {
    const pct = pctCapacity(a);
    const phaseBits = [
      a.phaseA ? `${a.phaseA} amps on Phase A` : "",
      a.phaseB ? `${a.phaseB} amps on Phase B` : "",
      a.phaseC ? `${a.phaseC} amps on Phase C` : "",
    ].filter(Boolean);
    const parts = [
      a.county || a.state
        ? `County of: ${a.county || "—"}\nState of: ${a.state || "New York"}\nDate: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`
        : "",
      "We have performed an electrical subpanel inspection and a load test of the services. We have inspected the panels for arcing, corrosion, or other potential fire hazards.",
      `In addition, as per your request, we have completed a load test for ${a.unitCount || "apartments"} at the following address:\n${site}.`,
      "And the service is operable, maintained, and in good working condition.",
      a.applianceList
        ? `The load tests were taken with the consideration of all the following items:\n${a.applianceList}`
        : "",
      a.breakerRating
        ? `Based on the test with the amp probe reading at the\n${a.breakerRating}:`
        : "Based on the test with the amp probe reading:",
      phaseBits.length ? `The load averaged ${phaseBits.join(", and ")} in the apartments;` : "",
      pct
        ? `These represent approximately ${pct} of the capacity on a regular basis and the ${a.breakerRating || "protective device"} is sufficient for the load.`
        : a.conclusion ||
          `These readings show spare capacity and the ${a.breakerRating || "protective device"} is sufficient for the load.`,
      a.conclusion && pct ? a.conclusion : "",
    ];
    return parts.filter(Boolean).join("\n\n");
  }

  if (type.id === "shared_meter_affidavit") {
    const unit = a.unit || "the unit";
    const other = a.otherMeter || "the other meter";
    const acct = a.accountNumber ? `Acct: ${a.accountNumber}` : "";
    const corrective =
      a.corrective || "Reconfigured wiring so this unit's meter only measures this unit";
    const status =
      a.currentStatus ||
      `There is no longer a shared meter condition between ${unit} and ${other}. Each meter now accurately records its intended usage.`;
    return [
      acct ? `Re: ${site}\n${unit}\n${acct}` : `Re: ${site}\n${unit}`,
      `We have inspected the electrical meter setup at ${site}, focusing on ${unit}${a.otherMeter ? " and the " + other : ""}.`,
      `During this inspection, we found and corrected a shared meter condition involving ${unit}.`,
      `Corrective Measures:\n${corrective}.\nVerification: The new setup was verified to ensure accuracy and compliance.`,
      `Current Status: ${status}`,
      "Please consider this statement as confirmation that the shared meter issue has been resolved.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (type.id === "equipment_safety_inspection") {
    const equip = a.equipment || "main metering equipment";
    const findings =
      a.findings ||
      "The equipment was found to be in safe working condition with no immediate hazards observed.";
    return [
      `Re: ${site}`,
      `We conducted a safety inspection of the ${equip} located at ${site}, which included a visual examination and verification of electrical integrity.`,
      findings,
      a.necConcern ? a.necConcern : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (type.id === "owner_inspection_request") {
    const reason = a.contractorReason || "is no longer available to close the permit";
    return [
      `RE: Request for Courtesy Inspection to Close Electrical Permit ${a.permitNumber || ""}`,
      "NYC Department of Buildings\nElectrical Department",
      `I am writing to formally request a courtesy inspection appointment for my property located at ${site}. My name is ${a.ownerName || "the property manager"}, and I am the current manager of this property.`,
      `I request permission for an inspection of the open electrical application associated with this property: ${a.permitNumber || "[permit #]"}.`,
      `The licensed electrical contractor responsible for this permit ${reason}, and I need to finalize and close these applications. I request permission to schedule an inspection date, and we will have a licensed electrician present during the inspection.`,
      "Your assistance in this matter is greatly appreciated. Please provide guidance on scheduling the inspection and any associated requirements.",
      "I look forward to your response and remain committed to resolving this promptly.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (type.id === "violation_resolution") {
    const fee = a.fee || "6000";
    const first = a.firstTimeFee || "5000";
    const deposit = a.depositPct || "50";
    const penalty = a.penalty || "2500";
    return [
      `Proposal for Violation Resolution and Representation\n\n${site}`,
      `Dear ${a.recipient || "Property Owner"},`,
      "We are pleased to offer this proposal outlining the steps, services, and costs to resolve the ECB violation issued by the NYC Department of Buildings (DOB). Our services include guiding you through the process, filing permits, and coordinating with DOB as needed.",
      `This proposal addresses the following violation: NOV #${a.novNumber || "—"} — ${a.observedWork || "Work without a permit on electrical systems"}`,
      `Violation Summary & Proposed Resolution\nNOV #${a.novNumber || "—"}\nDetails: At the time of inspection on ${a.inspectionDate || "[date]"}, ${a.observedWork || "work was observed without a permit on file"}. The violation was issued under ${a.codeSection || "Section 28-105.1 of the NYC Administrative Code"} with a penalty of $${penalty}.`,
      `Corrective Action Required:\nFile an electrical permit covering the work performed.\nPay the DOB civil penalty of $${penalty}.\nSubmit the penalty receipt with the Certificate of Correction.`,
      `Scope of Services & Fees\nComprehensive Violation Resolution Guidance (planning, permit filing, coordination, unlimited hearings): $${fee} (or $${first} for first-time customers)\nPayment Terms:\n${deposit}% due upfront upon signing this proposal.\nRemaining balance due as soon as the Stop Work Order is lifted by the DOB.\nAdditional Costs (Not Included): DOB filing fees and the civil penalty, payable by the property owner.`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (type.id === "good_standing_request") {
    const corp = a.corporationName || company;
    const variant = a.variant || "Certificate of Status / Letter of Good Standing";
    return [
      "New York State Department of State\nDivision of Corporations\nOne Commerce Plaza\n99 Washington Ave\nAlbany, NY 12231",
      `Subject: Request for ${variant}`,
      "Dear Sir/Madam,",
      `I am writing to request a ${variant} for our corporation, ${corp}. Below are the details as required:`,
      `Name of Corporation: ${corp}\nDepartment of State ID / TIN: ${a.tin || "—"}\nProcessing Type: ${a.processingType || "Expedited"}`,
      a.returnAddress
        ? `Mailing Address: Please mail the certificate to the following address:\n${a.returnAddress}`
        : "",
      a.emailCopy
        ? `Email Request: Additionally, we request that a copy be emailed to ${a.emailCopy}`
        : "",
      "We appreciate your prompt attention to this request. If there are any additional fees or documentation required, please contact me at the above address or email.\nThank you for your assistance.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (type.id === "code_compliance_safety_report") {
    return [
      `Project: ${site}`,
      a.issueTitle || "Code Compliance and Occupant Safety",
      a.narrative || "",
      a.necRefs
        ? `Applicable references:\n${a.necRefs}`
        : "",
      "This installation meets applicable code requirements, complies with equipment listing where applicable, and prioritizes occupant safety.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  // general / legacy safety / affidavit fallbacks
  if (type.id === "safety" || type.id === "equipment_safety" || type.id === "affidavit") {
    // Back-compat for any stored drafts with old ids
    return [
      `This letter concerns electrical conditions at ${site}.`,
      a.scope || a.equipment || a.statement || "",
      a.findings || a.results || "",
      a.corrective || a.recommendations || a.checksPerformed || "",
      a.conclusion || a.notaryNote || "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (a.body) return String(a.body).trim();
  return `Regarding ${site}.\n\n[Letter body]`;
}

export function defaultReLine(type, job = {}, answers = {}) {
  if (answers.reLine) return answers.reLine;
  if (answers.issueTitle) return answers.issueTitle;
  if (type?.id === "owner_inspection_request" && answers.permitNumber) {
    return `Request for Courtesy Inspection to Close Electrical Permit ${answers.permitNumber}`;
  }
  if (type?.id === "good_standing_request") {
    return answers.variant || "Request for Certificate of Status / Letter of Good Standing";
  }
  if (type?.id === "shared_meter_affidavit") {
    return "Statement Regarding Shared Meter Correction";
  }
  const site = answers.address || job.serviceAddress || job.address || "";
  const label = type?.label || "Letter";
  return site ? `${label} — ${site}` : label;
}

/**
 * Create a new letter draft.
 */
export function createLetterDraft({
  type,
  job = {},
  lineIndex = 0,
  itemName = "",
  answers,
  photos = [],
  ownerId = "",
} = {}) {
  const t = type || LETTER_TYPES[0];
  const profile = activeTenantConfig()?.profile || null;
  const seeded = answers || seedLetterAnswersFromJob(job, t, profile);
  const bodyText = buildLetterBody(t, seeded, job);
  const signer = resolveSigner(profile, ownerId);
  return {
    id: newLetterId(),
    typeId: t.id,
    typeLabel: t.label,
    letterhead: t.letterhead || "company",
    lineIndex,
    itemName: itemName || t.label,
    siteAddress: siteFrom(job, seeded),
    customerName: job.customer || job.customerName || "",
    answers: seeded,
    photos: Array.isArray(photos) ? photos : [],
    status: "draft",
    bodyText,
    reLine: defaultReLine(t, job, seeded),
    ownerId: ownerId || signer?.id || "",
    updatedAt: Date.now(),
  };
}

/**
 * Refresh draft body/re line after answer edits.
 */
export function refreshLetterDraft(draft, { answers, bodyText, reLine, job, ownerId, photos, status } = {}) {
  const type = LETTER_TYPES.find((t) => t.id === draft.typeId) || LETTER_TYPES[0];
  const nextAnswers = answers || draft.answers || {};
  const nextJob = job || {};
  const nextBody =
    bodyText != null ? bodyText : buildLetterBody(type, nextAnswers, { ...nextJob, serviceAddress: draft.siteAddress });
  return {
    ...draft,
    answers: nextAnswers,
    bodyText: nextBody,
    reLine: reLine != null ? reLine : defaultReLine(type, nextJob, nextAnswers),
    siteAddress: siteFrom(nextJob, nextAnswers) || draft.siteAddress,
    photos: photos != null ? photos : draft.photos,
    ownerId: ownerId != null ? ownerId : draft.ownerId,
    status: status || draft.status,
    updatedAt: Date.now(),
  };
}

/** Required fields filled + body present. */
export function letterDraftReady(draft) {
  if (!draft) return false;
  const type = LETTER_TYPES.find((t) => t.id === draft.typeId);
  if (!type) return !!String(draft.bodyText || "").trim();
  for (const f of type.fields || []) {
    if (!f.required) continue;
    const v = draft.answers?.[f.key];
    if (v == null || String(v).trim() === "") return false;
  }
  return !!String(draft.bodyText || "").trim();
}

/**
 * Attachment record for invoice email / job store.
 * @param {object} draft
 * @param {{ url: string, name?: string, mime?: string }} file
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
  const i = prev.findIndex(
    (d) => d.id === draft.id || (d.lineIndex === draft.lineIndex && d.typeId === draft.typeId)
  );
  const next = prev.slice();
  if (i >= 0) next[i] = draft;
  else next.push(draft);
  return next;
}
