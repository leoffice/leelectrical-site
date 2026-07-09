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

  it("returns job patch with qboCustomerId", () => {
    expect(customerQboJobPatch({ customerId: "42" })).toEqual({ qboCustomerId: "42" });
  });

  it("returns null for bad result", () => {
    expect(parseCustomerQboResult("not json")).toBeNull();
    expect(customerQboJobPatch({})).toBeNull();
  });
});