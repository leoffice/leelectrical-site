// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  RECENCY_KEY,
  touchCustomer,
  customerRecencyTs,
  compareCustomerRecency,
  getRecencyRevision,
  subscribeRecency,
} from "../src/lib/customerRecency.js";

describe("customerRecency", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("touchCustomer stores and reads recency for a board key", () => {
    touchCustomer("c:acme");
    const ts = customerRecencyTs("c:acme", []);
    expect(ts).toBeGreaterThan(0);
    expect(localStorage.getItem(RECENCY_KEY)).toContain("c:acme");
  });

  it("falls back to latest job activity when never touched", () => {
    const jobs = [
      { id: "j1", customer: "Acme", updatedAt: 1000 },
      { id: "j2", customer: "Acme", updatedAt: 5000 },
    ];
    expect(customerRecencyTs("c:acme", jobs)).toBe(5000);
  });

  it("compareCustomerRecency puts most recent first", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    touchCustomer("c:old");
    vi.setSystemTime(5000);
    touchCustomer("c:new");
    expect(customerRecencyTs("c:new", [])).toBeGreaterThan(customerRecencyTs("c:old", []));
    expect(compareCustomerRecency("c:old", [], "c:new", [])).toBeGreaterThan(0);
    expect(compareCustomerRecency("c:new", [], "c:old", [])).toBeLessThan(0);
    vi.useRealTimers();
  });

  it("uses max of touch and job activity", () => {
    touchCustomer("c:acme");
    const touched = customerRecencyTs("c:acme", []);
    const jobs = [{ id: "j1", customer: "Acme", updatedAt: touched + 5000 }];
    expect(customerRecencyTs("c:acme", jobs)).toBe(touched + 5000);
  });

  it("aliases q: and c: keys so touch on one applies to both", () => {
    touchCustomer("q:99", [{ id: "j1", customer: "Acme Co", qboCustomerId: "99" }]);
    expect(customerRecencyTs("c:acme co", [{ id: "j1", customer: "Acme Co", qboCustomerId: "99" }])).toBeGreaterThan(0);
  });

  it("notifies subscribers when recency changes", () => {
    const seen = [];
    const unsub = subscribeRecency((n) => seen.push(n));
    touchCustomer("c:one");
    unsub();
    expect(seen.length).toBe(1);
    expect(getRecencyRevision()).toBeGreaterThan(0);
  });
});