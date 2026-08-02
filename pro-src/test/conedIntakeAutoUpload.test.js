// S27 customer-fill intake + S28 auto upload-to-case.
//
// Contracts:
//  - buildApplyLink packs token + prefill + meters into the hash payload.
//  - mapIntakeAnswersToConed turns apply.html answers into conedFormA keys.
//  - intakeSubmissionToCompletedFiles yields tab records served from docs.
//  - autoUploadOnComplete queues the S24 host skill when a case number exists,
//    records waiting_case when it doesn't, and always notifies LE Pro.
//  - completeConedApplicationDestinations now runs the auto-upload after the
//    tab save (office-filled completions).
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildApplyLink } from "../../netlify/functions/coned-intake.mjs";
import {
  mapIntakeAnswersToConed,
  intakeSubmissionToCompletedFiles,
} from "../src/lib/agencyForms/conedIntake.js";
import {
  autoUploadOnComplete,
  autoUploadIfWaiting,
} from "../src/lib/agencyForms/autoUploadOnComplete.js";
import {
  CONED_FORM_A,
  completeConedApplicationDestinations,
} from "../src/lib/agencyForms/index.js";

const INTAKE_ANSWERS = {
  accountName: "Test 2",
  customerType: "Residential",
  serviceStreet: "555 Kingston Avenue",
  serviceCity: "Brooklyn",
  serviceState: "NY",
  serviceZip: "11225",
  unit: "PLP",
  mailingSame: true,
  phone: "7185551212",
  email: "customer.test2@example.com",
  accessOk: true,
  signName: "Test 2",
  signAffil: "Owner",
  printName: "Test 2",
  signDate: "2026-08-02",
};

beforeAll(() => {
  const candidates = [
    resolve(__dirname, "../src/lib/agencyForms/assets/coned-application-for-service.pdf"),
    resolve(__dirname, "../public/forms/coned-application-for-service.pdf"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      globalThis.__CONED_FORM_A_PDF_BYTES__ = new Uint8Array(readFileSync(p));
      return;
    }
  }
  throw new Error("Test setup: packaged coned-application-for-service.pdf not found");
});

afterEach(() => vi.unstubAllGlobals());

function decodeHash(link) {
  const h = link.split("#")[1];
  let b = h.replace(/-/g, "+").replace(/_/g, "/");
  while (b.length % 4) b += "=";
  return JSON.parse(Buffer.from(b, "base64").toString("utf8"));
}

describe("buildApplyLink", () => {
  it("packs token, job, prefill and meters into the hash", () => {
    const link = buildApplyLink({
      token: "tok123",
      jobId: "job-9",
      prefill: {
        customer: "Test 2",
        serviceStreet: "555 Kingston Avenue",
        serviceCity: "Brooklyn",
        serviceZip: "11225",
        email: "c@x.com",
      },
      meters: [{ name: "Test 2", unit: "2B" }, { name: "PLP" }],
    });
    expect(link).toMatch(
      /^https:\/\/www\.leelectrical\.us\/app\/coned\/apply\.html#/
    );
    const cfg = decodeHash(link);
    expect(cfg.t).toBe("tok123");
    expect(cfg.jobId).toBe("job-9");
    expect(cfg.customer).toBe("Test 2");
    expect(cfg.meters.length).toBe(2);
    expect(cfg.meters[0].unit).toBe("2B");
  });
});

