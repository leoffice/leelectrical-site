import { describe, expect, it } from "vitest";
import { serviceAddressesExcludingBilling } from "../src/lib/addressSync.js";

describe("addressSync", () => {
  it("serviceAddressesExcludingBilling drops addresses that match billing", () => {
    expect(
      serviceAddressesExcludingBilling(
        ["50 Billing Blvd, Newark, NJ", "200 Service Ave, Brooklyn, NY"],
        "50 Billing Blvd, Newark, NJ"
      )
    ).toEqual(["200 Service Ave, Brooklyn, NY"]);
  });

  it("keeps all service addresses when billing is empty", () => {
    expect(serviceAddressesExcludingBilling(["200 Service Ave"], "")).toEqual([
      "200 Service Ave",
    ]);
  });
});
