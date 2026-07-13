import { describe, expect, it } from "vitest";
import { addressesDiffer, prefillAtServiceAddress, prefillFromEvent } from "../src/lib/prefillFromEvent.js";

describe("prefillFromEvent", () => {
  it("parses customer <name> from calendar description (#58)", () => {
    const p = prefillFromEvent({
      id: "ev-cal58",
      summary: "Install — Broadway",
      start: "2026-07-10T14:00",
      location: "100 Broadway",
      description: "customer Avraham Drizin apt 4B rear entrance, call on arrival",
    });
    expect(p.customer).toBe("Avraham Drizin");
    expect(p.businessName).toBe("Avraham Drizin");
    expect(p.apartment).toBe("4B");
    expect(p.address).toBe("100 Broadway");
    expect(p.serviceAddress).toBe("100 Broadway");
    expect(p.description).toBe("customer Avraham Drizin rear entrance, call on arrival");
  });

  it("parses phone, email, and splits billing vs service when description address differs", () => {
    const p = prefillFromEvent({
      id: "ev-split",
      summary: "Service call — Brooklyn",
      start: "2026-07-10T14:00",
      location: "200 Service Ave, Brooklyn, NY 11201",
      description:
        "Metro Electric LLC\ncontact: Jane Smith\n718-555-9999\njane@metro.com\nBill to: 50 Billing Blvd, Newark, NJ 07102",
    });
    expect(p.businessName).toBe("Metro Electric LLC");
    expect(p.personName).toBe("Jane Smith");
    expect(p.phone).toBe("718-555-9999");
    expect(p.email).toBe("jane@metro.com");
    expect(p.serviceAddress).toBe("200 Service Ave, Brooklyn, NY 11201");
    expect(p.billingAddress).toBe("50 Billing Blvd, Newark, NJ 07102");
  });

  it("uses location as service when description address matches", () => {
    const p = prefillFromEvent({
      id: "ev-same",
      summary: "Estimate — Same place",
      start: "2026-07-10T10:00",
      location: "55 Elm St, Brooklyn, NY",
      description: "customer Jane Doe phone: 917-555-2222 jane@x.com visit 55 Elm St",
    });
    expect(p.phone).toBe("917-555-2222");
    expect(p.email).toBe("jane@x.com");
    expect(p.serviceAddress).toBe("55 Elm St, Brooklyn, NY");
    expect(p.billingAddress).toBe("");
  });
});

describe("prefillAtServiceAddress", () => {
  const event = {
    id: "ev-addr",
    summary: "Service call — Oak",
    start: "2026-07-10T14:00",
    location: "99 Oak Ave, Brooklyn, NY",
    description: "customer Bob Builder phone: 718-555-0000",
  };

  const customerJobs = [
    {
      id: "J-old",
      customer: "Bob Builder",
      qboCustomerId: "42",
      serviceAddress: "10 Main St",
      billingAddress: "50 Bill Blvd",
      phone: "718-555-1111",
      invoiceNo: "251100",
    },
    {
      id: "J-site2",
      customer: "Bob Builder",
      qboCustomerId: "42",
      serviceAddress: "20 Pine Rd",
      apartment: "2B",
      billingAddress: "50 Bill Blvd",
    },
  ];

  it("keeps calendar fields but clones customer + picked address", () => {
    const p = prefillAtServiceAddress(event, customerJobs, "10 main st");
    expect(p.customer).toBe("Bob Builder");
    expect(p.qboCustomerId).toBe("42");
    expect(p.serviceAddress).toBe("10 Main St");
    expect(p.billingAddress).toBe("50 Bill Blvd");
    expect(p.title).toBe("Service call — Oak");
    expect(p.phone).toBe("718-555-0000");
    expect(p.invoiceNo).toBe("");
    expect(p.estimateNo).toBe("");
    expect(p.calEventId).toBe("ev-addr");
  });

  it("returns calendar-only prefill when no address key", () => {
    const p = prefillAtServiceAddress(event, customerJobs, "");
    expect(p.serviceAddress).toBe("99 Oak Ave, Brooklyn, NY");
    expect(p.qboCustomerId).toBeUndefined();
  });
});

describe("addressesDiffer", () => {
  it("detects different street lines", () => {
    expect(addressesDiffer("50 Billing Blvd, Newark, NJ", "200 Service Ave, Brooklyn, NY")).toBe(true);
    expect(addressesDiffer("55 Elm St", "55 Elm St, Brooklyn")).toBe(false);
  });
});