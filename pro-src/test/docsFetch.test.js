// docs-fetch is what the public pay page calls when a customer taps "View
// invoice". It used to have a third tier that queued a `fetch_pdf` command for
// the office-Mac host agent, so a sleeping office machine meant the customer
// could not see their invoice at all. These tests pin the replacement: render
// server-side, else serve the copy archived to R2 at send time, and never
// enqueue anything for a machine in the office.
import { beforeEach, describe, expect, it, vi } from "vitest";

const stores = { docs: new Map(), jobsdata: new Map(), jobstate: new Map(), commands: new Map() };
const touched = new Set();

vi.mock("../../netlify/functions/lib/storage/index.mjs", () => ({
  getStore: (name) => {
    touched.add(name);
    const m = stores[name] || (stores[name] = new Map());
    return {
      get: async (k, { type } = {}) => {
        const v = m.get(k);
        if (v == null) return null;
        return type === "json" ? JSON.parse(v) : v;
      },
      getWithMetadata: async (k) => (m.has(k) ? { data: m.get(k), metadata: {} } : null),
      set: async (k, v) => void m.set(k, v),
      setJSON: async (k, v) => void m.set(k, JSON.stringify(v)),
      delete: async (k) => void m.delete(k),
      list: async () => ({ blobs: [] }),
    };
  },
  bindStorageEnv: () => {},
}));

const handler = (await import("../../netlify/functions/docs-fetch.mjs")).default;

const JOB = {
  id: "J-1",
  customer: "Shneor Seewald",
  invoiceNo: "231595",
  address: "1445 President st",
  invoiceLines: [
    { itemName: "Electrical service", description: "Panel upgrade", qty: 1, unitPrice: 16000 },
  ],
};

function post(body) {
  return handler(
    new Request("https://leelectrical.us/.netlify/functions/docs-fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  for (const m of Object.values(stores)) m.clear();
  touched.clear();
});

describe("docs-fetch", () => {
  it("renders the invoice server-side and caches it to the docs store", async () => {
    stores.jobsdata.set("jobsdata-v1", JSON.stringify({ jobs: [JOB] }));
    const res = await post({ invoiceNo: "231595", jobId: "J-1" });
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, ready: true, generated: true });
    const pdf = stores.docs.get("inv-231595");
    expect(pdf).toBeTruthy();
    expect(Buffer.from(pdf).subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  // A server-rendered PDF must look like the browser-rendered one. The
  // renderer takes branding by injection, so it is easy to forget here and
  // silently ship pay-page invoices with no product mark in the footer.
  it("brands the server-rendered PDF with the product footer mark", async () => {
    stores.jobsdata.set("jobsdata-v1", JSON.stringify({ jobs: [JOB] }));
    await post({ invoiceNo: "231595", jobId: "J-1" });
    const { PRODUCT_BRAND } = await import("../../shared/productBrand.mjs");
    // PDF text is written as literal latin1 strings in the content stream.
    expect(Buffer.from(stores.docs.get("inv-231595")).toString("latin1")).toContain(
      PRODUCT_BRAND.poweredBy
    );
  });

  it("serves the copy archived at send time when the job is gone", async () => {
    // No job data at all — only the PDF that was stored when the invoice was
    // emailed. This is the case that used to fall through to the office Mac.
    stores.docs.set("inv-231595", Buffer.from("%PDF-1.4\n%%EOF\n"));
    const res = await post({ invoiceNo: "231595" });

    expect(await res.json()).toMatchObject({ ok: true, ready: true, stored: true });
  });

  it("never queues work for the office computer, even with nothing to serve", async () => {
    const res = await post({ invoiceNo: "231595" });
    const body = await res.json();

    expect(body).toMatchObject({ ok: false, ready: false, reason: "unavailable" });
    // The old code path wrote a fetch_pdf command here for the host agent.
    expect(touched.has("commands")).toBe(false);
    expect(stores.commands.size).toBe(0);
    // And it must not claim success, which is what let the UI show a
    // "make sure our office computer is online" message.
    expect(JSON.stringify(body)).not.toMatch(/queued|office/i);
  });

  it("rejects a bad invoice number", async () => {
    expect((await post({ invoiceNo: "not-a-number" })).status).toBe(400);
  });
});
