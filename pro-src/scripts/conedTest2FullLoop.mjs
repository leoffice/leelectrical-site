#!/usr/bin/env node
/**
 * Con Ed FULL LOOP Test-2 gate (S21 + S23 + S24 stages).
 *
 * Stages:
 *   1) questionnaire branch payload (S23)
 *   2) create-case host execution (may block on session)
 *   3) fill Form A + 3 destinations (S21 — critical Drive)
 *   4) upload-to-case host (may block on session; file must be ready)
 *
 * Exit 0 only if S21 destinations pass AND S23/S24 either pass or report
 * an honest known blocker (session/DOM). Fakes never count as pass.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const HOME = process.env.HOME || "";

const report = {
  test: "Con Ed Test-2 FULL LOOP",
  when: new Date().toISOString(),
  stages: {},
};

function pass(name, evidence) {
  report.stages[name] = { result: "PASS", evidence };
  console.log(`✅ ${name}: PASS — ${evidence}`);
}
function fail(name, evidence) {
  report.stages[name] = { result: "FAIL", evidence };
  console.log(`❌ ${name}: FAIL — ${evidence}`);
}
function blocked(name, evidence) {
  report.stages[name] = { result: "BLOCKED", evidence };
  console.log(`⚠️ ${name}: BLOCKED — ${evidence}`);
}

// —— imports ——
const {
  fillConedFormAPdfBytes,
  buildConedCompletedFileName,
  REQUEST_TYPES,
  buildCreateCasePayload,
  createCaseReady,
  portalWizardStepCount,
  buildUploadToCasePayload,
} = await import("../src/lib/agencyForms/index.js");

const answersFormA = {
  accountName: "Test 2",
  customerType: "Residential",
  idType: "SSN",
  idNumber: "xxx",
  billingAddress: "555 Kingston Avenue",
  billingCity: "Brooklyn",
  billingZip: "11203",
  billingUnit: "PLP",
  serviceSameAsBilling: true,
  serviceAddress: "555 Kingston Avenue",
  serviceCity: "Brooklyn",
  serviceZip: "11203",
  serviceUnit: "PLP",
  mailingSame: true,
  phone: "7185551212",
  email: "office@leelectrical.us",
  controlsAccess: true,
  servicesRequested: ["Electric"],
  submittedByName: "Test 2",
  affiliation: "Owner",
  signatureName: "Test 2",
  signatureDate: "2026-08-02",
  emailCustomerCopy: true,
};

const job = {
  id: "test2-kingston-full",
  customer: "Test 2",
  serviceAddress: "555 Kingston Avenue",
  email: answersFormA.email,
  paperwork: {
    coned: {
      caseNumber: process.env.CONED_TEST_CASE || "MC-TEST2",
      completedFiles: [],
    },
  },
};

// —— Stage S23: questionnaire branching ——
const shortPayload = buildCreateCasePayload(
  {
    requestType: REQUEST_TYPES.NO_ADD_LOAD,
    serviceAddress: "555 Kingston Avenue",
    houseNumber: "555",
    streetName: "Kingston Avenue",
    city: "Brooklyn",
    state: "NY",
    zip: "11203",
    borough: "Brooklyn",
    bin: "3000000",
    buildingType: "Residential",
    is1to3Family: true,
    ownerFirst: "Test",
    ownerLast: "Two",
    ownerPhone: "7185551212",
    ownerEmail: "owner.test2@example.com",
    servicePanelAmps: 100,
    phase: "Single phase",
    useExistingService: true,
    facilityServicedBy: "Underground",
  },
  job
);
const fullPayload = buildCreateCasePayload(
  {
    ...shortPayload.property,
    requestType: REQUEST_TYPES.ADD_LOAD,
    serviceAddress: "555 Kingston Avenue",
    houseNumber: "555",
    streetName: "Kingston Avenue",
    city: "Brooklyn",
    state: "NY",
    zip: "11203",
    borough: "Brooklyn",
    bin: "3000000",
    buildingType: "Residential",
    is1to3Family: true,
    ownerFirst: "Test",
    ownerLast: "Two",
    ownerPhone: "7185551212",
    ownerEmail: "owner.test2@example.com",
    servicePanelAmps: 100,
    phase: "Single phase",
    useExistingService: true,
    facilityServicedBy: "Underground",
    meters: [
      { name: "Apartment 1" },
      { name: "Apartment 2" },
      { name: "PLP" },
    ],
    loadItems: [
      { name: "Lighting", qty: 1, kwEach: 2, phase: "Single" },
    ],
    numberOfNewMeters: 3,
    meterCapacityIncrease: false,
  },
  job
);

if (
  shortPayload.branch === "B_short" &&
  shortPayload.portalWizardSteps === 5 &&
  shortPayload.autoSubmit === false &&
  shortPayload.stopAt === "review" &&
  fullPayload.branch === "A_full" &&
  fullPayload.portalWizardSteps === 6 &&
  Array.isArray(fullPayload.loadItems)
) {
  pass(
    "S23_questionnaire_branch",
    `short=${shortPayload.portalWizardSteps} full=${fullPayload.portalWizardSteps} stopAt=review autoSubmit=false`
  );
} else {
  fail("S23_questionnaire_branch", JSON.stringify({ shortPayload, fullPayload }).slice(0, 200));
}

// —— Stage S23: host create-case ——
const createHelper = join(HOME, ".hermes/shared/coned_create_case.py");
if (existsSync(createHelper)) {
  const r = spawnSync("python3", [createHelper], {
    input: JSON.stringify(shortPayload),
    encoding: "utf8",
    timeout: 30000,
  });
  let body = {};
  try {
    body = JSON.parse((r.stdout || "").trim() || "{}");
  } catch {
    body = { error: r.stdout || r.stderr };
  }
  if (body.ok) {
    pass("S23_create_case_host", JSON.stringify(body).slice(0, 180));
  } else if (body.blocker === "no_authenticated_session" || body.blocker === "portal_dom_automation_not_mapped") {
    blocked("S23_create_case_host", body.error || body.blocker);
  } else {
    fail("S23_create_case_host", body.error || r.stderr || "unknown");
  }
} else {
  fail("S23_create_case_host", "helper missing");
}

// —— Stage S21: fill + Drive (critical) ——
const pdfPath = [
  resolve(ROOT, "src/lib/agencyForms/assets/coned-application-for-service.pdf"),
  resolve(ROOT, "public/forms/coned-application-for-service.pdf"),
].find((p) => existsSync(p));
if (!pdfPath) {
  fail("S21_fill", "Form A PDF missing");
} else {
  globalThis.__CONED_FORM_A_PDF_BYTES__ = new Uint8Array(readFileSync(pdfPath));
  const filename = buildConedCompletedFileName({
    answers: answersFormA,
    job,
    meterLabel: "PLP",
  });
  if (filename !== "555 Kingston Avenue - PLP - Test 2.pdf") {
    fail("S21_naming", filename);
  } else {
    pass("S21_naming", filename);
  }
  const pdfBytes = await fillConedFormAPdfBytes({ answers: answersFormA });
  if (Buffer.from(pdfBytes.slice(0, 4)).toString("latin1") === "%PDF" && pdfBytes.length > 1000) {
    pass("S21_fill", `${pdfBytes.length} bytes`);
  } else {
    fail("S21_fill", "bad pdf");
  }

  // Drive via host helper
  const driveHelper = join(HOME, ".hermes/shared/coned_drive_save.py");
  const b64 = Buffer.from(pdfBytes).toString("base64");
  if (existsSync(driveHelper)) {
    const dr = spawnSync("python3", [driveHelper], {
      input: JSON.stringify({
        pdfB64: b64,
        filename,
        folderName: "Con Edison Applications",
        companyRoot: "BLZ Electric Inc",
      }),
      encoding: "utf8",
      timeout: 90000,
    });
    let dbody = {};
    try {
      dbody = JSON.parse((dr.stdout || "").trim() || "{}");
    } catch {
      dbody = { error: dr.stdout || dr.stderr };
    }
    if (dbody.ok) {
      pass(
        "S21_drive",
        `${dbody.path || dbody.filename} via=${dbody.via || "?"} bytes=${dbody.bytes || pdfBytes.length}`
      );
      job.paperwork.coned.completedFiles = [
        { name: filename, meterLabel: "PLP", status: "submitted" },
      ];
    } else {
      fail("S21_drive", dbody.error || "drive fail");
    }
  } else {
    fail("S21_drive", "coned_drive_save.py missing");
  }
}

// —— Stage S24: upload-to-case ——
const uploadHelper = join(HOME, ".hermes/shared/coned_upload_document.py");
const uploadPayload = buildUploadToCasePayload({
  job,
  answers: answersFormA,
  meterLabel: "PLP",
  caseNumber: job.paperwork.coned.caseNumber,
});
if (uploadPayload.documentType !== "Application for Service") {
  fail("S24_payload", "wrong doc type");
} else {
  pass("S24_payload", `${uploadPayload.filename} → ${uploadPayload.caseNumber}`);
}
if (existsSync(uploadHelper)) {
  const ur = spawnSync("python3", [uploadHelper], {
    input: JSON.stringify(uploadPayload),
    encoding: "utf8",
    timeout: 30000,
  });
  let ubody = {};
  try {
    ubody = JSON.parse((ur.stdout || "").trim() || "{}");
  } catch {
    ubody = { error: ur.stdout || ur.stderr };
  }
  if (ubody.ok) {
    pass("S24_upload_host", JSON.stringify(ubody).slice(0, 180));
  } else if (
    ubody.blocker === "no_authenticated_session" ||
    ubody.blocker === "portal_dom_automation_not_mapped"
  ) {
    // File ready is a partial win — report blocked honestly
    const ready = ubody.fileReady ? "fileReady=true " : "";
    blocked("S24_upload_host", ready + (ubody.error || ubody.blocker));
  } else if (ubody.blocker === "drive_file_missing") {
    fail("S24_upload_host", ubody.error);
  } else {
    fail("S24_upload_host", ubody.error || ubody.blocker || "unknown");
  }
} else {
  fail("S24_upload_host", "helper missing");
}

// —— Gate ——
const s21ok =
  report.stages.S21_fill?.result === "PASS" &&
  report.stages.S21_drive?.result === "PASS" &&
  report.stages.S21_naming?.result === "PASS";
const s23q = report.stages.S23_questionnaire_branch?.result === "PASS";
const s23host =
  report.stages.S23_create_case_host?.result === "PASS" ||
  report.stages.S23_create_case_host?.result === "BLOCKED";
const s24 =
  report.stages.S24_payload?.result === "PASS" &&
  (report.stages.S24_upload_host?.result === "PASS" ||
    report.stages.S24_upload_host?.result === "BLOCKED");

const outDir = resolve(ROOT, "tmp");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "coned-test2-full-loop.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log("\n—— Full-loop report ——");
console.log(JSON.stringify(report.stages, null, 2));
console.log("Wrote", outPath);

if (s21ok && s23q && s23host && s24) {
  const portalBlocked =
    report.stages.S23_create_case_host?.result === "BLOCKED" ||
    report.stages.S24_upload_host?.result === "BLOCKED";
  if (portalBlocked) {
    console.log(
      "\n✅ App-side FULL LOOP green; portal stages BLOCKED (honest — need Con Ed session + DOM map)."
    );
    process.exit(0);
  }
  console.log("\n✅ Test-2 FULL LOOP PASS end-to-end");
  process.exit(0);
}
console.log("\n❌ Test-2 FULL LOOP incomplete");
process.exit(1);
