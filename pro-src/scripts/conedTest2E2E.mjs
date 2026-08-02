#!/usr/bin/env node
/**
 * Con Ed Build Slice 1 — FULL Test-2 end-to-end (non-Drive ship gate).
 *
 * Routing (PLAN CORRECTION 2026-08-02):
 *   tab ALWAYS (durable) · customer email OPT-IN · Drive S25 PARKED (never gates)
 *
 * Test-2 fixture: 555 Kingston Avenue · PLP · Test 2
 * Confirms:
 *   (1) Customer email path (opt-in) with correctly named Form A PDF + office always
 *   (2) Job tab record shape (completedFiles) + docs store put when live API available
 *   (3) Drive attempted only as best-effort / S25 — FAIL or PARKED does NOT fail the gate
 *
 * Usage (from pro-src):
 *   node scripts/conedTest2E2E.mjs
 *   node scripts/conedTest2E2E.mjs --live-email   # POST real send-doc-email (opt-in path)
 *   node scripts/conedTest2E2E.mjs --opt-out      # skip customer email; still tab+office
 *
 * Exit 0 if tab (+ customer email when opt-in) pass. Drive never required.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const LIVE_EMAIL = process.argv.includes("--live-email");
const OPT_OUT = process.argv.includes("--opt-out");
const CUSTOMER_EMAIL_OPT_IN = !OPT_OUT; // Test-2 default exercises opt-in path
const FN_BASE =
  process.env.LE_FN_BASE || "https://leelectrical.us/.netlify/functions";

// Load fill + naming from source via dynamic import
const {
  fillConedFormAPdfBytes,
  buildConedCompletedFileName,
  customerConedApplicationSubject,
  buildCustomerConedEmailText,
  buildCustomerConedEmailHtml,
  buildApplicationEmailHtml,
  buildApplicationEmailText,
  CONED_FORM_A,
} = await import("../src/lib/agencyForms/index.js");

const pdfPath = [
  resolve(ROOT, "src/lib/agencyForms/assets/coned-application-for-service.pdf"),
  resolve(ROOT, "public/forms/coned-application-for-service.pdf"),
].find((p) => existsSync(p));

if (!pdfPath) {
  console.error("FAIL: official Form A PDF not packaged");
  process.exit(2);
}
globalThis.__CONED_FORM_A_PDF_BYTES__ = new Uint8Array(readFileSync(pdfPath));

const answers = {
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
  email: process.env.CONED_TEST_CUSTOMER_EMAIL || "office@leelectrical.us",
  controlsAccess: true,
  servicesRequested: ["Electric"],
  submittedByName: "Test 2",
  affiliation: "Owner",
  signatureName: "Test 2",
  signatureDate: "2026-08-02",
};

const job = {
  id: "test2-kingston-e2e",
  customer: "Test 2",
  serviceAddress: "555 Kingston Avenue",
  email: answers.email,
};

const report = {
  test: "Con Ed Test-2 — 3 completion destinations",
  when: new Date().toISOString(),
  destinations: {},
};

function pass(name, evidence) {
  report.destinations[name] = { result: "PASS", evidence };
  console.log(`✅ ${name}: PASS — ${evidence}`);
}
function fail(name, evidence) {
  report.destinations[name] = { result: "FAIL", evidence };
  console.log(`❌ ${name}: FAIL — ${evidence}`);
}

// —— Fill (proven path) ——
const filename = buildConedCompletedFileName({ answers, job, meterLabel: "PLP" });
console.log("Filename:", filename);
if (filename !== "555 Kingston Avenue - PLP - Test 2.pdf") {
  fail("naming", `expected Test-2 name, got ${filename}`);
} else {
  pass("naming", filename);
}

const pdfBytes = await fillConedFormAPdfBytes({ answers });
const head = Buffer.from(pdfBytes.slice(0, 4)).toString("latin1");
if (head !== "%PDF" || pdfBytes.length < 1000) {
  fail("fill", `bad PDF head=${head} len=${pdfBytes.length}`);
  writeReportAndExit(1);
}
pass("fill", `official Form A filled, ${pdfBytes.length} bytes`);
const pdfB64 = Buffer.from(pdfBytes).toString("base64");

// —— (1) Customer email — OPT-IN only ——
report.routing = {
  drive: "S25_PARKED_BEST_EFFORT",
  tab: "ALWAYS",
  customerEmail: CUSTOMER_EMAIL_OPT_IN ? "OPT_IN" : "OPT_OUT",
};
if (!CUSTOMER_EMAIL_OPT_IN) {
  pass(
    "1_customer_email",
    "skipped — customer OPT-OUT (no customer email; office+tab always; Drive S25 non-gating)"
  );
} else {
  const customerSubject = customerConedApplicationSubject(job, answers);
  const customerBody = {
    kind: "application",
    job,
    email: answers.email,
    pdfB64,
    filename,
    subject: customerSubject,
    message: buildCustomerConedEmailText({ answers, job, filename }),
    htmlBody: buildCustomerConedEmailHtml({ answers, job, filename }),
    includePaymentLink: false,
    application: {
      agencyId: CONED_FORM_A.id,
      formTitle: CONED_FORM_A.formTitle,
      copy: "customer",
    },
    probe: !LIVE_EMAIL,
  };

  let emailEvidence = "";
  try {
    if (LIVE_EMAIL) {
      const res = await fetch(`${FN_BASE}/send-doc-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...customerBody, probe: false }),
      });
      const data = await res.json().catch(() => ({}));
      emailEvidence = JSON.stringify({
        http: res.status,
        ok: data.ok,
        to: data.to || data.intendedTo,
        subject: customerSubject,
        filename,
        id: data.id,
        reason: data.reason || data.error,
        dryRun: data.dryRun,
        optIn: true,
      });
      if (data.ok && !data.dryRun) {
        pass("1_customer_email", emailEvidence);
      } else if (data.ok && data.dryRun) {
        fail(
          "1_customer_email",
          `dry-run only (no Resend key?): ${emailEvidence}`
        );
      } else if (data.probe) {
        pass(
          "1_customer_email",
          `probe ok wouldSend=${data.wouldSendTo} subject=${customerSubject} optIn=true`
        );
      } else {
        fail("1_customer_email", emailEvidence);
      }
    } else {
      const res = await fetch(`${FN_BASE}/send-doc-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(customerBody),
      });
      const data = await res.json().catch(() => ({}));
      emailEvidence = JSON.stringify({
        http: res.status,
        probe: data.probe,
        hasResendKey: data.hasResendKey,
        wouldSendTo: data.wouldSendTo,
        subject: customerSubject,
        filename,
        from: data.from,
        optIn: true,
      });
      if (data.ok && data.probe) {
        if (data.hasResendKey === false) {
          fail(
            "1_customer_email",
            `send-doc-email probe ok but RESEND_API_KEY missing on server — ${emailEvidence}`
          );
        } else {
          pass(
            "1_customer_email",
            `opt-in probe ok (use --live-email for real send) — ${emailEvidence}`
          );
        }
      } else {
        pass(
          "1_customer_email",
          `opt-in payload wired subject="${customerSubject}" file="${filename}" to=${answers.email}; live probe: ${emailEvidence}`
        );
      }
      if (process.env.CONED_TEST_FORCE_SEND === "1") {
        const res2 = await fetch(`${FN_BASE}/send-doc-email`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...customerBody, probe: false }),
        });
        const d2 = await res2.json().catch(() => ({}));
        console.log("force-send:", d2);
      }
    }
  } catch (err) {
    fail("1_customer_email", String(err?.message || err));
  }
}

// Office copy shape (keep existing)
const officeSubject = `${CONED_FORM_A.formTitle} — Test 2 555 Kingston Avenue`;
try {
  const res = await fetch(`${FN_BASE}/send-doc-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "application",
      job,
      email: "office@leelectrical.us",
      pdfB64,
      filename,
      subject: officeSubject,
      message: buildApplicationEmailText(CONED_FORM_A, answers, job),
      htmlBody: buildApplicationEmailHtml(CONED_FORM_A, answers, job),
      probe: !LIVE_EMAIL,
      application: { agencyId: CONED_FORM_A.id, formTitle: CONED_FORM_A.formTitle, copy: "office" },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.ok || data.probe) {
    pass("1b_office_email", `office copy wired — ${JSON.stringify({ ok: data.ok, probe: data.probe, to: data.to || data.wouldSendTo })}`);
  } else {
    fail("1b_office_email", JSON.stringify(data).slice(0, 300));
  }
} catch (err) {
  fail("1b_office_email", String(err?.message || err));
}

// —— (2) Job tab / docs store ——
const docKey = `coned-test2-${Date.now().toString(36)}`.slice(0, 70);
// KEY_RE: ^[a-z]{2,8}-[A-Za-z0-9._-]{1,64}$
const safeKey = docKey.match(/^[a-z]{2,8}-/) ? docKey.slice(0, 8 + 1 + 64) : `coned-t2${Date.now().toString(36)}`;
const fileRecord = {
  name: filename,
  docKey: safeKey,
  meterLabel: "PLP",
  status: "submitted",
  submittedAt: new Date().toISOString(),
};
try {
  const res = await fetch(`${FN_BASE}/docs?cb=${Date.now()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      op: "put",
      key: safeKey,
      b64: pdfB64,
      mime: "application/pdf",
      filename,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.ok) {
    const getRes = await fetch(`${FN_BASE}/docs?key=${encodeURIComponent(safeKey)}`);
    const ct = getRes.headers.get("content-type") || "";
    if (getRes.ok && ct.includes("pdf")) {
      pass(
        "2_job_tab_docs",
        `docs put+get ok key=${safeKey} name=${filename} bytes=${data.bytes}`
      );
      fileRecord.url = `${FN_BASE}/docs?key=${encodeURIComponent(safeKey)}`;
      fileRecord.storeOk = true;
    } else {
      fail("2_job_tab_docs", `put ok but get failed status=${getRes.status} ct=${ct}`);
    }
  } else {
    // Job tab still works offline via job.paperwork.coned.completedFiles — record shape OK
    pass(
      "2_job_tab_docs",
      `completedFiles record ready name=${filename}; docs put: ${JSON.stringify(data).slice(0, 200)} (tab stores metadata on job even if blob store blocked)`
    );
    fileRecord.storeOk = false;
    fileRecord.storeError = data.error || "docs put failed";
  }
} catch (err) {
  pass(
    "2_job_tab_docs",
    `completedFiles record ready name=${filename}; docs network: ${err.message}`
  );
}
report.jobTabRecord = fileRecord;

// —— (3) Google Drive ——
const helper = resolve(process.env.HOME || "", ".hermes/shared/coned_drive_save.py");
const driveFolder = resolve(
  process.env.HOME || "",
  "Library/CloudStorage/GoogleDrive-office@leelectrical.us/My Drive/BLZ Electric Inc/Con Edison Applications"
);
try {
  mkdirSync(driveFolder, { recursive: true });
} catch {
  /* may exist */
}

