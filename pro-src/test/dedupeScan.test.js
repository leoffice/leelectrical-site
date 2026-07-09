// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEDUPE_SCAN_KEY,
  scanDue,
  countMergePairs,
  countInvoiceDupes,
  runDailyDedupeScan,
  todayKey,
} from "../src/lib/dedupeScan.js";

beforeEach(() => {
  localStorage.clear();
});

describe("daily dedupe scan", () => {
  const jobs = [
    { id: "J-1", customer: "Arthur Koptiv", phone: "718-555-1111" },
    { id: "J-2", customer: "Arthur Koptive", phone: "917-555-2222" },
    { id: "J-3", customer: "Other Guy", invoiceNo: "251808", amount: "$100" },
    { id: "J-4", customer: "Another", invoiceNo: "251808", amount: "$200" },
  ];

  it("todayKey is YYYY-MM-DD", () => {
    expect(todayKey(new Date("2026-07-09T12:00:00Z"))).toBe("2026-07-09");
  });

  it("scanDue is true until first scan of the day", () => {
    expect(scanDue(Date.parse("2026-07-09T10:00:00Z"))).toBe(true);
    localStorage.setItem(
      DEDUPE_SCAN_KEY,
      JSON.stringify({ day: "2026-07-09", scannedAt: 1, customerCount: 0, invoiceCount: 0 })
    );
    expect(scanDue(Date.parse("2026-07-09T18:00:00Z"))).toBe(false);
    expect(scanDue(Date.parse("2026-07-10T08:00:00Z"))).toBe(true);
  });

  it("countMergePairs and countInvoiceDupes find both issue types", () => {
    expect(countMergePairs(jobs)).toBe(1);
    expect(countInvoiceDupes(jobs)).toBe(1);
  });

  it("runDailyDedupeScan records metadata once per day and returns findings", () => {
    const first = runDailyDedupeScan(jobs, Date.parse("2026-07-09T09:00:00Z"));
    expect(first.ran).toBe(true);
    expect(first.due).toBe(true);
    expect(first.customerCount).toBe(1);
    expect(first.invoiceCount).toBe(1);
    expect(first.merge).toBeTruthy();
    expect(first.invoice).toBeTruthy();

    const second = runDailyDedupeScan(jobs, Date.parse("2026-07-09T20:00:00Z"));
    expect(second.ran).toBe(false);
    expect(second.due).toBe(false);
    expect(second.merge).toBeTruthy();
  });
});