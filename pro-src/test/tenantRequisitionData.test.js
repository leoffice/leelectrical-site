// Requisition branding + LE pilot-data quarantine, per tenant.
//
// DEFAULT_REQ_COMPANY_NAME is an `export let` live ESM binding and REQ_BILLING
// is an object of getters — both refresh from tenant_config on read. That is
// subtle machinery: a future refactor to a plain const would silently freeze
// the build seed and leak LE's billing block into every tenant's requisitions.
// These tests fail loudly if that happens.
import { afterEach, describe, expect, it } from "vitest";
import { setActiveTenantConfig } from "../src/lib/tenantBranding.js";
import { resolveTenantConfig, LE_TENANT_SEED } from "../src/lib/tenantConfig.js";
import {
  DEFAULT_REQ_COMPANY_NAME,
  REQ_BILLING,
  findBaezJob,
  projectCustomerContact,
  projectDisplayName,
  seedBaezProject,
} from "../src/lib/requisitionData.js";
import { buildRequisitionEmail } from "../src/lib/requisitionHelpers.js";

const asLE = () => setActiveTenantConfig(resolveTenantConfig(LE_TENANT_SEED));

const asAcme = () =>
  setActiveTenantConfig(
    resolveTenantConfig({
      tenantId: "acme",
      internal: false,
      plan: { tier: "full", crewAddon: true },
      profile: {
        companyName: "Acme Electric LLC",
        email: "hello@acme.example",
        requisition: {
          companyName: "Acme Electric",
          addressLines: ["1 Main St", "Chicago, IL 60601"],
          phone: "312-555-0100",
          email: "billing@acme.example",
          signerName: "Dana Reyes",
        },
      },
    })
  );

afterEach(asLE);

describe("LE keeps its exact requisition billing block", () => {
  it("uses the LE contractor name and Suite 297 address", () => {
    asLE();
    expect(DEFAULT_REQ_COMPANY_NAME).toBe("LE Electrical");
    expect(REQ_BILLING.addressLines).toEqual([
      "383 Kingston Avenue",
      "Suite 297",
      "Brooklyn, New York 11213",
    ]);
    expect(REQ_BILLING.phone).toBe("718-594-1850");
    expect(REQ_BILLING.email).toBe("LE@LEelectrical.US");
  });
});

describe("another tenant reads its own billing block", () => {
  it("swaps every field, with no LE strings left", () => {
    asAcme();
    expect(DEFAULT_REQ_COMPANY_NAME).toBe("Acme Electric");
    expect(REQ_BILLING.addressLines).toEqual(["1 Main St", "Chicago, IL 60601"]);
    expect(REQ_BILLING.phone).toBe("312-555-0100");
    expect(REQ_BILLING.email).toBe("billing@acme.example");

    const blob = JSON.stringify({
      name: DEFAULT_REQ_COMPANY_NAME,
      billing: {
        addressLines: REQ_BILLING.addressLines,
        phone: REQ_BILLING.phone,
        email: REQ_BILLING.email,
      },
    });
    for (const leak of ["LE Electrical", "Kingston", "594-1850", "LEelectrical"]) {
      expect(blob).not.toContain(leak);
    }
  });

  it("signs requisition email with its own signer, not Martin Dorkin", () => {
    asAcme();
    const email = buildRequisitionEmail({ project: { name: "Job" }, requisition: {} });
    const text = JSON.stringify(email);
    expect(text).not.toContain("Martin Dorkin");
    expect(text).not.toContain("LE Electrical");
  });
});

describe("LE pilot data is quarantined to the internal tenant", () => {
  it("seeds the Baez project for LE", async () => {
    asLE();
    const p = await seedBaezProject();
    expect(p).toBeTruthy();
    expect(p.name).toBe("Baez Place");
  });

  it("seeds nothing for another tenant", async () => {
    asAcme();
    expect(await seedBaezProject()).toBeNull();
  });

  it("does not match LE's pilot job for another tenant", () => {
    const jobs = [{ id: "j2", customer: "Joy Construction", address: "334 East 176th Street" }];
    asLE();
    expect(findBaezJob(jobs)?.id).toBe("j2");
    asAcme();
    expect(findBaezJob(jobs)).toBeNull();
  });

  it("does not leak LE's customer into another tenant's contact card", () => {
    asAcme();
    const c = projectCustomerContact({ gc: "Northside GC" }, null);
    expect(c.name).toBe("Northside GC");
    expect(JSON.stringify(c)).not.toContain("Joy Construction");
    expect(JSON.stringify(c)).not.toContain("176th");
  });

  it("does not render LE's customer as another tenant's hub heading", () => {
    asAcme();
    expect(projectDisplayName({ gc: "Northside GC" })).toBe("Northside GC");
    expect(projectDisplayName({})).toBe("");
    asLE();
    expect(projectDisplayName({})).toBe("Joy Construction");
  });
});
