// S26 — optional per-tenant Google Drive copy of completed Con Ed Form A.
//
// Contract under test:
//   - The gdrive-save function reports unconfigured cleanly (skipped, not error).
//   - The client helper treats skipped / network failure as a silent no-op.
//   - completeConedApplicationDestinations prefers the Drive API when it lands,
//     falls back to the host command bus when it doesn't, and NEVER lets Drive
//     gate success — the Con Edison Application tab is the durable record.
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { gdriveConfig } from "../../netlify/functions/gdrive-save.mjs";
import { saveConedToDriveApi } from "../src/lib/agencyForms/gdriveSave.js";
import {
  CONED_FORM_A,
  completeConedApplicationDestinations,
} from "../src/lib/agencyForms/index.js";

const ANSWERS = {
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

const JOB = {
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

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GDRIVE_SA_JSON;
  delete process.env.GDRIVE_OAUTH_TOKEN;
});

describe("gdriveConfig (server credential resolution)", () => {
  it("unconfigured when no env", () => {
    expect(gdriveConfig({}).mode).toBe(null);
  });
  it("valid SA JSON -> sa mode with share address", () => {
    const cfg = gdriveConfig({
      GDRIVE_SA_JSON: JSON.stringify({
        client_email: "robot@proj.iam.gserviceaccount.com",
        private_key: "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n",
      }),
    });
    expect(cfg.mode).toBe("sa");
    expect(cfg.saEmail).toBe("robot@proj.iam.gserviceaccount.com");
  });
  it("malformed SA JSON -> unconfigured with an explanation (never throws)", () => {
    const cfg = gdriveConfig({ GDRIVE_SA_JSON: "{not json" });
    expect(cfg.mode).toBe(null);
    expect(cfg.error).toMatch(/GDRIVE_SA_JSON/);
  });
  it("raw access token -> oauth mode", () => {
    expect(gdriveConfig({ GDRIVE_OAUTH_TOKEN: "ya29.abc" }).mode).toBe("oauth");
  });
  it("refresh-token JSON -> oauth mode", () => {
    const cfg = gdriveConfig({
      GDRIVE_OAUTH_TOKEN: JSON.stringify({
        client_id: "id",
        client_secret: "sec",
        refresh_token: "rt",
      }),
    });
    expect(cfg.mode).toBe("oauth");
    expect(cfg.oauth.refresh_token).toBe("rt");
  });
});

describe("saveConedToDriveApi (client helper)", () => {
  it("skips silently on server 'not configured'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: false, skipped: true, reason: "gdrive_not_configured" }),
      }))
    );
    const r = await saveConedToDriveApi({ pdfB64: "JVBERg==", filename: "a.pdf" });
    expect(r.ok).toBe(false);
    expect(r.skipped).toBe(true);
  });
  it("skips silently on network failure (preview without function)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("boom"))));
    const r = await saveConedToDriveApi({ pdfB64: "JVBERg==", filename: "a.pdf" });
    expect(r.ok).toBe(false);
    expect(r.skipped).toBe(true);
  });
  it("returns file id + link when the upload lands", async () => {
    const fetchMock = vi.fn(async (url, init) => ({
      ok: true,
      json: async () => ({
        ok: true,
        id: "file-1",
        webViewLink: "https://drive.google.com/file/d/file-1",
        folderId: "fold-1",
        mode: "sa",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await saveConedToDriveApi({
      pdfB64: "JVBERg==",
      filename: "a.pdf",
      folderId: "fold-1",
    });
    expect(r.ok).toBe(true);
    expect(r.id).toBe("file-1");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.op).toBe("save");
    expect(body.folderId).toBe("fold-1");
  });
});

describe("completeConedApplicationDestinations Drive routing (S26)", () => {
  function apiStub(sends) {
    return {
      sendDocEmailNow: vi.fn(async (_job, kind, opts) => {
        sends.push({ kind, ...opts });
        return { ok: true, id: "msg-" + sends.length };
      }),
    };
  }

  it("Drive API lands -> no host-bus drive command, success true", async () => {
    const sends = [];
    const enqueued = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const u = String(url);
        if (u.includes("/docs") && init?.method === "POST") {
          return { ok: true, json: async () => ({ ok: true, key: "coned-test", bytes: 1000 }) };
        }
        if (u.includes("/gdrive-save")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              id: "drive-file-9",
              webViewLink: "https://drive.google.com/file/d/drive-file-9",
              folderId: "tenant-folder",
            }),
          };
        }
        return { ok: false, json: async () => ({ ok: false }) };
      })
    );

    const result = await completeConedApplicationDestinations({
      agency: CONED_FORM_A,
      answers: ANSWERS,
      job: JOB,
      api: apiStub(sends),
      onSave: () => {},
      enqueue: async (type, jobId, payload) => {
        enqueued.push({ type, jobId, payload });
      },
      emailCustomerCopy: false,
    });

    expect(result.destinations.drive.ok).toBe(true);
    expect(result.destinations.drive.note).toBe("gdrive_api");
    expect(result.destinations.drive.driveFileId).toBe("drive-file-9");
    expect(result.destinations.drive.queued).toBe(false);
    // API landed → the host bus is NOT asked to save Drive again
    expect(enqueued.some((e) => e.type === "drive_save_coned")).toBe(false);
    expect(result.success).toBe(true);
  });

  it("Drive API unconfigured -> falls back to host bus queue; success still true", async () => {
    const sends = [];
    const enqueued = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const u = String(url);
        if (u.includes("/docs") && init?.method === "POST") {
          return { ok: true, json: async () => ({ ok: true, key: "coned-test", bytes: 1000 }) };
        }
        if (u.includes("/gdrive-save")) {
          return {
            ok: true,
            json: async () => ({ ok: false, skipped: true, reason: "gdrive_not_configured" }),
          };
        }
        return { ok: false, json: async () => ({ ok: false }) };
      })
    );

    const result = await completeConedApplicationDestinations({
      agency: CONED_FORM_A,
      answers: ANSWERS,
      job: JOB,
      api: apiStub(sends),
      onSave: () => {},
      enqueue: async (type, jobId, payload) => {
        enqueued.push({ type, jobId, payload });
      },
      emailCustomerCopy: false,
    });

    expect(enqueued.some((e) => e.type === "drive_save_coned")).toBe(true);
    expect(result.destinations.drive.queued).toBe(true);
    expect(result.success).toBe(true);
  });

  it("Drive fully unavailable (no API, no bus) -> parked, success STILL true (tab gates)", async () => {
    const sends = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const u = String(url);
        if (u.includes("/docs") && init?.method === "POST") {
          return { ok: true, json: async () => ({ ok: true, key: "coned-test", bytes: 1000 }) };
        }
        return { ok: false, json: async () => ({ ok: false }) };
      })
    );

    const result = await completeConedApplicationDestinations({
      agency: CONED_FORM_A,
      answers: ANSWERS,
      job: JOB,
      api: apiStub(sends),
      onSave: () => {},
      enqueue: null,
      emailCustomerCopy: false,
    });

    expect(result.destinations.drive.ok).toBe(false);
    expect(result.destinations.drive.parked).toBe(true);
    expect(result.destinations.drive.critical).toBe(false);
    expect(result.destinations.jobTab.ok).toBe(true);
    expect(result.success).toBe(true);
    expect(result.driveCriticalFailed).toBe(false);
  });
});
