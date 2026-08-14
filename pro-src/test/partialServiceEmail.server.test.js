// Server-side safety net: the ACTUAL Resend payload docEmail.mjs composes for
// a partial-service invoice must carry the Con Ed refund block — even when
// the caller's message lost it — and a normal invoice must not.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const written = new Map();
vi.mock("../../netlify/functions/lib/storage/index.mjs", () => ({
  getStore: () => ({
    set: async (k, v) => void written.set(k, v),
    get: async (k) => written.get(k) || null,
  }),
  bindStorageEnv: () => {},
}));

const { sendDocEmail } = await import("../../netlify/functions/lib/docEmail.mjs");
const { CONED_REFUND_INSTRUCTIONS, CONED_REFUND_MARKER } = await import(
  "../../netlify/functions/lib/partialServiceEmail.mjs"
);

const PDF_B64 = Buffer.from("%PDF-1.4\n%%EOF\n").toString("base64");

const PARTIAL_JOB = {
  id: "qbo-251900",
  customer: "419 Kingston Realty",
  email: "customer@example.com",
  invoiceNo: "251900",
  amount: "$622.50",
  address: "419 Kingston Ave",
  invoiceLines: [
    {
      itemName: "Partial Service",
      description:
        "Emergency service for power outage on 8/10/2026 and performing inspection on the equipment to verify power outage from the utility company (Con Edison).\nInstalling a temporary bridge for the service to restore partial service to the building.\nGenerating an emergency ticket with Con Ed — Ticket # CE-4821.",
      qty: 1.5,
      unitPrice: 265,
      partialService: true,
      partialServiceRole: "initial",
    },
    {
      itemName: "Partial Service",
      description:
        "Follow-up visit: verifying power restoration to the building.\nRemoval of temporary bridge wiring.\nRestoring service to safe conditions.",
      qty: 1,
      unitPrice: 225,
      partialService: true,
      partialServiceRole: "followup",
    },
  ],
};

const NORMAL_JOB = {
  id: "qbo-231595",
  customer: "Shneor Seewald",
  email: "customer@example.com",
  invoiceNo: "231595",
  amount: "$16,000",
  address: "1445 President st",
  items: [{ description: "Electrical service — labor and materials", qty: 1, rate: 16000 }],
};

let sent;

beforeEach(() => {
  written.clear();
  sent = null;
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.EMAIL_TEST_MODE = "false";
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

const send = (job, extra = {}) =>
  sendDocEmail({
    job,
    kind: "invoice",
    to: "customer@example.com",
    includePaymentLink: true,
    pdfB64: PDF_B64,
    filename: `Invoice-${job.invoiceNo}.pdf`,
    ...extra,
  });

describe("partial-service invoice email (server compose)", () => {
  it("HTML carries the refund block even when the message omitted it", async () => {
    const res = await send(PARTIAL_JOB, { message: "" });
    expect(res.ok).toBe(true);
    expect(sent.html).toContain(CONED_REFUND_MARKER);
    expect(sent.html).toContain("30 Flatbush Ave 11217");
    expect(sent.html).toContain("718-643-6943");
  });

  it("refund block sits ABOVE the ways-to-pay section", async () => {
    await send(PARTIAL_JOB, { message: "" });
    expect(sent.html.indexOf(CONED_REFUND_MARKER)).toBeLessThan(
      sent.html.indexOf("Ways to pay")
    );
  });

  it("does not duplicate the block when the compose message already has it", async () => {
    const composed =
      "Hi 419 Kingston Realty,\n\nYour invoice #251900 is ready to view and pay online.\n\n" +
      CONED_REFUND_INSTRUCTIONS +
      "\n\nThank you,\nL&E";
    await send(PARTIAL_JOB, { message: composed });
    expect(sent.html.match(new RegExp(CONED_REFUND_MARKER, "g"))).toHaveLength(1);
  });

  it("plain-text part carries the refund block too", async () => {
    await send(PARTIAL_JOB, { message: "" });
    expect(sent.text).toContain(CONED_REFUND_MARKER);
    expect(sent.text).toContain("718-643-6943");
  });

  it("normal invoice email has NO refund block anywhere", async () => {
    await send(NORMAL_JOB, { message: "" });
    expect(sent.html).not.toContain(CONED_REFUND_MARKER);
    expect(sent.text).not.toContain(CONED_REFUND_MARKER);
  });

  it("keeps the standard shell: one View/Pay CTA, logo header, PDF attached", async () => {
    await send(PARTIAL_JOB, { message: "" });
    expect(sent.html.match(/View\/Pay Invoice/g) || []).toHaveLength(1);
    expect(sent.html).toContain('src="cid:companylogo"');
    expect(sent.attachments.some((a) => a.filename === "Invoice-251900.pdf")).toBe(true);
  });
});
