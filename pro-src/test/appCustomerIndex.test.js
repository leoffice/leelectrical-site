import { describe, expect, it } from "vitest";
import {
  buildAppCustomerIndex,
  mergeCustomerSearchResults,
  qboIdInIndex,
  trustedQboCustomerId,
} from "../src/lib/appCustomerIndex.js";
import { customerPickPatch } from "../src/lib/customers.js";

describe("appCustomerIndex", () => {
  const jobs = [
    {
      id: "qbo-251844",
      customer: "levi tester",
      businessName: "levi tester",
      email: "levikumer@gmail.com",
      qboCustomerId: "1602",
      address: "1150 Eastern Pkwy",
      serviceAddress: "1150 Eastern Pkwy",
    },
    {
      id: "j2",
      customer: "Peretz Chein",
      qboCustomerId: "1",
      phone: "718-555-0100",
    },
  ];

  const qboIndex = [
    { id: "1", name: "Peretz Chein", businessName: "Peretz Chein" },
    { id: "34", name: "Avraham Drizin", businessName: "Avraham Drizin" },
  ];

  it("trustedQboCustomerId drops phantom ids not in the index", () => {
    expect(trustedQboCustomerId("1602", qboIndex)).toBe("");
    expect(trustedQboCustomerId("1", qboIndex)).toBe("1");
  });

  it("buildAppCustomerIndex lists app customers including pending-qbo rows", () => {
    const idx = buildAppCustomerIndex(jobs);
    const levi = idx.find((c) => c.name === "levi tester");
    expect(levi).toBeTruthy();
    expect(levi.qboCustomerId).toBe("1602");
    expect(levi._fromApp).toBe(true);
  });

  it("mergeCustomerSearchResults adds app-only levi tester with pending flag", () => {
    const merged = mergeCustomerSearchResults([], buildAppCustomerIndex(jobs), "levi", qboIndex);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("levi tester");
    expect(merged[0]._pendingQbo).toBe(true);
    expect(merged[0]._fromApp).toBe(true);
  });

  it("mergeCustomerSearchResults prefers verified QBO row over app duplicate", () => {
    const merged = mergeCustomerSearchResults(
      [{ id: "1", name: "Peretz Chein", businessName: "Peretz Chein" }],
      buildAppCustomerIndex(jobs),
      "peretz",
      qboIndex
    );
    expect(merged.some((c) => c.id === "1" && !c._pendingQbo)).toBe(true);
  });

  it("customerPickPatch clears stale qboCustomerId on pending app pick", () => {
    const pick = {
      name: "levi tester",
      businessName: "levi tester",
      email: "levikumer@gmail.com",
      _pendingQbo: true,
      _fromApp: true,
    };
    const p = customerPickPatch(pick, jobs);
    expect(p.qboCustomerId).toBe("");
    expect(p.email).toBe("levikumer@gmail.com");
  });

  it("qboIdInIndex", () => {
    expect(qboIdInIndex("1", qboIndex)).toBe(true);
    expect(qboIdInIndex("1602", qboIndex)).toBe(false);
  });
});