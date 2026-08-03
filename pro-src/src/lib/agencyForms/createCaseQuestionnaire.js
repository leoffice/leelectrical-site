/**
 * Con Ed "Submit a Case" questionnaire — S23.
 *
 * Step 0 = Request Type → branches:
 *   A add_load   = FULL 6 wizard groups (includes meters + load items)
 *   B no_add_load = SHORT 5 groups (skips full residential load step;
 *                   still has basic meter questions on portal Project step)
 *
 * Specs: LEPRO_CONED_CREATE_CASE_QUESTIONNAIRE.md
 *         LEPRO_CONED_ADD_LOAD_AUTOMATION_SPEC.md § REQUEST-TYPE BRANCHES
 * Portal request types + short Review fields confirmed live CDP 2026-08-03.
 */

import {
  HP_TO_KW,
  LOAD_CATALOG,
  buildLoadItemsPayload,
  defaultLoadItemsFromCatalog,
  isAcItem,
  isLightingItem,
  isMotorItem,
  loadItemKw,
  makeLoadItemFromCatalog,
  matchCatalogId,
  normalizeLoadRow,
  resolveLoadEntryMode,
  sumLoadKw,
} from "./loadItemCatalog.js";
import {
  appendLoadLearning,
  buildLoadLearningEntry,
  clearGlobalLoadLearning,
  mergeLoadLearningHistories,
  readGlobalLoadLearning,
  recordLoadLearning,
  suggestLoadItemsFromLearning,
} from "./loadLearning.js";

export {
  HP_TO_KW,
  LOAD_CATALOG,
  isLightingItem,
  isAcItem,
  isMotorItem,
  resolveLoadEntryMode,
  loadItemKw,
  sumLoadKw,
  makeLoadItemFromCatalog,
  matchCatalogId,
  normalizeLoadRow,
  buildLoadItemsPayload,
  defaultLoadItemsFromCatalog,
  appendLoadLearning,
  buildLoadLearningEntry,
  suggestLoadItemsFromLearning,
  mergeLoadLearningHistories,
  readGlobalLoadLearning,
  recordLoadLearning,
  clearGlobalLoadLearning,
};

/** Request type ids used in app + host automation. */
export const REQUEST_TYPES = {
  ADD_LOAD: "add_load",
  NO_ADD_LOAD: "no_add_load",
};

export const REQUEST_TYPE_LABELS = {
  [REQUEST_TYPES.ADD_LOAD]: "Add Load to Existing Service",
  [REQUEST_TYPES.NO_ADD_LOAD]:
    "Performing Work on Customer Equipment - No Additional Load",
};

/** Portal-facing request type strings (Energy Services). */
export const REQUEST_TYPE_PORTAL = {
  [REQUEST_TYPES.ADD_LOAD]: "Add Load to Existing Service",
  [REQUEST_TYPES.NO_ADD_LOAD]:
    "Performing Work on Customer Equipment - No Additional Load",
};

/**
 * Full Energy Services Request Type list (live portal 2026-08-03).
 * Primary app branches remain Add Load + No Additional Load; others flagged TBD.
 */
export const PORTAL_REQUEST_TYPES = Object.freeze([
  "Add Additional Con Ed Service from Street (usually requires additional cost)",
  "Add Load to Existing Service",
  "Customer Requested Outage",
  "Demolition",
  "Electric Vehicle Supply Equipment (Charging Station/Equipment)",
  "Emergency Backup Generator",
  "Gut Rehab",
  "Meter Unlock Only",
  "New Service",
  "Other",
  "Overhead Facilities Protection",
  "Performing Work Due to Storm Damage - Flooded Equipment",
  "Performing Work Due to Storm Damage - NonFlooded Equipment",
  "Performing Work on Customer Equipment - No Additional Load",
  "Temporary Service",
  "Third Party Attachment - Removal Request",
  "Third Party Attachment Installation - New Request",
  "Third Party Attachment Installation - Power Only (Pole License Received and Make Ready Work Completed)",
]);

/** Default 2-family load seed (catalog-backed). */
export const DEFAULT_LOAD_ITEMS = defaultLoadItemsFromCatalog();