describe("mapIntakeAnswersToConed", () => {
  it("maps customer page answers onto conedFormA keys", () => {
    const out = mapIntakeAnswersToConed(INTAKE_ANSWERS, {});
    expect(out.accountName).toBe("Test 2");
    expect(out.serviceAddress).toBe("555 Kingston Avenue");
    expect(out.serviceUnit).toBe("PLP");
    expect(out.billingAddress).toBe("555 Kingston Avenue");
    expect(out.serviceSameAsBilling).toBe(true);
    expect(out.controlsAccess).toBe(true);
    expect(out.servicesRequested).toEqual(["Electric"]);
    expect(out.signatureName).toBe("Test 2");
    expect(out.signatureDate).toBe("2026-08-02");
    expect(out.affiliation).toBe("Owner");
  });
  it("carries mailing + access contacts when different", () => {
    const out = mapIntakeAnswersToConed(
      {
        ...INTAKE_ANSWERS,
        mailingSame: false,
        mailStreet: "1 Main St",
        mailCity: "Queens",
        mailZip: "11101",
        accessOk: false,
        accessName: "Super Joe",
        accessPhone: "7180000000",
      },
      {}
    );
    expect(out.mailingSame).toBe(false);
    expect(out.mailingAddress).toBe("1 Main St");
    expect(out.controlsAccess).toBe(false);
    expect(out.accessContactName).toBe("Super Joe");
  });
});

describe("intakeSubmissionToCompletedFiles", () => {
  it("turns per-meter submissions into tab file records", () => {
    const files = intakeSubmissionToCompletedFiles(
      {
        meters: {
          "Test 2": {
            meterLabel: "Test 2",
            docKey: "cnint-job9-Test_2-abc",
            filename: "555 Kingston Avenue - PLP - Test 2.pdf",
            submittedAt: "2026-08-02T12:00:00Z",
            answers: { accountName: "Test 2", serviceStreet: "555 Kingston Avenue" },
          },
        },
      },
      { base: () => "https://leelectrical.us/.netlify/functions" }
    );
    expect(files.length).toBe(1);
    expect(files[0].status).toBe("customer_submitted");
    expect(files[0].url).toContain("/docs?key=cnint-job9-Test_2-abc");
    expect(files[0].source).toBe("customer_intake");
  });
});

describe("autoUploadOnComplete (S28)", () => {
  const jobWithFile = (extra = {}) => ({
    id: "job-9",
    customer: "Test 2",
    serviceAddress: "555 Kingston Avenue",
    paperwork: {
      coned: {
        enabled: true,
        completedFiles: [
          {
            name: "555 Kingston Avenue - PLP - Test 2.pdf",
            docKey: "coned-job9-plp-x",
            meterLabel: "PLP",
            status: "submitted",
          },
        ],
        ...extra,
      },
    },
  });

  it("queues the S24 upload + notification when a case number exists", async () => {
    const enqueued = [];
    const patches = [];
    const r = await autoUploadOnComplete({
      job: jobWithFile({ caseNumber: "MC-123456" }),
      meterLabel: "PLP",
      source: "office",
      enqueue: async (type, jobId, payload) => enqueued.push({ type, jobId, payload }),
      onSave: (p) => patches.push(p),
    });
    expect(r.queued).toBe(true);
    expect(r.caseNumber).toBe("MC-123456");
    expect(enqueued.length).toBe(1);
    expect(enqueued[0].type).toBe("coned_upload_document");
    expect(enqueued[0].payload.caseNumber).toBe("MC-123456");
    expect(enqueued[0].payload.documentType).toBe("Application for Service");
    expect(enqueued[0].payload.autoSubmit).toBe(false);
    const notif = patches[0].paperwork.coned.notifications;
    expect(notif.some((n) => n.type === "upload_queued")).toBe(true);
  });

  it("records waiting_case (no queue) when there is no case number", async () => {
    const enqueued = [];
    const patches = [];
    const r = await autoUploadOnComplete({
      job: jobWithFile(),
      meterLabel: "PLP",
      enqueue: async (...a) => enqueued.push(a),
      onSave: (p) => patches.push(p),
    });
    expect(r.queued).toBe(false);
    expect(r.waitingForCase).toBe(true);
    expect(enqueued.length).toBe(0);
    expect(patches[0].paperwork.coned.uploadDocument.status).toBe("waiting_case");
    expect(
      patches[0].paperwork.coned.notifications.some(
        (n) => n.type === "upload_waiting_case"
      )
    ).toBe(true);
  });

  it("autoUploadIfWaiting fires once the case number lands", async () => {
    const enqueued = [];
    const job = jobWithFile({
      caseNumber: "MC-777777",
      uploadDocument: { status: "waiting_case", meterLabel: "PLP", source: "customer" },
    });
    const r = await autoUploadIfWaiting({
      job,
      enqueue: async (type, jobId, payload) => enqueued.push({ type, payload }),
      onSave: () => {},
    });
    expect(r.queued).toBe(true);
    expect(enqueued[0].payload.caseNumber).toBe("MC-777777");
  });
});

