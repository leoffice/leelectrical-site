import { describe, expect, it } from "vitest";
import { customerQboJobPatch, parseCustomerQboResult } from "../src/lib/customerQboLink.js";

describe("customerQboLink", () => {
  it("parses JSON string create_customer result", () => {
    const r = parseCustomerQboResult('{"action":"created","customerId":"1601","name":"levi tester"}');
    expect(r).toEqual({ customerId: "1601", name: "levi tester" });
  });

  it("parses object update_customer result", () => {
    const r = parseCustomerQboResult({ action: "updated", customerId: "99", name: "Acme" });
    expect(r.customerId).toBe("99");
  });

  it("returns job patch with qboCustomerId and keeps shell visible", () => {
    expect(customerQboJobPatch({ customerId: "42" })).toEqual({
      qboCustomerId: "42",
      _new: true,
    });
  });

  it("fills identity from create_customer command payload", () => {
    const patch = customerQboJobPatch(
      { customerId: "1608", name: "Mordechai Nemni" },
      {
        payload: {
          name: "Mordechai Nemni",
          phone: "718-809-0687",
          email: "nemnifam@gmail.com",
          billingAddr: "1254 sterling pl brooklyn",
          addr: "1254 sterling pl brooklyn",
        },
      }
    );
    expect(patch).toMatchObject({
      qboCustomerId: "1608",
      _new: true,
      customer: "Mordechai Nemni",
      businessName: "Mordechai Nemni",
      phone: "718-809-0687",
      email: "nemnifam@gmail.com",
      billingAddress: "1254 sterling pl brooklyn",
      serviceAddress: "1254 sterling pl brooklyn",
    });
  });

  it("returns null for bad result", () => {
    expect(parseCustomerQboResult("not json")).toBeNull();
    expect(customerQboJobPatch({})).toBeNull();
  });
});