/**
 * Values never asked — auto, shown once in "Already handled".
 * Levi 2026-08-03 (create-case walkthrough):
 *  - RTVI = Yes (standard for inspection)
 *  - Skip ALL optional boxes — required fields only (incl. contractor + customer company)
 *  - Contractor of record = Levi / BLZ (required only; no optional contractor extras)
 */
export const AUTO_HANDLED = {
  energyServiceType: "Electric",
  /** Inspection RTVI — Levi always Yes */
  rtvi: "Yes",
  /** Required contractor of record only */
  contractor: "Levi / BLZ",
  heatingElectrification: "No",
  micromobilityPowerReady: "No",
  nyStateRoute: "No",
  rearYardLoop: "Neither",
  makeFinalConnection: "No",
  installingGenerator: "No",
  weldingEquipment: "No",
  shortCircuitInfo: "No",
  /** Never fill portal fields marked Optional (Block/Lot, company optional, contractor extras) */
  skipOptional: true,
  fillOptionalContractorFields: false,
  fillOptionalCustomerCompany: false,
  companyOptional: "",
  mailingSameAsService: true,
};

/** Optional portal keys that must stay blank when skipOptional is on. */
export const SKIP_OPTIONAL_KEYS = Object.freeze([
  "companyOptional",
  "customerCompany",
  "ownerCompany",
  "block",
  "lot",
  "blockLot",
  "nearestCrossStreet",
  "crossStreet",
  "conEdAccountNumber",
  "accountNumber",
  "contractorCompanyOptional",
  "contractorPhoneOptional",
  "contractorEmailOptional",
  "contractorAddressOptional",
]);

/**
 * Strip non-ASCII / fancy punctuation Con Ed rejects.
 * Spec: plain ASCII only (hyphen, straight quotes).
 */
