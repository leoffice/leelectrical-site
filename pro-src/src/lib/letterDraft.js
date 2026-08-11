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

/**
 * % of capacity auto-computed from the per-phase amp readings vs. the breaker /
 * fuse rating (notes→report map): floor(min%)–ceil(max%), e.g. 3.9 & 4.1 A on a
 * 40 A device → "9%–11%". Levi can override via the capacityPct field.
 */
function pctCapacity(answers) {
  if (answers.capacityPct) return String(answers.capacityPct).trim();
  const amps = [answers.phaseA, answers.phaseB, answers.phaseC]
    .map((v) => parseFloat(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  const rating = parseFloat(String(answers.breakerRating || "").match(/\d+(?:\.\d+)?/)?.[0] || "");
  if (!rating || !amps.length) return "";
  const pcts = amps.map((v) => (v / rating) * 100);
  const lo = Math.max(0, Math.floor(Math.min(...pcts)));
  let hi = Math.ceil(Math.max(...pcts));
  if (hi <= lo) hi = lo + 1;
  return `${lo}%–${hi}%`;
}

/** "40 Amp double-pole fuse per apartment" → "40 Amp fuse" (closing shorthand). */
function shortDevice(breakerRating) {
  const s = String(breakerRating || "");
  const num = s.match(/(\d+(?:\.\d+)?)\s*-?\s*amp/i)?.[1];
  const dev = s.match(/fuse|breaker/i)?.[0]?.toLowerCase();
  if (num) return `${num} Amp ${dev || "device"}`;
  return s.trim() || "protective device";
}

/** Split a free-form notes list into clean items. */
function cleanList(raw) {
  return String(raw || "")
    .split(/[,;\n]+/)
    .map((s) => s.trim().replace(/[.\s]+$/, ""))
    .filter(Boolean);
}

/** Join items with correct grammar: "a, b, and c" (or "or"). */
function joinList(items, conj = "and") {
  const list = items.filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} ${conj} ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, ${conj} ${list[list.length - 1]}`;
}

/** Give a scope phrase a proper article ("an electrical sub-panel inspection…"). */
function withArticle(phrase) {
  const p = String(phrase || "").trim().replace(/[.\s]+$/, "");
  if (!p) return "";
  if (/^(a|an|the)\s/i.test(p)) return p;
  return (/^[aeiou]/i.test(p) ? "an " : "a ") + p;
}

/** Lower-case a note fragment into mid-sentence voice (keeps acronyms). */
function midSentence(s) {
  const t = String(s || "").trim().replace(/[.\s]+$/, "");
  if (!t) return "";
  if (/^[A-Z][a-z]/.test(t)) return t.charAt(0).toLowerCase() + t.slice(1);
  return t;
}

/** Terminal sentence from a note fragment. */
function sentence(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(cap) ? cap : cap + ".";
}

/** Equipment-safety methods notes → standard inspection phrases. */
function methodPhrases(raw) {
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
    else add(midSentence(t));
  }
  return out;
}

/** "Not found" notes → standard negative list (arcing, corrosion, …). */
function notFoundPhrases(raw) {
  const out = [];
  const seen = new Set();
  const add = (p) => {
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  };
  for (const item of String(raw || "").split(/[,;\n]+|\/| and /i)) {
    const t = item.trim().replace(/^no\s+/i, "");
    if (!t) continue;
    if (/arc/i.test(t)) add("arcing");
    else if (/corro/i.test(t)) add("corrosion");
    else if (/burn|melt|overheat/i.test(t)) add("overheating or burnt components");
    else if (/exposed|bare|live wir/i.test(t)) add("exposed live wiring");
    else add(midSentence(t));
  }
  return out;
}

// The approved NEC grounding-busbar paragraph (equipment-safety code note).
const NEC_BUSBAR_PARA =
  "The grounding busbar is securely mounted within the service equipment and installed in an accessible location, consistent with NEC 250.68 and 250.64(B) (as adopted by the NYC Electrical Code), allowing verification of all bonding connections to the grounding electrode system. As it operates at ground potential, this accessibility ensures a code-compliant inspection without hazard.";

/**
 * Build professional letter body from type + answers + job context.
 * Templates match real sample structure — refined from Drive BLZ letters.
 */
export function buildLetterBody(type, answers = {}, job = {}) {
  const site = siteFrom(job, answers);
  const company = tenantShortName() || tenantCompany().name || "our firm";
  const a = answers || {};

  if (type.id === "load_letter") {
    // Notes → report per Load_Letter_NOTES_TO_REPORT.md (approved 2026-08-10):
    // scope/checked-for/loads notes are normalized, phases become bold amp
    // readings, and % of capacity auto-computes from amps vs. the rating.
    const pct = pctCapacity(a);
    const scope = withArticle(a.scope || "electrical sub-panel inspection of the apartment units");
    const checked = joinList(cleanList(a.checkedFor || "arcing, corrosion, other potential fire hazards"));
    const loads = joinList(cleanList(a.applianceList).map(midSentence));
    const phaseBits = [
      a.phaseA ? `**${a.phaseA} amps on Phase A**` : "",
      a.phaseB ? `**${a.phaseB} amps on Phase B**` : "",
      a.phaseC ? `**${a.phaseC} amps on Phase C**` : "",
    ].filter(Boolean);
    const closing = pct
      ? `These readings represent approximately ${pct} of capacity on a regular basis, and the ${shortDevice(a.breakerRating)} is therefore sufficient for the load.`
      : `These readings show spare capacity, and the ${shortDevice(a.breakerRating)} is therefore sufficient for the load.`;
    const parts = [
      `We have performed ${scope} and completed a load test of the service buses. We inspected the panels for ${checked}.`,
      `In addition, as per your request, we completed a load test for the ${a.unitCount || "apartments"} at the following address: **${site}**. The service was found to be operable, maintained, and in good working condition.`,
      loads
        ? `The load tests were taken with consideration of all of the following items: ${loads}.`
        : "",
      [
        a.breakerRating
          ? `Based on the test, with the amp-probe reading taken at the ${midSentence(a.breakerRating)},`
          : "Based on the test, with the amp-probe readings taken,",
        phaseBits.length ? `the load averaged ${joinList(phaseBits)}.` : "the load was measured.",
        a.conclusion ? sentence(a.conclusion) : closing,
      ].join(" "),
    ];
    return parts.filter(Boolean).join("\n\n");
  }

  if (type.id === "shared_meter_affidavit") {
    // Notes → affidavit per Shared_Meter_Affidavit_NOTES_TO_REPORT.md:
    // affirm the visit → corrective measures → verification → resolution.
    const unit = a.unit || "the affected unit";
    const corr = String(a.corrective || "");
    let corrective;
    if (/remove|cable/i.test(corr)) {
      corrective = `We removed cables that were incorrectly connected to and running through this meter, which is assigned to ${unit}.`;
    } else if (!corr || /reconfig|rewir|only measures|measures only/i.test(corr)) {
      corrective = `We reconfigured the wiring so that the meter assigned to ${unit} measures only that unit.`;
    } else {
      corrective = sentence(corr);
    }
    return [
      `We hereby affirm that, as a licensed electrician, we visited the property located at **${site}** to address the shared electric meter condition affecting ${unit}.`,
      corrective,
      `Following these corrections, we inspected the meter and wiring and confirmed that only electrical lines dedicated exclusively to ${unit} are connected to this meter, with no other devices, common areas, neighboring units, or extraneous loads connected to or measured by it.`,
      a.currentStatus ? sentence(a.currentStatus) : "",
      "Please consider this statement as confirmation that the shared meter condition has been resolved.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (type.id === "equipment_safety_inspection") {
    // Notes → report per Equipment_Safety_Inspection_NOTES_TO_REPORT.md:
    // P1 what+how, P2 findings anchor + negative list + condition, P3 code, P4 close.
    const equip = midSentence(a.equipment || "main metering equipment");
    const methods = joinList(methodPhrases(a.methods || "visual, operational test, checked integrity, grounding/bonding"));
    const p1 = `We conducted a safety inspection of the ${equip} located at **${site}**, which included ${methods}.`;

    const anchor =
      "The equipment was found to be in safe working condition with no immediate hazards observed.";
    const p2Bits = [anchor];
    if (a.findings && !/safe|fine|working|no (immediate )?hazard|ok\b|good/i.test(a.findings)) {
      p2Bits.push(sentence(a.findings));
    }
    const neg = notFoundPhrases(a.notFound);
    if (neg.length) p2Bits.push(`No ${joinList(neg, "or")} was observed at the equipment.`);
    if (a.condition) {
      p2Bits.push(
        /wear|old|age/i.test(a.condition)
          ? "Considering the age of the equipment, normal wear is present but does not compromise safety."
          : sentence(a.condition)
      );
    }

    const code = a.necConcern
      ? /busbar|250\.68|250\.64/i.test(a.necConcern)
        ? NEC_BUSBAR_PARA
        : sentence(a.necConcern)
      : "";

    const closeBits = [];
    if (!a.recommendations || /urgent|monitor|none|nothing|periodic/i.test(a.recommendations)) {
      closeBits.push(
        "Based on this inspection, no immediate corrective action is required; periodic monitoring of the equipment is recommended."
      );
    } else {
      closeBits.push(`Based on this inspection, ${midSentence(a.recommendations)}.`);
    }
    if (a.purpose) {
      const purpose = midSentence(a.purpose).replace(/\s*purposes?\.?$/i, "");
      closeBits.push(`This statement is provided for ${purpose} purposes.`);
    }

    return [p1, p2Bits.join(" "), code, closeBits.join(" ")].filter(Boolean).join("\n\n");
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
  const site = answers.address || job.serviceAddress || job.address || "";
  // Approved 2026-08-10 letterhead: the Re: line is the site address for the
  // redesigned affidavit types (the document title already names the letter).
  if (
    type?.id === "load_letter" ||
    type?.id === "equipment_safety_inspection" ||
    type?.id === "shared_meter_affidavit"
  ) {
    return site || (type?.id === "shared_meter_affidavit" ? "Statement Regarding Shared Meter Condition" : type?.label || "Letter");
  }
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
