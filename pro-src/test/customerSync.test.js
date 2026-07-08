import { describe, expect, it } from "vitest";
import {
  calendarServiceLocation,
  customerSyncPayload,
  effectiveServiceAddress,
  serviceAddressHint,
  serviceAddressLabel,
} from "../src/lib/customerSync.js";

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

  it("calendarServiceLocation expands short service address with apt and billing city/state/zip", () => {
    expect(
      calendarServiceLocation({
        serviceAddress: "479 A East New York",
        apartment: "4B",
        billingAddress: "405 Lefferts Ave, Brooklyn, NY 11225",
      })
    ).toBe("479 A East New York, Apt 4B, Brooklyn, NY 11225");
  });

  it("calendarServiceLocation keeps an already-complete service address", () => {
    expect(calendarServiceLocation({ serviceAddress: "123 Main St, Brooklyn, NY 11201" })).toBe(
      "123 Main St, Brooklyn, NY 11201"
    );
  });

  it("serviceAddressLabel ties the field to invoice or estimate number", () => {
    expect(serviceAddressLabel({ invoiceNo: "251841" })).toBe("Service address (invoice #251841)");
    expect(serviceAddressLabel({ estimateNo: "E-9" })).toBe("Service address (estimate #E-9)");
    expect(serviceAddressLabel({ invoiceNo: "1", estimateNo: "E-9" })).toBe("Service address (invoice #1)");
    expect(serviceAddressLabel({})).toBe("Service address");
  });

  it("serviceAddressHint explains invoice/estimate scope", () => {
    expect(serviceAddressHint({ invoiceNo: "251841" })).toMatch(/invoice\/estimate/i);
    expect(serviceAddressHint({})).toMatch(/when created/i);
  });
});