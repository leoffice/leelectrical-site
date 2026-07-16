import { describe, expect, it } from "vitest";
import {
  companyFromProfile,
  DEFAULT_FEATURES,
  DEFAULT_PROFILE,
  isFeatureOn,
  mergeFeatures,
  mergeProfile,
} from "../src/lib/tenantProfile.js";

describe("tenantProfile", () => {
  it("merges profile defaults with overrides", () => {
    const p = mergeProfile({ companyName: "Acme Plumbing" });
    expect(p.companyName).toBe("Acme Plumbing");
    expect(p.street).toBe(DEFAULT_PROFILE.street);
    expect(p.paymentMethods.card).toBe(true);
  });

  it("merges payment method flags", () => {
    const p = mergeProfile({ paymentMethods: { card: false } });
    expect(p.paymentMethods.card).toBe(false);
    expect(p.paymentMethods.zelle).toBe(true);
  });

  it("builds COMPANY shape for PDFs", () => {
    const c = companyFromProfile({ companyName: "Test Co", license: "Lic #9" });
    expect(c.name).toBe("Test Co");
    expect(c.license).toBe("Lic #9");
    expect(c.phone).toBe(DEFAULT_PROFILE.phone);
  });

  it("feature toggles default on and can turn off", () => {
    expect(isFeatureOn(undefined, "requisitions")).toBe(true);
    expect(isFeatureOn({ requisitions: false }, "requisitions")).toBe(false);
    expect(mergeFeatures({}).calendar).toBe(DEFAULT_FEATURES.calendar);
  });
});
