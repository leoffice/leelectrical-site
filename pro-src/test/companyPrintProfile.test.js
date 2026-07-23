// Company profile → every local printout (invoices, estimates, requisitions).
// Settings saves must land on the live tenant snapshot immediately so View
// Local File uses the new name / email / Zelle without a reload. White-label
// / demo tenants must never inherit LE mailboxes on the standard Zelle line.
import { afterEach, describe, expect, it } from "vitest";
import {
  applyCompanyProfileToActiveConfig,
  defaultZelleInstructions,
  setActiveTenantConfig,
  tenantCompany,
  tenantPaymentLines,
  tenantZelleInstructions,
} from "../src/lib/tenantBranding.js";
import { resolveTenantConfig, LE_TENANT_SEED } from "../src/lib/tenantConfig.js";
import { mergeProfile } from "../src/lib/tenantProfile.js";
import { invoicePaymentLines, qbCompany } from "../src/lib/jobToQbDoc.js";
import { paymentInstructions } from "../src/lib/invoicePdf.js";
import { DEFAULT_REQ_COMPANY_NAME, REQ_BILLING } from "../src/lib/requisitionData.js";

const asLE = () => setActiveTenantConfig(resolveTenantConfig(LE_TENANT_SEED));

afterEach(asLE);

describe("applyCompanyProfileToActiveConfig", () => {
  it("updates live company header fields used by invoice/estimate PDFs", () => {
    asLE();
    applyCompanyProfileToActiveConfig({
      companyName: "Ace Plumbing Co.",
      street: "1140 Guadalupe St",
      cityStateZip: "Austin, TX 78701",
      phone: "(512) 555-0142",
      email: "office@aceplumbing.example",
      license: "TX MPL #45521",
      zelleInstructions: "Zelle: Send payment to office@aceplumbing.example.",
    });
    const c = tenantCompany();
    expect(c.name).toBe("Ace Plumbing Co.");
    expect(c.email).toBe("office@aceplumbing.example");
    expect(c.phone).toBe("(512) 555-0142");
    expect(qbCompany().email).toBe("office@aceplumbing.example");
    expect(qbCompany().name).toBe("Ace Plumbing Co.");
  });

  it("keeps Zelle print line on the company email for the demo pattern", () => {
    asLE();
    applyCompanyProfileToActiveConfig({
      companyName: "Ace Plumbing Co.",
      email: "office@aceplumbing.example",
      zelleInstructions: "Zelle: Send payment to Office@LeElectrical.us.",
    });
    expect(tenantZelleInstructions()).toBe(
      "Zelle: Send payment to office@aceplumbing.example."
    );
    const lines = invoicePaymentLines().join("\n");
    expect(lines).toContain("office@aceplumbing.example");
    expect(lines).not.toMatch(/Office@LeElectrical\.us/i);
    expect(paymentInstructions().join("\n")).toContain("office@aceplumbing.example");
  });
});

describe("default / tenant Zelle from company email", () => {
  it("builds the standard Zelle line from a mailbox", () => {
    expect(defaultZelleInstructions("billing@acme.example")).toBe(
      "Zelle: Send payment to billing@acme.example."
    );
  });

  it("mergeProfile rewrites a stale standard Zelle when email changes", () => {
    const p = mergeProfile({
      companyName: "Ace Plumbing Co.",
      email: "office@aceplumbing.example",
      zelleInstructions: "Zelle: Send payment to Office@LeElectrical.us.",
    });
    expect(p.zelleInstructions).toBe("Zelle: Send payment to office@aceplumbing.example.");
  });

  it("leaves a custom Zelle line alone", () => {
    const p = mergeProfile({
      email: "office@aceplumbing.example",
      zelleInstructions: "Zelle: Pay Ace via the app — ask the office.",
    });
    expect(p.zelleInstructions).toBe("Zelle: Pay Ace via the app — ask the office.");
  });

  it("tenantPaymentLines uses the live company email Zelle", () => {
    setActiveTenantConfig(
      resolveTenantConfig({
        tenantId: "ace",
        internal: false,
        plan: { tier: "full" },
        profile: {
          companyName: "Ace Plumbing Co.",
          email: "office@aceplumbing.example",
          paymentMethods: { card: true, zelle: true, check: true },
          zelleInstructions: "Zelle: Send payment to Office@LeElectrical.us.",
          checkInstructions: 'Check: payable to "Ace Plumbing Co."',
        },
      })
    );
    const blob = tenantPaymentLines().join("\n");
    expect(blob).toContain("office@aceplumbing.example");
    expect(blob).not.toMatch(/Office@LeElectrical\.us/i);
  });
});

describe("requisitions inherit company contact when requisition email is missing", () => {
  it("does not leak LE mailbox onto a demo-style company", () => {
    setActiveTenantConfig(
      resolveTenantConfig({
        tenantId: "demo",
        internal: false,
        plan: { tier: "full" },
        profile: {
          companyName: "Ace Plumbing Co.",
          street: "1140 Guadalupe St, Suite 5",
          cityStateZip: "Austin, TX 78701",
          phone: "(512) 555-0142",
          email: "office@aceplumbing.example",
          // Partial requisition (like the demo seed) — no email key
          requisition: {
            companyName: "Ace Plumbing Co.",
            phone: "(512) 555-0142",
          },
        },
      })
    );
    expect(DEFAULT_REQ_COMPANY_NAME).toBe("Ace Plumbing Co.");
    expect(REQ_BILLING.email).toBe("office@aceplumbing.example");
    expect(REQ_BILLING.phone).toBe("(512) 555-0142");
    expect(REQ_BILLING.email).not.toMatch(/LEelectrical/i);
  });

  it("derives the whole requisition block from company profile when none is set", () => {
    setActiveTenantConfig(
      resolveTenantConfig({
        tenantId: "acme",
        internal: false,
        plan: { tier: "full" },
        profile: {
          companyName: "Acme Electric LLC",
          street: "1 Main St",
          cityStateZip: "Chicago, IL 60601",
          phone: "312-555-0100",
          email: "hello@acme.example",
        },
      })
    );
    expect(DEFAULT_REQ_COMPANY_NAME).toBe("Acme Electric LLC");
    expect(REQ_BILLING.email).toBe("hello@acme.example");
    expect(REQ_BILLING.addressLines.join(" ")).toContain("1 Main St");
    expect(JSON.stringify(REQ_BILLING)).not.toContain("Kingston");
  });
});
