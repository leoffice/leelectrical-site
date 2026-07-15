import { describe, expect, it } from "vitest";
import { serviceAddressesExcludingBilling, syncBillingFromService } from "../src/lib/addressSync.js";

describe("addressSync", () => {
  it("syncBillingFromService fills empty billing from service", () => {
    expect(syncBillingFromService("123 Main St", { billingAddress: "", serviceAddress: "" })).toBe("123 Main St");
  });

  it("syncBillingFromService updates billing when it matched prior service", () => {
    expect(
      syncBillingFromService("200 New Ave", {
        billingAddress: "100 Old St",
        serviceAddress: "100 Old St",
      })
    ).toBe("200 New Ave");
  });

  it("syncBillingFromService leaves billing alone when user set a different address", () => {
    expect(
      syncBillingFromService("200 New Ave", {
        billingAddress: "50 Billing Blvd",
        serviceAddress: "100 Old St",
      })
    ).toBe("50 Billing Blvd");
  });

  it("serviceAddressesExcludingBilling drops addresses that match billing", () => {
    expect(
      serviceAddressesExcludingBilling(
        ["50 Billing Blvd, Newark, NJ", "200 Service Ave, Brooklyn, NY"],
        "50 Billing Blvd, Newark, NJ"
      )
    ).toEqual(["200 Service Ave, Brooklyn, NY"]);
  });
});