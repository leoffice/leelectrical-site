import { describe, expect, it } from "vitest";
import { customerSyncPayload, effectiveServiceAddress } from "../src/lib/customerSync.js";

describe("customerSyncPayload (billing vs service)", () => {
  it("sends billing address to QuickBooks, never the job service address", () => {
    const p = customerSyncPayload({
      businessName: "Beth Rivka Crown Street",
      personName: "Office",
      customer: "Beth Rivka Crown Street",
      phone: "718-555-0000",
      email: "office@example.com",
      billingAddress: "405 Lefferts Ave",
      serviceAddress: "479 A East New York",
      address: "479 A East New York",
    });
    expect(p.billingAddr).toBe("405 Lefferts Ave");
    expect(p.addr).toBe("405 Lefferts Ave");
    expect(p.name).toBe("Beth Rivka Crown Street");
    expect(p.businessName).toBe("Beth Rivka Crown Street");
    expect(p.personName).toBe("Office");
    expect(p).not.toHaveProperty("serviceAddress");
  });

  it("effectiveServiceAddress prefers serviceAddress over legacy address", () => {
    expect(effectiveServiceAddress({ serviceAddress: "479 A East New York", address: "405 Lefferts" })).toBe(
      "479 A East New York"
    );
  });
});