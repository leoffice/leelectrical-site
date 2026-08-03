// Email branding — the white-label seam + APPROVED STANDARD shell.
//   HEADER = tenant brand (swappable).
//   BODY   = per-email content only.
//   SIGNATURE = Gmail-style (Levi / President / company / contact).
//   FOOTER = "Powered by LE" (constant on every email, every tenant).
//
// Every customer email type MUST route through buildBrandedEmailHtml().
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRAND_NAME,
  DEFAULT_SIGNER,
  COMPANY_INFO,
  LE_LOGO_CID,
  POWERED_BY_LE_TEXT,
  buildBrandedEmailHtml,
  leLogoAttachment,
  poweredByLeHtml,
  resolveEmailBrand,
  signatureBlockHtml,
  signatureText,
} from "../../netlify/functions/lib/emailBranding.mjs";
import emailTemplate from "../../netlify/functions/lib/le-invoice-suite/email-template.js";
import { buildPaymentConfirmEmail } from "../../netlify/functions/lib/paymentConfirmEmail.mjs";
import { buildStatementHtml } from "../../netlify/functions/lib/statementEmailServer.mjs";
import { buildCustomerEmailHtml } from "../../netlify/functions/lib/customerEmail.mjs";
import {
  POWERED_BY_LE_TEXT as APP_POWERED,
  buildBrandedEmailHtml as appBuild,
} from "../../netlify/functions/lib/emailBranding.mjs";

const { buildEmailBodyHTML, buildEmailHTML } = emailTemplate;

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
  billTo: { name: "Shneor Seewald", addressLines: ["1445 President st"] },
  lines: [{ description: "Electrical service", qty: 1, rate: 16000, amount: 16000 }],
  amountDue: 16000,
};

/** Markers every shell-wrapped email must carry (APPROVED STANDARD). */
function expectStandardShell(html, { bodySnippet } = {}) {
  // Letterhead banner (not the old full-width green bar or giant 160px logo alone)
  expect(html).toContain("Licensed Electrical Contractor");
  expect(html).toContain(COMPANY_INFO.license);
  // CID logo so it shows without "display images"
  expect(html).toContain(`src="cid:${LE_LOGO_CID}"`);
  // Gmail-style signature
  expect(html).toContain(DEFAULT_SIGNER.name);
  expect(html).toContain(DEFAULT_SIGNER.title);
  expect(html).toContain(COMPANY_INFO.email);
  expect(html).toContain(COMPANY_INFO.website);
  // Constant product footer
  expect(html).toContain("Powered by");
  if (bodySnippet) expect(html).toContain(bodySnippet);
}

/** Invoice/estimate path used by docEmail: body fragment → branded shell. */
function buildDocShellHtml(extra = {}) {
  const bodyHtml = buildEmailBodyHTML({
    ...DOC,
    viewLink: "https://leelectrical.us/pay/231595-a1b2",
    viewLabel: "View/Pay Invoice",
    ...extra,
  });
  return buildBrandedEmailHtml({
    bodyHtml,
    tenant: { name: DOC.company.name },
    preheader: `Invoice #${DOC.docNumber}`,
  });
}

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

describe("invoice/estimate — standard shell path (docEmail)", () => {
  it("uses letterhead + signature + Powered by LE", () => {
    const html = buildDocShellHtml();
    expectStandardShell(html, { bodySnippet: "Electrical service" });
  });

  it("keeps the QuickBooks-clone body (amount banner + line items + totals)", () => {
    const html = buildDocShellHtml();
    expect(html).toContain("16,000.00");
    expect(html).toContain("231595");
    expect(html).toContain("View/Pay Invoice");
    expect(html).toContain("Bill to");
    expect(html).toContain("Shneor Seewald");
  });

  it("centers logo + company + billing address on every letterhead (Levi 2026-08-03)", () => {
    const html = buildDocShellHtml();
    expect(html).toContain("text-align:center");
    expect(html).toContain("align=\"center\"");
    expect(html).toContain("383 Kingston Ave");
    expect(html).toContain("Brooklyn, NY 11213");
    expect(html).toContain(COMPANY_INFO.email);
    // Logo is block-centered, not inline next to company name
    expect(html).toMatch(/display:block;margin:0 auto/);
  });

  it("swaps the header for a tenant logo", () => {
    const bodyHtml = buildEmailBodyHTML({ ...DOC });
    const html = buildBrandedEmailHtml({
      bodyHtml,
      tenant: { name: "Other Co", logoUrl: "https://tenant.example.com/x.png" },
    });
    expect(html).toContain('src="https://tenant.example.com/x.png"');
    expect(html).toContain("Other Co");
    expect(html).toContain("Powered by");
    expect(html).toContain(DEFAULT_SIGNER.name);
  });

  it("legacy full buildEmailHTML still renders when called directly (compat)", () => {
    const html = buildEmailHTML({
      ...DOC,
      logoSrc: `cid:${LE_LOGO_CID}`,
      poweredByHtml: poweredByLeHtml(),
    });
    expect(html).toContain("Powered by");
    expect(html).toContain("Electrical service");
  });
});