export function toPlainAscii(s) {
  return String(s ?? "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E\n\r\t]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/**
 * Prefer a real person name over a company display name
 * (e.g. "Goodness and kindness" must not become owner first/last).
 */
export function resolveOwnerPersonName(job = {}) {
  const candidates = [
    job.personName,
    job.ownerName,
    job.contactName,
    job.customerPersonName,
    job.ownerFirst && job.ownerLast ? `${job.ownerFirst} ${job.ownerLast}` : "",
    job.ownerFirst || job.ownerLast
      ? `${job.ownerFirst || ""} ${job.ownerLast || ""}`.trim()
      : "",
  ]
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  for (const c of candidates) {
    if (!looksLikeCompanyName(c)) return c;
  }

  const customer = String(job.customer || job.customerName || "").trim();
  const business = String(job.businessName || "").trim();
  if (customer && customer !== business && !looksLikeCompanyName(customer)) {
    return customer;
  }
  if (customer && !business && !looksLikeCompanyName(customer)) {
    return customer;
  }
  return "";
}

/** Heuristic: company / org labels should not become owner first/last. */
export function looksLikeCompanyName(name = "") {
  const s = String(name || "").trim();
  if (!s) return false;
  if (
    /\b(llc|inc|corp|ltd|co\.|company|associates|realty|electric|inc\.|services|foundation|synagogue|school|church)\b/i.test(
      s
    )
  ) {
    return true;
  }
  // "X and Y" trade names (e.g. Goodness and kindness) — not a person
  if (/\band\b/i.test(s) && s.split(/\s+/).length >= 3) return true;
  return false;
}

/**
 * Branch steps for the friendly questionnaire (not portal step names).
 * Full = request type + property + owner + service + meters + load + review
 * Short = request type + property + owner + service + review (no meters/load)
 */
export function questionnaireSteps(requestType) {
  const rt = normalizeRequestType(requestType);
  const base = [
    { id: "request_type", title: "Request type", short: "Type" },
    { id: "property", title: "Where's the job?", short: "Property" },
    { id: "owner", title: "Who owns the property?", short: "Owner" },
    { id: "service", title: "What are we doing?", short: "Service" },
  ];
  if (rt === REQUEST_TYPES.ADD_LOAD) {
    return [
      ...base,
      { id: "meters", title: "How many meters?", short: "Meters" },
      { id: "load", title: "What's the electrical load?", short: "Load" },
      { id: "review", title: "Review", short: "Review" },
    ];
  }
  return [...base, { id: "review", title: "Review", short: "Review" }];
}

/** Portal wizard step count (human Review is last). */
export function portalWizardStepCount(requestType) {
  return normalizeRequestType(requestType) === REQUEST_TYPES.ADD_LOAD ? 6 : 5;
}

export function isFullBranch(requestType) {
  return normalizeRequestType(requestType) === REQUEST_TYPES.ADD_LOAD;
}

export function normalizeRequestType(rt) {
  const s = String(rt || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (
    s === REQUEST_TYPES.NO_ADD_LOAD ||
    s.includes("no_additional") ||
    s.includes("no_add") ||
    s.includes("customer_equipment")
  ) {
    return REQUEST_TYPES.NO_ADD_LOAD;
  }
  if (s === REQUEST_TYPES.ADD_LOAD || s.includes("add_load")) {
    return REQUEST_TYPES.ADD_LOAD;
  }
  // Unknown → treat as short (safer) but flag
  if (!rt) return REQUEST_TYPES.NO_ADD_LOAD;
  return REQUEST_TYPES.ADD_LOAD;
}

function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function splitName(full) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  // Last token = last name; everything before = first (+ middle) — fits "Yitzchok Dovid Rubashkin"
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

function parseAddressLine(addr) {
  const s = String(addr || "").trim();
  const m = s.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
  if (m) return { houseNumber: m[1], streetName: m[2] };
  return { houseNumber: "", streetName: s };
}

/** Strip city/state/zip tail so portal house/street stay clean. */
function cleanStreetName(streetName = "") {
  let cleanStreet = String(streetName || "").trim();
  if (!cleanStreet) return "";
  return cleanStreet
    .replace(/,?\s*(brooklyn|queens|manhattan|bronx|staten island).*$/i, "")
    .replace(/,?\s*new york.*$/i, "")
    .replace(/,?\s*ny\b.*$/i, "")
    .replace(/,?\s*\d{5}(?:-\d{4})?\s*$/i, "")
    .replace(/,\s*$/, "")
    .trim();
}

/**
 * Build plain-ASCII scope seed from estimate lines / job notes.
 * Used so Create Case can file from the estimate without retyping.
 */
export function seedScopeOfWorkFromJob(job = {}) {
  const existing = String(job.scopeOfWork || job.workDescription || job.description || "").trim();
  if (existing && !/placeholder|restored after missing/i.test(existing)) {
    return toPlainAscii(existing).slice(0, 800);
  }
  const lines = Array.isArray(job.estimateLines)
    ? job.estimateLines
    : Array.isArray(job.lines)
      ? job.lines
      : [];
  const parts = [];
  for (const ln of lines) {
    const name = String(ln?.itemName || ln?.name || "").trim();
    const desc = String(ln?.description || ln?.desc || "").trim();
    const chunk = [name, desc].filter(Boolean).join(" - ");
    if (!chunk) continue;
    if (/placeholder|restored after missing/i.test(chunk)) continue;
    parts.push(chunk);
  }
  if (parts.length) return toPlainAscii(parts.join("; ")).slice(0, 800);
  const title = String(job.title || job.notes || "").trim();
  if (title && !/placeholder|restored after missing/i.test(title)) {
    return toPlainAscii(title).slice(0, 800);
  }
  return "";
}

/**
 * Seed answers from job + optional existing createCase draft.
 * @param {object} job
 * @param {object|null} existing
 * @param {{ loadHistory?: object[] }} [opts] — prior load fills for smarter prefill
 */
export function seedCreateCaseAnswers(job = {}, existing = null, opts = {}) {
  if (existing?.answers && typeof existing.answers === "object") {
    return sanitizeAnswers({ ...defaultAnswers(job, opts), ...existing.answers });
  }
  return defaultAnswers(job, opts);
}

export function defaultAnswers(job = {}, opts = {}) {
  const addr = String(job.serviceAddress || job.address || "").trim();
  const { houseNumber, streetName } = parseAddressLine(addr);
  // Prefer person name over company trade name (customer card personName / owner fields).
  const person = resolveOwnerPersonName(job);
  const { first, last } = splitName(person);
  const phone = String(job.phone || job.customerPhone || "").replace(/\D/g, "").slice(0, 10);
  const email = String(job.email || job.customerEmail || "").trim();
  let city = String(job.city || "").trim();
  let state = String(job.state || "").trim() || "NY";
  let zip = String(job.zip || job.postalCode || "").trim();
  const addrLower = addr.toLowerCase();
  if (!city && /brooklyn/.test(addrLower)) city = "Brooklyn";
  if (!city && /queens/.test(addrLower)) city = "Queens";
  if (!city) city = "Brooklyn";
  if (!zip) {
    const zm = addr.match(/\b(\d{5})(?:-\d{4})?\b/);
    if (zm) zip = zm[1];
  }
  const cleanStreet = cleanStreetName(streetName);
  const base = {
    requestType: REQUEST_TYPES.NO_ADD_LOAD, // Levi's most common
    serviceAddress: addr,
    houseNumber,
    streetName: cleanStreet || streetName,
    city,
    state,
    zip,
    borough: String(job.borough || city || "Brooklyn").trim() || "Brooklyn",
    bin: String(job.bin || job.BIN || "").trim(),
    buildingType: "Residential",
    is1to3Family: true,
    ownerFirst: first,
    ownerLast: last,
    ownerPhone: phone,
    ownerEmail: email,
    mailingSameAsService: true,
    servicePanelAmps: 100,
    phase: "Single phase",
    requiredTotalKw: "",
    useExistingService: true,
    facilityServicedBy: "Underground",
    changePoe: false,
    meters: [
      { name: "Apartment 1", unitType: "Apartment", sqFt: "" },
      { name: "Apartment 2", unitType: "Apartment", sqFt: "" },
      { name: "PLP", unitType: "PLP", sqFt: "" },
    ],
    meterCapacityIncrease: false,
    numberOfNewMeters: 3,
    loadItems: DEFAULT_LOAD_ITEMS.map((x) => ({ ...x })),
    plannedConstructionStart: todayIsoDate(),
    scopeOfWork: seedScopeOfWorkFromJob(job),
    equipmentName: "",
    replaceUpgradeEquipment: false,
    totalBuildings: 1,
    totalUnits: 2,
    numberOfFloors: 2,
    numberOfBasements: 1,
    metersRelocatedOutdoors: false,
    metersNeedUnlock: false,
    electricHeat: false,
    elevator: false,
  };
  // Prefer learned load pattern when we have history (job + device-global)
  const history =
    opts.loadHistory ||
    mergeLoadLearningHistories(
      job?.paperwork?.coned?.loadLearningHistory || [],
      typeof opts.skipGlobalLearning === "boolean" && opts.skipGlobalLearning
        ? []
        : readGlobalLoadLearning()
    );
  const learned = suggestLoadItemsFromLearning(history, base);
  if (learned && learned.length) {
    base.loadItems = learned.map((x) => normalizeLoadRow(x));
    base._loadPrefillSource = "learning";
  } else {
    base._loadPrefillSource = "catalog_defaults";
  }
  return sanitizeAnswers(base);
}

export function sanitizeAnswers(answers = {}) {
  const a = { ...answers };
  for (const k of [
    "serviceAddress",
    "houseNumber",
    "streetName",
    "city",
    "state",
    "zip",
    "borough",
    "bin",
    "ownerFirst",
    "ownerLast",
    "ownerPhone",
    "ownerEmail",
    "scopeOfWork",
    "facilityServicedBy",
    "phase",
    "buildingType",
  ]) {
    if (a[k] != null) a[k] = toPlainAscii(a[k]);
  }
  if (Array.isArray(a.meters)) {
    a.meters = a.meters.map((m) => ({
      ...m,
      name: toPlainAscii(m.name),
      unitType: toPlainAscii(m.unitType || ""),
    }));
  }
  if (Array.isArray(a.loadItems)) {
    a.loadItems = a.loadItems.map((it) =>
      normalizeLoadRow({
        ...it,
        name: toPlainAscii(it.name),
        phase: toPlainAscii(it.phase || "Single"),
      })
    );
  }
  a.requestType = normalizeRequestType(a.requestType);
  if (a.equipmentName != null) a.equipmentName = toPlainAscii(a.equipmentName);

  // Levi standing rule: RTVI always Yes (inspection)
  a.rtvi = true;
  a.skipOptional = true;

  // Strip optional portal boxes — never carry company/block/lot/cross-street extras
  for (const k of SKIP_OPTIONAL_KEYS) {
    if (k in a) a[k] = "";
  }

  return a;
}

/**
 * Required fields for a questionnaire step (branch-aware).
 * @returns {{ key: string, label: string }[]}
 */
export function missingCreateCaseFields(stepId, answers = {}) {
  const a = answers;
  const miss = [];
  const need = (key, label, ok) => {
    if (!ok) miss.push({ key, label });
  };
  switch (stepId) {
    case "request_type":
      need("requestType", "Request type", !!normalizeRequestType(a.requestType));
      break;
    case "property":
      need(
        "serviceAddress",
        "Service address",
        !!(a.serviceAddress || (a.houseNumber && a.streetName))
      );
      need("borough", "Borough", !!a.borough);
      need("bin", "BIN", !!String(a.bin || "").trim());
      need("buildingType", "Building type", !!a.buildingType);
      break;
    case "owner":
      need("ownerFirst", "Owner first name", !!String(a.ownerFirst || "").trim());
      need("ownerLast", "Owner last name", !!String(a.ownerLast || "").trim());
      need("ownerPhone", "Owner phone", !!String(a.ownerPhone || "").replace(/\D/g, ""));
      need("ownerEmail", "Owner email", /@/.test(String(a.ownerEmail || "")));
      break;
    case "service":
      need("servicePanelAmps", "Service panel size", Number(a.servicePanelAmps) > 0);
      need("phase", "Phase", !!a.phase);
      need("facilityServicedBy", "Facility serviced by", !!a.facilityServicedBy);
      break;
    case "meters":
      if (isFullBranch(a.requestType)) {
        const meters = Array.isArray(a.meters) ? a.meters.filter((m) => m?.name) : [];
        need("meters", "At least one meter name", meters.length > 0);
      }
      break;
    case "load":
      if (isFullBranch(a.requestType)) {
        const items = Array.isArray(a.loadItems) ? a.loadItems : [];
        need("loadItems", "At least one load item", items.length > 0);
      }
      break;
    default:
      break;
  }
  return miss;
}

/** True when all branch steps (except review) are complete. */
export function createCaseReady(answers = {}) {
  const steps = questionnaireSteps(answers.requestType).filter((s) => s.id !== "review");
  for (const s of steps) {
    if (missingCreateCaseFields(s.id, answers).length) return false;
  }
  // Customer contact must differ from contractor (silent validation)
  const phone = String(answers.ownerPhone || "").replace(/\D/g, "");
  const email = String(answers.ownerEmail || "").toLowerCase();
  // BLZ office patterns — soft warn only if exact match; still allow ready
  // (automation will re-check)
  void phone;
  void email;
  return true;
}

/**
 * Structured payload for host create-case automation (up to Review, no auto-submit).
 */
export function buildCreateCasePayload(answers = {}, job = {}) {
  const a = sanitizeAnswers(answers);
  const rt = normalizeRequestType(a.requestType);
  const full = isFullBranch(rt);
  const meters = full
    ? (a.meters || []).filter((m) => m?.name).map((m) => ({
        name: toPlainAscii(m.name),
        unitType: toPlainAscii(m.unitType || ""),
        sqFt: m.sqFt || "",
      }))
    : [];
  const loadItems = full ? buildLoadItemsPayload(a.loadItems || []) : [];
  const kw =
    a.requiredTotalKw !== "" && a.requiredTotalKw != null
      ? Number(a.requiredTotalKw)
      : sumLoadKw(a.loadItems || []);

  // Short branch still carries basic meter fields on portal Project Information
  // (live Review 2026-08-03: relocate / capacity increase / # new meters / unlock).
  const numberOfNewMeters =
    Number(a.numberOfNewMeters) ||
    (full ? meters.length : 0) ||
    0;

  return {
    skill: "coned-create-case",
    version: 2,
    requestType: rt,
    requestTypePortal: REQUEST_TYPE_PORTAL[rt],
    branch: full ? "A_full" : "B_short",
    portalWizardSteps: portalWizardStepCount(rt),
    stopAt: "review", // human confirms submit — never auto-submit
    autoSubmit: false,
    autoHandled: { ...AUTO_HANDLED },
    /** Host fill rules — required only; RTVI Yes; no optional boxes */
    fillRules: {
      rtvi: "Yes",
      skipOptional: true,
      skipOptionalContractor: true,
      skipOptionalCustomerCompany: true,
      skipBlockLot: true,
      skipCrossStreet: true,
      plainAscii: true,
    },
    jobId: job.id || job.jobId || "",
    jobName: toPlainAscii(job.customer || job.customerName || job.name || ""),
    property: {
      // Prefer re-parse of serviceAddress so a later address edit can't leave stale house/street
      houseNumber: toPlainAscii(
        (a.serviceAddress
          ? parseAddressLine(a.serviceAddress).houseNumber
          : "") || a.houseNumber || ""
      ),
      streetName: toPlainAscii(
        cleanStreetName(
          (a.serviceAddress ? parseAddressLine(a.serviceAddress).streetName : "") || a.streetName
        ) || a.streetName || ""
      ),
      serviceAddress: toPlainAscii(a.serviceAddress || ""),
      city: toPlainAscii(a.city || "Brooklyn"),
      state: toPlainAscii(a.state || "NY"),
      zip: toPlainAscii(a.zip || ""),
      borough: toPlainAscii(a.borough || "Brooklyn"),
      bin: toPlainAscii(a.bin || ""),
      buildingType: toPlainAscii(a.buildingType || "Residential"),
      is1to3Family: a.is1to3Family !== false,
      // optional — intentionally blank (Levi skip-optional)
      block: "",
      lot: "",
      nearestCrossStreet: "",
    },
    owner: {
      firstName: toPlainAscii(a.ownerFirst || ""),
      lastName: toPlainAscii(a.ownerLast || ""),
      phone: String(a.ownerPhone || "").replace(/\D/g, ""),
      email: toPlainAscii(a.ownerEmail || ""),
      mailingSameAsService: a.mailingSameAsService !== false,
      /** Optional customer company — leave blank (Levi 2026-08-03) */
      companyOptional: "",
    },
    /** Contractor of record — required name only; no optional contractor boxes */
    contractor: {
      name: AUTO_HANDLED.contractor,
      fillOptional: false,
      companyOptional: "",
      phoneOptional: "",
      emailOptional: "",
      addressOptional: "",
    },
    service: {
      panelAmps: Number(a.servicePanelAmps) || 100,
      phase: toPlainAscii(a.phase || "Single phase"),
      requiredTotalKw: full ? kw : "",
      useExistingService: a.useExistingService !== false,
      facilityServicedBy: toPlainAscii(a.facilityServicedBy || "Underground"),
      changePoe: !!a.changePoe,
      scopeOfWork: toPlainAscii(a.scopeOfWork || seedScopeOfWorkFromJob(job) || ""),
      totalBuildings: Number(a.totalBuildings) || 1,
      totalUnits: Number(a.totalUnits) || (meters.length || 1),
      electricHeat: !!a.electricHeat,
      elevator: !!a.elevator,
      replaceUpgradeEquipment: !!a.replaceUpgradeEquipment,
      equipmentName: toPlainAscii(a.equipmentName || ""),
    },
    project: {
      numberOfFloors: Number(a.numberOfFloors) || 2,
      numberOfBasements: Number(a.numberOfBasements) || 0,
      plannedConstructionStart: a.plannedConstructionStart || todayIsoDate(),
      metersRelocatedOutdoors: !!a.metersRelocatedOutdoors,
      metersNeedUnlock: !!a.metersNeedUnlock,
      // Both branches show these on portal Review Meter Information
      meterCapacityIncrease: !!a.meterCapacityIncrease,
      numberOfNewMeters: numberOfNewMeters || undefined,
    },
    meters: full ? meters : undefined,
    loadItems: full ? loadItems : undefined,
    // Step-1 extras only on full branch
    step1Extras: full
      ? {
          heatingElectrification: "No",
          micromobilityPowerReady: "No",
        }
      : {
          // short branch: do NOT ask / send these
          heatingElectrification: null,
          micromobilityPowerReady: null,
        },
  };
}

export function buildCreateCaseDraft(answers = {}, job = {}, extra = {}) {
  const sanitized = sanitizeAnswers(answers);
  return {
    status: extra.status || "draft",
    answers: sanitized,
    stepIndex: Number(extra.stepIndex) || 0,
    updatedAt: Date.now(),
    payload: buildCreateCasePayload(sanitized, job),
    execution: extra.execution || null,
    ...extra,
  };
}

/** Review rows for the summary screen. */
export function createCaseReviewRows(answers = {}) {
  const a = sanitizeAnswers(answers);
  const full = isFullBranch(a.requestType);
  const rows = [
    { label: "Request type", value: REQUEST_TYPE_LABELS[a.requestType] || a.requestType },
    {
      label: "Service address",
      value: a.serviceAddress || `${a.houseNumber} ${a.streetName}`.trim(),
    },
    { label: "Borough", value: a.borough },
    { label: "BIN", value: a.bin },
    { label: "Building", value: `${a.buildingType}${a.is1to3Family ? " · 1-3 family" : ""}` },
    { label: "RTVI (inspection)", value: "Yes" },
    {
      label: "Owner",
      value: `${a.ownerFirst || ""} ${a.ownerLast || ""}`.trim(),
    },
    { label: "Owner phone", value: a.ownerPhone },
    { label: "Owner email", value: a.ownerEmail },
    { label: "Contractor", value: AUTO_HANDLED.contractor },
    { label: "Optional fields", value: "Skipped (required only)" },
    { label: "Panel", value: `${a.servicePanelAmps}A · ${a.phase}` },
    { label: "Facility", value: a.facilityServicedBy },
    { label: "Use existing service", value: a.useExistingService ? "Yes" : "No" },
    { label: "Change POE", value: a.changePoe ? "Yes" : "No" },
  ];
  if (full) {
    const meters = (a.meters || []).map((m) => m.name).filter(Boolean).join(", ");
    rows.push({ label: "Meters", value: meters || "—" });
    rows.push({
      label: "New meters (total)",
      value: String(a.numberOfNewMeters || (a.meters || []).length || ""),
    });
    rows.push({
      label: "Meter capacity increase",
      value: a.meterCapacityIncrease ? "Yes" : "No",
    });
    const kw =
      a.requiredTotalKw !== "" && a.requiredTotalKw != null
        ? a.requiredTotalKw
        : sumLoadKw(a.loadItems);
    rows.push({ label: "Required total kW", value: String(kw) });
    rows.push({
      label: "Load items",
      value: (a.loadItems || [])
        .map((it) => {
          const mode = resolveLoadEntryMode(it);
          const line = loadItemKw(it);
          if (mode === "totalKw") {
            const sp = Number(it.singlePhaseCount) || 0;
            const tp = Number(it.threePhaseCount) || 0;
            const phaseNote =
              sp || tp ? ` · ${sp} single / ${tp} three-phase` : "";
            return `${it.name}: ${line}kW total${phaseNote}`;
          }
          if (mode === "hp") return `${it.name} ×${it.qty || 0} @ ${it.hpEach || 0}HP (${line}kW)`;
          return `${it.name} ×${it.qty || 0} @ ${it.kwEach || 0}kW`;
        })
        .join("; "),
    });
  } else {
    rows.push({ label: "Load section", value: "Skipped (no additional load)" });
    rows.push({
      label: "New meters (total)",
      value: String(a.numberOfNewMeters || ""),
    });
    rows.push({
      label: "Meter capacity increase",
      value: a.meterCapacityIncrease ? "Yes" : "No",
    });
  }
  if (a.scopeOfWork) rows.push({ label: "Scope of work", value: a.scopeOfWork });
  if (a.equipmentName) rows.push({ label: "Equipment", value: a.equipmentName });
  rows.push({
    label: "Portal steps",
    value: `${portalWizardStepCount(a.requestType)} (stop at Review — you confirm submit)`,
  });
  return rows.filter((r) => r.value !== "" && r.value != null);
}
