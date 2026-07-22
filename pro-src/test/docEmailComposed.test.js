// End-to-end check of the ACTUAL email docEmail.mjs composes and hands to
// Resend — not the template in isolation. This is what lands in the inbox.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory paylinks store so mintShortPayLink behaves as it does in prod.
const written = new Map();
vi.mock("../../netlify/functions/lib/storage/index.mjs", () => ({
  getStore: () => ({
    set: async (k, v) => void written.set(k, v),
    get: async (k) => written.get(k) || null,
  }),
  bindStorageEnv: () => {},
}));

const { sendDocEmail } = await import("../../netlify/functions/lib/docEmail.mjs");

// A minimal but valid PDF so the pdfB64 gate passes.
const PDF_B64 = Buffer.from("%PDF-1.4\n%%EOF\n").toString("base64");

const JOB = {
  id: "qbo-231595",
  customer: "Shneor Seewald",
  email: "customer@example.com",
  invoiceNo: "231595",
  amount: "$16,000",
  address: "1445 President st",
  phone: "718-555-0100",
  items: [{ description: "Electrical service — labor and materials", qty: 1, rate: 16000 }],
  payments: [{ amount: "$1,000", method: "Check", date: "2026-07-01", ref: "1234" }],
};

let sent;

beforeEach(() => {
  written.clear();
  sent = null;
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.EMAIL_TEST_MODE = "false"; // exercise the real recipient path
  vi.stubGlobal("fetch", async (url, opts) => {
    sent = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ id: "test-resend-id" }) };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_TEST_MODE;
});

async function compose() {
  const res = await sendDocEmail({
    job: JOB,
    kind: "invoice",
    to: "customer@example.com",
    includePaymentLink: true,
    pdfB64: PDF_B64,
    filename: "Invoice-231595.pdf",
  });
  return { res, payload: sent };
}

describe("composed invoice email", () => {
  it("sends successfully and captures a Resend payload", async () => {
    const { res, payload } = await compose();
    expect(res.ok).toBe(true);
    expect(payload).toBeTruthy();
    expect(payload.html).toBeTruthy();
  });

  it("HTML body contains NO raw Cardknox URL or query params", async () => {
    const { payload } = await compose();
    expect(payload.html).not.toContain("secure.cardknox.com");
    expect(payload.html).not.toContain("xBillLastName");
    expect(payload.html).not.toContain("sola-payment");
    expect(payload.html).not.toContain("%2F");
  });

  it("plain-text part contains NO raw Cardknox URL either", async () => {
    const { payload } = await compose();
    expect(payload.text).not.toContain("cardknox");
    expect(payload.text).not.toContain("xBillLastName");
  });

  it("renders exactly one View Invoice CTA, pointing at a short /pay/ link", async () => {
    const { payload } = await compose();
    expect((payload.html.match(/View Invoice/g) || [])).toHaveLength(1);
    expect(payload.html).toMatch(/href="https:\/\/leelectrical\.us\/pay\/[0-9]{5,8}-[a-z0-9]{4}"/i);
  });

  it("registered the landing payload so the page can review + pay", async () => {
    await compose();
    const keys = [...written.keys()];
    expect(keys.some((k) => k.startsWith("pl-"))).toBe(true);
    const plKey = keys.find((k) => k.startsWith("pl-"));
    const rec = JSON.parse(written.get(plKey));
    expect(rec.payload.i).toBe("231595");
    expect(rec.payload.pay).toContain("cardknox"); // pay lives on the page
    expect(rec.payload.ps).toHaveLength(1); // payment history
  });

  it("stores the PDF so pay-page View invoice can open it", async () => {
    const { res } = await compose();
    expect(res.docKey).toBe("inv-231595");
    expect(written.has("inv-231595")).toBe(true);
    const buf = written.get("inv-231595");
    expect(Buffer.isBuffer(buf) || buf instanceof Uint8Array).toBe(true);
    expect(Buffer.from(buf).slice(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("has no 'securely online' duplicate line", async () => {
    const { payload } = await compose();
    expect(payload.html.toLowerCase()).not.toContain("securely online");
    expect(payload.html.toLowerCase()).not.toContain("credit card payment link");
  });

  it("Bill-to is responsive (no 250px label, no mid-word break)", async () => {
    const { payload } = await compose();
    expect(payload.html).not.toContain("width:250px");
    expect(payload.html).not.toContain("word-break:break-word");
    expect(payload.html).toContain("@media only screen and (max-width:480px)");
    expect(payload.html).toContain("Shneor Seewald");
  });

  it("keeps the LE logo header and Powered by LE footer", async () => {
    const { payload } = await compose();
    expect(payload.html).toContain('src="cid:companylogo"');
    expect(payload.html).toContain("Powered by");
    expect(payload.attachments.some((a) => a.content_id === "companylogo")).toBe(true);
  });

  it("still attaches the invoice PDF", async () => {
    const { payload } = await compose();
    expect(payload.attachments.some((a) => a.filename === "Invoice-231595.pdf")).toBe(true);
  });
});