describe("payment confirmation — standard shell", () => {
  it("uses letterhead + signature + Powered by LE", () => {
    const built = buildPaymentConfirmEmail({
      firstName: "Shneor",
      invoiceNo: "231595",
      amountPaid: 500,
      balanceNow: 0,
      payDate: "2026-07-09",
    });
    const html = typeof built === "string" ? built : built.html;
    expectStandardShell(html, { bodySnippet: "Payment received" });
    expect(html).toContain("#231595");
    expect(html).toContain("$500");
  });
});

describe("statement — standard shell", () => {
  const ST = {
    company: { name: "BLZ Electric Inc." },
    billToName: "Shneor Seewald",
    typeLabel: "Open invoices",
    periodLabel: "July 2026",
    totalDue: 16000,
    invoices: [],
  };

  it("uses letterhead + signature + Powered by LE", () => {
    expectStandardShell(buildStatementHtml(ST), { bodySnippet: "Account Statement" });
  });

  it("uses the tenant logo in the header when set", () => {
    const html = buildStatementHtml({
      ...ST,
      company: { name: "Other Co", logoUrl: "https://tenant.example.com/x.png" },
    });
    expect(html).toContain('src="https://tenant.example.com/x.png"');
    expect(html).toContain("Other Co");
    expect(html).toContain("Powered by");
    expect(html).toContain(DEFAULT_SIGNER.name);
  });

  it("defaults the header to the LE CID logo", () => {
    expect(buildStatementHtml(ST)).toContain(`src="cid:${LE_LOGO_CID}"`);
  });
});

describe("customer email shell", () => {
  it("wraps plain text with branded header, signature, and Powered by LE", () => {
    const html = buildCustomerEmailHtml("Hello there\nSecond line");
    expectStandardShell(html, { bodySnippet: "Hello there" });
    expect(html).toContain("Second line");
  });

  it("swaps the header for a tenant but keeps the signature + footer", () => {
    const html = buildCustomerEmailHtml("Body", {
      name: "Other Co",
      logoUrl: "https://tenant.example.com/x.png",
    });
    expect(html).toContain('src="https://tenant.example.com/x.png"');
    expect(html).toContain("Other Co");
    expect(html).toContain("Powered by");
    expect(html).toContain(DEFAULT_SIGNER.name);
  });
});

describe("Con Ed application email path (shell builder)", () => {
  it("buildBrandedEmailHtml is the application send wrapper", () => {
    // applicationEmail.mjs calls buildBrandedEmailHtml with friendly body text
    const html = buildBrandedEmailHtml({
      bodyHtml: "Your Con Edison Application for Service is complete.",
      preheader: "Con Ed Application — 1445 President",
    });
    expectStandardShell(html, {
      bodySnippet: "Your Con Edison Application for Service is complete.",
    });
    expect(html).toContain("Con Ed Application — 1445 President");
  });
});

describe("standard branded shell (§10 / APPROVED STANDARD)", () => {
  it("buildBrandedEmailHtml = header + body + signature + Powered by LE", () => {
    const html = buildBrandedEmailHtml({
      bodyHtml: "<p>Your application is complete.</p>",
      preheader: "Con Ed app ready",
    });
    expect(html).toContain("BLZ Electric Inc.");
    expect(html).toContain("Licensed Electrical Contractor");
    expect(html).toContain(COMPANY_INFO.license);
    expect(html).toContain("Your application is complete.");
    expect(html).toContain(DEFAULT_SIGNER.name);
    expect(html).toContain("Powered by");
    expect(html).toContain(`src="cid:${LE_LOGO_CID}"`);
    expect(html).toContain("Con Ed app ready");
  });

  it("signatureBlockHtml is overridable per signer", () => {
    const html = signatureBlockHtml({ signer: { name: "Office Team", title: "Office" } });
    expect(html).toContain("Office Team");
    expect(html).toContain("Office");
    expect(html).not.toContain(DEFAULT_SIGNER.name);
  });

  it("signatureText is plain and includes company + contact", () => {
    const t = signatureText();
    expect(t).toContain(DEFAULT_SIGNER.name);
    expect(t).toContain(COMPANY_INFO.phone);
    expect(t).toContain(COMPANY_INFO.website);
  });

  it("ALL five customer email types share the shell markers", () => {
    const types = {
      application: buildBrandedEmailHtml({ bodyHtml: "App body" }),
      statement: buildStatementHtml({
        company: { name: "BLZ Electric Inc." },
        billToName: "C",
        typeLabel: "Open",
        totalDue: 1,
      }),
      doc: buildDocShellHtml(),
      customer: buildCustomerEmailHtml("Hi"),
      paymentConfirm: buildPaymentConfirmEmail({
        firstName: "C",
        invoiceNo: "1",
        amountPaid: 10,
        balanceNow: 0,
        payDate: "2026-08-01",
      }).html,
    };
    for (const [name, html] of Object.entries(types)) {
      expect(html, name).toContain("Licensed Electrical Contractor");
      expect(html, name).toContain(DEFAULT_SIGNER.name);
      expect(html, name).toContain("Powered by");
      expect(html, name).toContain(`src="cid:${LE_LOGO_CID}"`);
    }
  });
});

describe("plain-text alternative", () => {
  it("exposes a text form of the constant", () => {
    expect(POWERED_BY_LE_TEXT).toBe("Powered by LE");
    expect(APP_POWERED).toBe(POWERED_BY_LE_TEXT);
    expect(typeof appBuild).toBe("function");
  });
});
