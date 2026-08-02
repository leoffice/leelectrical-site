import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  CONED_FORM_A,
  completeConedApplicationDestinations,
  buildConedCompletedFileName,
  buildCustomerConedEmailText,
} from "../src/lib/agencyForms/index.js";

const TEST2_ANSWERS = {
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
  email: "customer.test2@example.com",
  controlsAccess: true,
  servicesRequested: ["Electric"],
  submittedByName: "Test 2",
  affiliation: "Owner",
  signatureName: "Test 2",
  signatureDate: "2026-08-02",
};

const TEST2_JOB = {
  id: "test2-kingston",
  customer: "Test 2",
  serviceAddress: "555 Kingston Avenue",
  email: "customer.test2@example.com",
  paperwork: { coned: { enabled: true } },
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

describe("completeConedApplicationDestinations (3 destinations)", () => {
  it("emails customer + office, records job tab file, queues Drive with §3 name", async () => {
    const sends = [];
    const patches = [];
    const enqueued = [];
    const api = {
      sendDocEmailNow: vi.fn(async (_job, kind, opts) => {
        sends.push({ kind, ...opts });
        return { ok: true, id: "msg-" + sends.length };
      }),
    };
    // Stub docs put via global fetch
    const fetchMock = vi.fn(async (url, init) => {
      if (String(url).includes("/docs") && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ ok: true, key: "coned-test", bytes: 1000 }),
        };
      }
      return { ok: false, json: async () => ({ ok: false }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await completeConedApplicationDestinations({
      agency: CONED_FORM_A,
      answers: TEST2_ANSWERS,
      job: TEST2_JOB,
      api,
      onSave: (p) => patches.push(p),
      enqueue: async (type, jobId, payload, lane, idk) => {
        enqueued.push({ type, jobId, payload, lane, idk });
      },
    });

    const expectedName = "555 Kingston Avenue - PLP - Test 2.pdf";
    expect(result.filename).toBe(expectedName);
    expect(buildConedCompletedFileName({ answers: TEST2_ANSWERS, job: TEST2_JOB })).toBe(
      expectedName
    );

    // Destination 1: customer + office emails
    expect(api.sendDocEmailNow).toHaveBeenCalled();
    expect(sends.length).toBe(2);
    const customerSend = sends.find((s) => s.email === "customer.test2@example.com");
    const officeSend = sends.find((s) => /office@leelectrical\.us/i.test(s.email));
    expect(customerSend).toBeTruthy();
    expect(customerSend.filename).toBe(expectedName);
    expect(customerSend.subject).toMatch(/Your Con Edison application/i);
    expect(customerSend.subject).toMatch(/555 Kingston/i);
    expect(officeSend).toBeTruthy();
    expect(officeSend.filename).toBe(expectedName);

    // Destination 2: job tab record
    expect(result.destinations.jobTab.ok).toBe(true);
    expect(result.destinations.jobTab.file.name).toBe(expectedName);
    expect(patches.length).toBeGreaterThan(0);
    const coned = patches[0].paperwork.coned;
    expect(coned.completedFiles.some((f) => f.name === expectedName)).toBe(true);
    expect(coned.application.status).toBe("submitted");
    expect(coned.steps["Application submitted"]).toBe(true);

    // Destination 3: Drive command queued with same name + pdf
    expect(enqueued.some((e) => e.type === "drive_save_coned")).toBe(true);
    const driveCmd = enqueued.find((e) => e.type === "drive_save_coned");
    expect(driveCmd.payload.filename).toBe(expectedName);
    expect(driveCmd.payload.pdfB64).toBeTruthy();
    expect(driveCmd.payload.folderName).toMatch(/Con Edison Applications/i);

    // Filled PDF is real
    expect(result.pdfB64).toBeTruthy();
    const head = Buffer.from(result.pdfB64, "base64").slice(0, 4).toString("latin1");
    expect(head).toBe("%PDF");

    vi.unstubAllGlobals();
  });

  it("builds a plain customer email body", () => {
    const text = buildCustomerConedEmailText({
      answers: TEST2_ANSWERS,
      job: TEST2_JOB,
      filename: "555 Kingston Avenue - PLP - Test 2.pdf",
    });
    expect(text).toMatch(/Hi Test/);
    expect(text).toMatch(/555 Kingston/);
    expect(text).toMatch(/Form A PDF/i);
  });
});
