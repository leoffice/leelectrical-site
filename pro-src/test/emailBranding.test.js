// Email branding — the white-label seam.
//   HEADER = tenant brand (swappable).
//   FOOTER = "Powered by LE" (constant on every email, every tenant).
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRAND_NAME,
  LE_LOGO_CID,
  POWERED_BY_LE_TEXT,
  leLogoAttachment,
  poweredByLeHtml,
  resolveEmailBrand,
} from "../../netlify/functions/lib/emailBranding.mjs";
import emailTemplate from "../../netlify/functions/lib/le-invoice-suite/email-template.js";
import { buildPaymentConfirmEmail } from "../../netlify/functions/lib/paymentConfirmEmail.mjs";
import { buildStatementHtml } from "../../netlify/functions/lib/statementEmailServer.mjs";
import { buildCustomerEmailHtml } from "../../netlify/functions/lib/customerEmail.mjs";

const { buildEmailHTML } = emailTemplate;

const DOC = {
  company: {
    name: "BLZ Electric Inc.",
    addressLines: ["383 Kingston Ave", "Brooklyn, NY 11213"],
    phone: "(718) 594-1850",
    email: "Office@LeElectrical.us",
  },
  docType: "INVOICE",
  docNumber: "231595",
  docDate: "07/19/2026",
  dueDate: "08/19/2026",
  billTo: { name: "Shneor Seewald", lines: ["1445 President st"] },
  lines: [{ description: "Electrical service", qty: 1, rate: 16000, amount: 16000 }],
  amountDue: "16,000.00",
};

describe("resolveEmailBrand — the tenant seam", () => {
  it("falls back to the LE CID logo and default name when no tenant is set", () => {
    const brand = resolveEmailBrand();
    expect(brand.logoSrc).toBe(`cid:${LE_LOGO_CID}`);
    expect(brand.name).toBe(DEFAULT_BRAND_NAME);
    expect(brand.usesDefaultLogo).toBe(true);
  });

  it("uses the tenant's logo and name in the header when supplied", () => {
    const brand = resolveEmailBrand({
      name: "Some Other Electric LLC",
      logoUrl: "https://tenant.example.com/logo.png",
    });
    expect(brand.name).toBe("Some Other Electric LLC");
    expect(brand.logoSrc).toBe("https://tenant.example.com/logo.png");
    expect(brand.usesDefaultLogo).toBe(false);
  });

  it("ignores blank tenant values rather than rendering an empty logo", () => {
    const brand = resolveEmailBrand({ name: "   ", logoUrl: "  " });
    expect(brand.name).toBe(DEFAULT_BRAND_NAME);
    expect(brand.logoSrc).toBe(`cid:${LE_LOGO_CID}`);
  });
});

describe("poweredByLeHtml — the constant", () => {
  it("renders the Powered by LE line", () => {
    const html = poweredByLeHtml();
    expect(html).toContain("Powered by");
    expect(html).toContain(">LE<");
  });

  it("is plain text, not an image — must survive blocked images", () => {
    expect(poweredByLeHtml()).not.toContain("<img");
  });

  it("ships the LE mark as a CID attachment for headers", () => {
    const att = leLogoAttachment();
    expect(att.content_id).toBe(LE_LOGO_CID);
    expect(att.filename).toBe("logo.png");
    expect(String(att.content).length).toBeGreaterThan(100);
  });
});

describe("invoice/estimate template", () => {
  it("puts the Powered by LE footer in the rendered HTML", () => {
    const html = buildEmailHTML({
      ...DOC,
      logoSrc: `cid:${LE_LOGO_CID}`,
      poweredByHtml: poweredByLeHtml(),
    });
    expect(html).toContain("Powered by");
    expect(html).toContain(">LE<");
  });

  it("renders the tenant logo in the header when one is set", () => {
    const html = buildEmailHTML({
      ...DOC,
      logoSrc: "https://tenant.example.com/logo.png",
      poweredByHtml: poweredByLeHtml(),
    });
    expect(html).toContain('src="https://tenant.example.com/logo.png"');
    // Tenant swaps the header, but the footer constant stays.
    expect(html).toContain("Powered by");
  });

  it("defaults the header to the LE CID logo", () => {
    const html = buildEmailHTML({ ...DOC, poweredByHtml: poweredByLeHtml() });
    expect(html).toContain(`src="cid:${LE_LOGO_CID}"`);
  });

  it("keeps the QuickBooks-clone body intact (line items + totals still render)", () => {
    const html = buildEmailHTML({
      ...DOC,
      logoSrc: `cid:${LE_LOGO_CID}`,
      poweredByHtml: poweredByLeHtml(),
    });
    expect(html).toContain("Electrical service");
    expect(html).toContain("16,000.00");
    expect(html).toContain("231595");
  });
});

describe("payment confirmation template", () => {
  it("carries the Powered by LE footer", () => {
    const built = buildPaymentConfirmEmail({
      customerName: "Shneor Seewald",
      amount: "$500.00",
      invoiceNo: "231595",
    });
    const html = typeof built === "string" ? built : built.html;
    expect(html).toContain("Powered by");
  });
});

describe("statement template", () => {
  const ST = {
    company: { name: "BLZ Electric Inc." },
    billToName: "Shneor Seewald",
    typeLabel: "Open invoices",
    periodLabel: "July 2026",
    totalDue: 16000,
    invoices: [],
  };

  it("carries the Powered by LE footer", () => {
    expect(buildStatementHtml(ST)).toContain("Powered by");
  });

  it("uses the tenant logo in the header when set", () => {
    const html = buildStatementHtml({
      ...ST,
      company: { name: "Other Co", logoUrl: "https://tenant.example.com/x.png" },
    });
    expect(html).toContain('src="https://tenant.example.com/x.png"');
    expect(html).toContain("Powered by");
  });

  it("defaults the header to the LE CID logo", () => {
    expect(buildStatementHtml(ST)).toContain(`src="cid:${LE_LOGO_CID}"`);
  });
});

describe("customer email shell", () => {
  it("wraps plain text with a branded header and the Powered by LE footer", () => {
    const html = buildCustomerEmailHtml("Hello there\nSecond line");
    expect(html).toContain("Hello there");
    expect(html).toContain("Second line");
    expect(html).toContain(`src="cid:${LE_LOGO_CID}"`);
    expect(html).toContain("Powered by");
  });

  it("swaps the header for a tenant but keeps the footer", () => {
    const html = buildCustomerEmailHtml("Body", {
      name: "Other Co",
      logoUrl: "https://tenant.example.com/x.png",
    });
    expect(html).toContain('src="https://tenant.example.com/x.png"');
    expect(html).toContain("Other Co");
    expect(html).toContain("Powered by");
  });
});

describe("plain-text alternative", () => {
  it("exposes a text form of the constant", () => {
    expect(POWERED_BY_LE_TEXT).toBe("Powered by LE");
  });
});
