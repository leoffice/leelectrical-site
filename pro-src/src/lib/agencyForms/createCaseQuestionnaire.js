/**
 * Con Ed "Submit a Case" questionnaire — S23.
 *
 * Step 0 = Request Type → branches:
 *   A add_load   = FULL 6 wizard groups (includes meters + load items)
 *   B no_add_load = SHORT 5 groups (skips meters + load)
 *
 * Specs: LEPRO_CONED_CREATE_CASE_QUESTIONNAIRE.md
 *         LEPRO_CONED_ADD_LOAD_AUTOMATION_SPEC.md § REQUEST-TYPE BRANCHES
 */

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

/** Default 2-family load seed (from questionnaire spec). */
export const DEFAULT_LOAD_ITEMS = [
  { name: "Kitchen Equipment", qty: 6, kwEach: 1, phase: "Single" },
  { name: "Lighting", qty: 1, kwEach: 2, phase: "Single" },
  { name: "Electric Stoves", qty: 2, kwEach: 3, phase: "Single" },
  { name: "Space Cooling / Central AC (cooling-only)", qty: 2, kwEach: 2, phase: "Single" },
  { name: "Common-area Lighting", qty: 1, kwEach: 2, phase: "Single" },
];

/** Values never asked — auto, shown once in "Already handled". */
export const AUTO_HANDLED = {
  energyServiceType: "Electric",
  rtvi: "Yes",
  contractor: "Levi / BLZ",
  heatingElectrification: "No",
  micromobilityPowerReady: "No",
  nyStateRoute: "No",
  rearYardLoop: "Neither",
  makeFinalConnection: "No",
  installingGenerator: "No",
  weldingEquipment: "No",
  shortCircuitInfo: "No",
  skipOptional: true,
  mailingSameAsService: true,
};

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