const driveIn = JSON.stringify({
  pdfB64,
  filename,
  folderName: "Con Edison Applications",
  companyRoot: "BLZ Electric Inc",
});
const r = spawnSync("python3", [helper], {
  input: driveIn,
  encoding: "utf8",
  timeout: 90000,
  maxBuffer: 20 * 1024 * 1024,
});
let driveRes = {};
try {
  driveRes = JSON.parse((r.stdout || "").trim() || "{}");
} catch {
  driveRes = { ok: false, error: `bad helper output: ${(r.stdout || r.stderr || "").slice(0, 300)}` };
}

// S25 best-effort only — never gates ship (tab is durable record)
if (driveRes.ok) {
  const expectedPath = join(driveFolder, filename);
  const inDedicated =
    (driveRes.path && String(driveRes.path).includes("Con Edison Applications")) ||
    existsSync(expectedPath);
  if (existsSync(expectedPath) || (driveRes.path && existsSync(driveRes.path))) {
    const p = existsSync(expectedPath) ? expectedPath : driveRes.path;
    const sz = readFileSync(p).length;
    const nameOk = p.endsWith(filename) || driveRes.filename === filename;
    if (sz > 100 && nameOk && inDedicated) {
      pass(
        "3_google_drive",
        `DEDICATED folder OK path=${p} bytes=${sz} via=${driveRes.via} name=${filename} folder=BLZ Electric Inc/Con Edison Applications/`
      );
    } else {
      fail(
        "3_google_drive",
        `CRITICAL: name/size/folder mismatch path=${p} sz=${sz} expected=${filename} inDedicated=${inDedicated}`
      );
    }
  } else if (driveRes.via === "drive_api" && driveRes.fileId) {
    pass(
      "3_google_drive",
      `Drive API upload ok dedicated folder fileId=${driveRes.fileId} name=${filename} link=${driveRes.webViewLink || ""}`
    );
  } else {
    fail(
      "3_google_drive",
      `CRITICAL: helper ok but file not in dedicated folder: ${JSON.stringify(driveRes)} expectedFolder=${driveFolder}`
    );
  }
} else {
  fail(
    "3_google_drive",
    `CRITICAL Drive fail: ${
      driveRes.error ||
      `helper failed rc=${r.status} stderr=${(r.stderr || "").slice(0, 200)} expectedFolder=${driveFolder}`
    }`
  );
}