describe("completion runs the auto-upload (office fill)", () => {
  it("waits for case when none, without gating success", async () => {
    const patches = [];
    const enqueued = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        if (String(url).includes("/docs") && init?.method === "POST") {
          return { ok: true, json: async () => ({ ok: true, key: "coned-test", bytes: 900 }) };
        }
        return { ok: false, json: async () => ({ ok: false }) };
      })
    );
    const result = await completeConedApplicationDestinations({
      agency: CONED_FORM_A,
      answers: {
        accountName: "Test 2",
        customerType: "Residential",
        billingAddress: "555 Kingston Avenue",
        billingUnit: "PLP",
        serviceSameAsBilling: true,
        serviceAddress: "555 Kingston Avenue",
        serviceUnit: "PLP",
        phone: "7185551212",
        email: "c@x.com",
        servicesRequested: ["Electric"],
        signatureName: "Test 2",
        signatureDate: "2026-08-02",
      },
      job: { id: "job-9", customer: "Test 2", serviceAddress: "555 Kingston Avenue" },
      api: { sendDocEmailNow: async () => ({ ok: true }) },
      onSave: (p) => patches.push(p),
      enqueue: async (type, jobId, payload) => enqueued.push({ type, payload }),
      emailCustomerCopy: false,
    });
    expect(result.success).toBe(true);
    expect(result.autoUpload.waitingForCase).toBe(true);
    // No case number -> no upload command; Drive best-effort may still queue.
    expect(enqueued.some((e) => e.type === "coned_upload_document")).toBe(false);
  });

  it("queues upload when the job already has a case number", async () => {
    const enqueued = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        if (String(url).includes("/docs") && init?.method === "POST") {
          return { ok: true, json: async () => ({ ok: true, key: "coned-test", bytes: 900 }) };
        }
        return { ok: false, json: async () => ({ ok: false }) };
      })
    );
    const result = await completeConedApplicationDestinations({
      agency: CONED_FORM_A,
      answers: {
        accountName: "Test 2",
        customerType: "Residential",
        billingAddress: "555 Kingston Avenue",
        billingUnit: "PLP",
        serviceSameAsBilling: true,
        serviceAddress: "555 Kingston Avenue",
        serviceUnit: "PLP",
        phone: "7185551212",
        email: "c@x.com",
        servicesRequested: ["Electric"],
        signatureName: "Test 2",
        signatureDate: "2026-08-02",
      },
      job: {
        id: "job-9",
        customer: "Test 2",
        serviceAddress: "555 Kingston Avenue",
        paperwork: { coned: { enabled: true, caseNumber: "MC-424242" } },
      },
      api: { sendDocEmailNow: async () => ({ ok: true }) },
      onSave: () => {},
      enqueue: async (type, jobId, payload) => enqueued.push({ type, payload }),
      emailCustomerCopy: false,
    });
    expect(result.success).toBe(true);
    expect(result.autoUpload.queued).toBe(true);
    const cmd = enqueued.find((e) => e.type === "coned_upload_document");
    expect(cmd).toBeTruthy();
    expect(cmd.payload.caseNumber).toBe("MC-424242");
    // docKey is the client-generated docs key for this job+meter
    expect(cmd.payload.docKey).toMatch(/^coned-job-9-PLP-/);
  });
});
