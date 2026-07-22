import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requestInvoicePdfFetch,
  retrieveInvoicePdf,
  invoicePdfAvailable,
} from "../src/lib/payInvoicePdf.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("payInvoicePdf", () => {
  it("requestInvoicePdfFetch calls docs-fetch for local generation", async () => {
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, opts = {}) => {
        calls.push({ url, opts });
        return { ok: true, json: async () => ({ ok: true, generated: true, local: true }) };
      })
    );
    const result = await requestInvoicePdfFetch("251839", "J-9");
    expect(result.ok).toBe(true);
    expect(result.generated).toBe(true);
    expect(calls[0].url).toContain("docs-fetch");
    expect(JSON.parse(calls[0].opts.body)).toEqual({ invoiceNo: "251839", jobId: "J-9" });
  });

  it("retrieveInvoicePdf queues fetch when PDF missing then succeeds on poll", async () => {
    let docsHits = 0;
    const phases = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, opts = {}) => {
        if (String(url).includes("docs-fetch")) {
          return { ok: true, json: async () => ({ ok: true, queued: true }) };
        }
        docsHits += 1;
        if (docsHits >= 2) {
          return {
            ok: true,
            headers: { get: (h) => (h === "content-type" ? "application/pdf" : "") },
          };
        }
        return {
          ok: false,
          headers: { get: (h) => (h === "content-type" ? "application/json" : "") },
        };
      })
    );
    const result = await retrieveInvoicePdf({
      url: "https://leelectrical.us/.netlify/functions/docs?key=inv-251839",
      invoiceNo: "251839",
      jobId: "J-1",
      onPhase: (p) => phases.push(p),
    });
    expect(result.ok).toBe(true);
    expect(phases).toContain("requesting");
    // Poll may skip if store becomes ready right after docs-fetch.
    expect(phases[phases.length - 1]).toBe("ready");
  });

  it("retrieveInvoicePdf falls back to client payload PDF when store never lands", async () => {
    const phases = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).includes("docs-fetch")) {
          return { ok: true, json: async () => ({ ok: true, queued: true }) };
        }
        return {
          ok: false,
          headers: { get: () => "application/json" },
        };
      })
    );
    // Minimal payload for client build
    const payload = {
      i: "251843",
      c: "Mendel Drizin",
      w: "Troubleshoot power outage",
      t: "$450",
      d: "$450",
      a: 450,
      ba: "123 Main St",
    };
    const result = await retrieveInvoicePdf({
      url: "https://leelectrical.us/.netlify/functions/docs?key=inv-251843",
      invoiceNo: "251843",
      payload,
      onPhase: (p) => phases.push(p),
    });
    expect(result.ok).toBe(true);
    expect(result.blobUrl || result.blob).toBeTruthy();
    expect(phases[phases.length - 1]).toBe("ready");
  }, 15_000);

  it("invoicePdfAvailable returns true for pdf content-type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => "application/pdf" },
      }))
    );
    expect(await invoicePdfAvailable("https://x/docs?key=inv-1")).toBe(true);
  });
});