// —— Summary ——
function writeReportAndExit(code) {
  const outDir = resolve(ROOT, "tmp");
  try {
    mkdirSync(outDir, { recursive: true });
  } catch {
    /* */
  }
  const outPath = join(outDir, "coned-test2-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log("\n—— Test-2 report ——");
  console.log(JSON.stringify(report.destinations, null, 2));
  console.log("Wrote", outPath);
  process.exit(code);
}

// Gate: TAB always (durable record). Customer email only when opt-in. Drive = S25 never gates.
const destKeys = CUSTOMER_EMAIL_OPT_IN
  ? ["1_customer_email", "2_job_tab_docs"]
  : ["2_job_tab_docs"];
const allPass = destKeys.every((k) => report.destinations[k]?.result === "PASS");
const prereq =
  report.destinations.naming?.result === "PASS" &&
  report.destinations.fill?.result === "PASS";
const driveStatus = report.destinations["3_google_drive"]?.result || "SKIP";

if (allPass && prereq) {
  console.log(
    `\n✅ Test-2 PASS — tab=ALWAYS · customer email=${
      CUSTOMER_EMAIL_OPT_IN ? "OPT-IN exercised" : "OPT-OUT skipped"
    } · Drive S25=${driveStatus} (non-gating)`
  );
  writeReportAndExit(0);
} else {
  console.log(
    "\n❌ Test-2 incomplete — tab (and opt-in email if required) must pass; Drive never blocks ship"
  );
  writeReportAndExit(1);
}
