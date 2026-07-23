// "Powered by LE" on customer-facing DOCUMENTS (invoice / estimate PDFs),
// mirroring the email footer. Tenant brand on top, constant mark underneath.
import { describe, expect, it } from "vitest";
import {
  POWERED_BY_LE,
  POWERED_BY_LE_PDF_COLOR,
  POWERED_BY_LE_PDF_SIZE,
} from "../src/lib/brand.js";
import { buildEstimatePdfFromJob, buildInvoicePdfFromJob } from "../src/lib/invoicePdf.js";
import { POWERED_BY_LE_TEXT } from "../../netlify/functions/lib/emailBranding.mjs";

const JOB = {
  id: "qbo-231595",
  customer: "Shneor Seewald",
  invoiceNo: "231595",
  estimateNo: "E-4471",
  amount: "$16,000",
  address: "1445 President st, Brooklyn, NY 11213",
  items: [{ description: "Electrical service — labor and materials", qty: 1, rate: 16000 }],
};

async function pdfText(blob) {
  // The content stream is written uncompressed, so the drawn strings are
  // readable straight out of the bytes.
  return Buffer.from(await blob.arrayBuffer()).toString("latin1");
}

/** Relative luminance / WCAG contrast for an RGB triple in 0-1 space. */
function contrastVsWhite([r, g, b]) {
  const f = (v) => (v <= 0.03928 / 1 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  return (1.0 + 0.05) / (L + 0.05);
}

describe("wording lives in one changeable constant", () => {
  it('is "Powered by LE" for now', () => {
    expect(POWERED_BY_LE).toBe("Powered by LE");
  });

  it("document and email constants stay in sync", () => {
    // If someone changes one (e.g. to "LE Products") this fails until both move.
    expect(POWERED_BY_LE).toBe(POWERED_BY_LE_TEXT);
  });
});

describe("contrast — must not blend into the page", () => {
  it("is a muted dark, comfortably above WCAG AA on white", () => {
    const ratio = contrastVsWhite(POWERED_BY_LE_PDF_COLOR);
    expect(ratio).toBeGreaterThan(4.5); // AA for normal text
    expect(ratio).toBeGreaterThan(7); // and AAA
  });

  it("is meaningfully darker than the existing #8d9096 footer gray", () => {
    const footerGray = [141 / 255, 144 / 255, 150 / 255];
    expect(contrastVsWhite(POWERED_BY_LE_PDF_COLOR)).toBeGreaterThan(
      contrastVsWhite(footerGray) * 1.5
    );
  });

  it("stays small enough to be subordinate to the tenant brand", () => {
    expect(POWERED_BY_LE_PDF_SIZE).toBeLessThan(10);
    expect(POWERED_BY_LE_PDF_SIZE).toBeGreaterThanOrEqual(8);
  });
});

describe("invoice PDF", () => {
  it("carries the mark", async () => {
    expect(await pdfText(await buildInvoicePdfFromJob(JOB))).toContain(POWERED_BY_LE);
  });

  it("still renders the tenant company header and the document body", async () => {
    const txt = await pdfText(await buildInvoicePdfFromJob(JOB));
    expect(txt).toContain("BLZ Electric Inc.");
    expect(txt).toContain("231595");
    expect(txt).toContain("Shneor Seewald");
  });

  it("draws the mark in the muted-dark colour, not the footer gray", async () => {
    const txt = await pdfText(await buildInvoicePdfFromJob(JOB));
    const [r, g, b] = POWERED_BY_LE_PDF_COLOR;
    const op = `${Math.round(r * 100) / 100}`.slice(0, 4);
    // the fill-colour operator for the mark must appear in the stream
    expect(txt).toMatch(new RegExp(`${op}\\d* .* rg`));
  });
});

describe("estimate PDF", () => {
  it("carries the mark", async () => {
    expect(await pdfText(await buildEstimatePdfFromJob(JOB))).toContain(POWERED_BY_LE);
  });

  it("still renders the estimate body and acceptance block", async () => {
    const txt = await pdfText(await buildEstimatePdfFromJob(JOB));
    expect(txt).toContain("ESTIMATE");
    expect(txt).toContain("Accepted By");
  });
});

describe("mark placement clears the printable margin", () => {
  it("is drawn above the bottom edge of the page", async () => {
    const txt = await pdfText(await buildInvoicePdfFromJob(JOB));
    // Find the Tm matrix of the line that draws the mark; PDF y is bottom-up.
    const m = txt.match(/1 0 0 1 [\d.]+ ([\d.]+) Tm \(Powered by LE\)/);
    expect(m).toBeTruthy();
    const yFromBottom = parseFloat(m[1]);
    expect(yFromBottom).toBeGreaterThan(12); // clear of typical printer margin
  });
});
