// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  RECENCY_KEY,
  touchCustomer,
  customerRecencyTs,
  compareCustomerRecency,
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
});