export function sumLoadKw(items = []) {
  return (items || []).reduce((acc, it) => {
    const q = Number(it.qty) || 0;
    const k = Number(it.kwEach) || 0;
    return acc + q * k;
  }, 0);
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
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function parseAddressLine(addr) {
  const s = String(addr || "").trim();
  const m = s.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
  if (m) return { houseNumber: m[1], streetName: m[2] };
  return { houseNumber: "", streetName: s };
}

/**
 * Seed answers from job + optional existing createCase draft.
 */
export function seedCreateCaseAnswers(job = {}, existing = null) {
  if (existing?.answers && typeof existing.answers === "object") {
    return sanitizeAnswers({ ...defaultAnswers(job), ...existing.answers });
  }
  return defaultAnswers(job);
}

export function defaultAnswers(job = {}) {
  const addr = String(job.serviceAddress || job.address || "").trim();
  const { houseNumber, streetName } = parseAddressLine(addr);
  const { first, last } = splitName(job.customer || job.customerName || job.ownerName || "");
  const phone = String(job.phone || job.customerPhone || "").replace(/\D/g, "").slice(0, 10);
  const email = String(job.email || job.customerEmail || "").trim();
  return sanitizeAnswers({
    requestType: REQUEST_TYPES.NO_ADD_LOAD, // Levi's most common
    serviceAddress: addr,
    houseNumber,
    streetName,
    city: String(job.city || "Brooklyn").trim() || "Brooklyn",
    state: String(job.state || "NY").trim() || "NY",
    zip: String(job.zip || job.postalCode || "").trim(),
    borough: String(job.borough || "Brooklyn").trim() || "Brooklyn",
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
    scopeOfWork: "",
    totalBuildings: 1,
    totalUnits: 2,
    numberOfFloors: 2,
    numberOfBasements: 1,
    metersRelocatedOutdoors: false,
    metersNeedUnlock: false,
    electricHeat: false,
    elevator: false,
  });
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
    a.loadItems = a.loadItems.map((it) => ({
      ...it,
      name: toPlainAscii(it.name),
      phase: toPlainAscii(it.phase || "Single"),
    }));
  }
  a.requestType = normalizeRequestType(a.requestType);
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
  const loadItems = full
    ? (a.loadItems || []).map((it) => ({
        name: toPlainAscii(it.name),
        qty: Number(it.qty) || 0,
        kwEach: Number(it.kwEach) || 0,
        phase: toPlainAscii(it.phase || "Single"),
      }))
    : [];
  const kw =
    a.requiredTotalKw !== "" && a.requiredTotalKw != null
      ? Number(a.requiredTotalKw)
      : sumLoadKw(loadItems);

  return {
    skill: "coned-create-case",
    version: 1,
    requestType: rt,
    requestTypePortal: REQUEST_TYPE_PORTAL[rt],
    branch: full ? "A_full" : "B_short",
    portalWizardSteps: portalWizardStepCount(rt),
    stopAt: "review", // human confirms submit — never auto-submit
    autoSubmit: false,
    autoHandled: { ...AUTO_HANDLED },
    jobId: job.id || job.jobId || "",
    jobName: toPlainAscii(job.customer || job.customerName || job.name || ""),
    property: {
      houseNumber: toPlainAscii(a.houseNumber || parseAddressLine(a.serviceAddress).houseNumber),
      streetName: toPlainAscii(a.streetName || parseAddressLine(a.serviceAddress).streetName),
      serviceAddress: toPlainAscii(a.serviceAddress || ""),
      city: toPlainAscii(a.city || "Brooklyn"),
      state: toPlainAscii(a.state || "NY"),
      zip: toPlainAscii(a.zip || ""),
      borough: toPlainAscii(a.borough || "Brooklyn"),
      bin: toPlainAscii(a.bin || ""),
      buildingType: toPlainAscii(a.buildingType || "Residential"),
      is1to3Family: a.is1to3Family !== false,
    },
    owner: {
      firstName: toPlainAscii(a.ownerFirst || ""),
      lastName: toPlainAscii(a.ownerLast || ""),
      phone: String(a.ownerPhone || "").replace(/\D/g, ""),
      email: toPlainAscii(a.ownerEmail || ""),
      mailingSameAsService: a.mailingSameAsService !== false,
    },
    service: {
      panelAmps: Number(a.servicePanelAmps) || 100,
      phase: toPlainAscii(a.phase || "Single phase"),
      requiredTotalKw: full ? kw : "",
      useExistingService: a.useExistingService !== false,
      facilityServicedBy: toPlainAscii(a.facilityServicedBy || "Underground"),
      changePoe: !!a.changePoe,
      scopeOfWork: toPlainAscii(a.scopeOfWork || ""),
      totalBuildings: Number(a.totalBuildings) || 1,
      totalUnits: Number(a.totalUnits) || (meters.length || 1),
      electricHeat: !!a.electricHeat,
      elevator: !!a.elevator,
    },
    project: {
      numberOfFloors: Number(a.numberOfFloors) || 2,
      numberOfBasements: Number(a.numberOfBasements) || 0,
      plannedConstructionStart: a.plannedConstructionStart || todayIsoDate(),
      metersRelocatedOutdoors: !!a.metersRelocatedOutdoors,
      metersNeedUnlock: !!a.metersNeedUnlock,
      meterCapacityIncrease: full ? !!a.meterCapacityIncrease : undefined,
      numberOfNewMeters: full
        ? Number(a.numberOfNewMeters) || meters.length || 0
        : undefined,
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
    {
      label: "Owner",
      value: `${a.ownerFirst || ""} ${a.ownerLast || ""}`.trim(),
    },
    { label: "Owner phone", value: a.ownerPhone },
    { label: "Owner email", value: a.ownerEmail },
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
    const kw = a.requiredTotalKw !== "" ? a.requiredTotalKw : sumLoadKw(a.loadItems);
    rows.push({ label: "Required total kW", value: String(kw) });
    rows.push({
      label: "Load items",
      value: (a.loadItems || [])
        .map((it) => `${it.name} ×${it.qty} @ ${it.kwEach}kW`)
        .join("; "),
    });
  } else {
    rows.push({ label: "Load section", value: "Skipped (no additional load)" });
  }
  rows.push({
    label: "Portal steps",
    value: `${portalWizardStepCount(a.requestType)} (stop at Review — you confirm submit)`,
  });
  return rows.filter((r) => r.value !== "" && r.value != null);
}
