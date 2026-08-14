// Guard: the customer invoice-email must always be the approved branded layout
// (QBO-style letterhead + amount banner + Ways-to-pay), and the layout must be
// IDENTICAL for legacy numeric invoice numbers (251812) and LE- prefixed ones
// (LE-2716). Regression this protects against: Invoice #LE-2716 (2026-08-13)
// reached the customer as the minimal Gmail-fallback template because the prod
// bundle shipped without the baked email app key (v446 deploy) — every app send
// 401'd and fell back to gmail_send_doc.py's own layout.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { sendDocEmail } from "../../netlify/functions/lib/docEmail.mjs";

// Tiny-but-valid PDF header so decodePdfB64 accepts it.
const PDF_B64 = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n").toString("base64");

function makeJob(invoiceNo) {
  return {
    id: "job-test-" + invoiceNo,
    customer: "Test Customer LLC",
    businessName: "Test Customer LLC",
    email: "customer@example.com",
    invoiceNo,
    amount: "450",
    openBalance: 450,
    dueDate: "08/13/2026",
    address: "123 Main St, Brooklyn, NY 11201",
    billingAddress: "123 Main St, Brooklyn, NY 11201",
    serviceAddress: "123 Main St, Brooklyn, NY 11201",
    title: "Electrical services",
    invoiceLines: [
      { description: "Panel cover replacement", qty: 1, rate: 450, amount: 450 },
    ],
  };
}

/** Strip per-send variability (minted pay codes, doc-store keys) before diffing. */
function normalize(html, invoiceNo) {
  return String(html)
    .replaceAll(invoiceNo, "__NO__")
    .replace(/\/pay\/[A-Za-z0-9_-]+/g, "/pay/__CODE__")
    .replace(/key=[A-Za-z0-9%._-]+/g, "key=__KEY__");
}

async function renderEmail(invoiceNo) {
  const r = await sendDocEmail({
    job: makeJob(invoiceNo),
    kind: "invoice",
    to: "customer@example.com",
    includePaymentLink: true,
    pdfB64: PDF_B64,
  });
  // No RESEND_API_KEY → dry-run; html is exactly what a real send would carry.
  expect(r.dryRun).toBe(true);
  expect(typeof r.html).toBe("string");
  expect(r.html.length).toBeGreaterThan(2000);
  return r.html;
}

describe("invoice email layout guard", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_TEST_MODE = "true";
    process.env.PAYMENT_CONFIRM_TEST_EMAIL = "levi@test.com";
  });

  afterEach(() => {
    process.env = env;
  });

  it.each([["251812"], ["LE-2716"]])(
    "invoice #%s renders the approved branded layout",
    async (no) => {
      const html = await renderEmail(no);
      // Approved QBO-style layout markers (email-template.js + branded shell).
      expect(html).toContain(`${no} DETAILS`);
      expect(html).toContain("Ways to pay");
      expect(html).toContain("Thank you for your business!");
      expect(html).toContain("seems fraudulent");
      // The Gmail-fallback minimal template must never be what we build here.
      expect(html).not.toContain("PDF is attached. Powered by LE Electrical");
    }
  );

  it("LE- prefixed and numeric invoice numbers produce the SAME layout", async () => {
    const a = await renderEmail("251812");
    const b = await renderEmail("LE-2716");
    expect(normalize(b, "LE-2716")).toBe(normalize(a, "251812"));
  });
});
