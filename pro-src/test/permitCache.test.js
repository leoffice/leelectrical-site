import { describe, it, expect, beforeEach } from "vitest";
import {
  appendRenewSendHistory,
  clearPermitCacheForTests,
  ensurePermitCacheSeeded,
  listReservedPlaceholderInvoices,
  listRenewSendHistory,
  loadPermitCache,
  markPlaceholderMaterialized,
  reservePlaceholderInvoiceNo,
} from "../src/lib/permitCache.js";
import {
  READY_RENEW_SCENARIOS,
  buildRenewNoticeCtaUrl,
  buildPermitRenewEmail,
  listPendingRenewCards,
  scenarioNoticeAlreadySent,
} from "../src/lib/permitRenewal.js";

beforeEach(() => {
  clearPermitCacheForTests();
});

describe("permitCache + notice-only renew", () => {
  it("seeds ready scenarios into DOB permit cache", () => {
    const list = ensurePermitCacheSeeded(READY_RENEW_SCENARIOS);
    expect(list.length).toBeGreaterThanOrEqual(2);
    const ham = list.find((e) => e.scenarioId === "hampton-yossi" || /Hampton/i.test(e.address));
    expect(ham?.permitNo).toMatch(/B01126007/);
    expect(ham?.email).toMatch(/yossi6886/);
    expect(loadPermitCache().length).toBeGreaterThanOrEqual(2);
  });

  it("loads Drive completed permits seed into cache (many rows)", () => {
    const list = ensurePermitCacheSeeded(READY_RENEW_SCENARIOS);
    // Host Drive scan seeds dozens of completed permits (Levi 2026-08-10)
    expect(list.length).toBeGreaterThanOrEqual(20);
    const withNo = list.filter((e) => e.permitNo);
    expect(withNo.length).toBeGreaterThanOrEqual(10);
    // Scenario email still wins for Hampton
    const ham = list.find((e) => /Hampton/i.test(e.address || ""));
    expect(ham?.email).toMatch(/yossi6886|beshari/i);
  });

  it("second ensurePermitCacheSeeded is cheap (session memo — snappy expands)", () => {
    const first = ensurePermitCacheSeeded(READY_RENEW_SCENARIOS);
    expect(first.length).toBeGreaterThanOrEqual(20);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) {
      ensurePermitCacheSeeded(READY_RENEW_SCENARIOS);
      loadPermitCache();
    }
    const elapsed = performance.now() - t0;
    // 20 loads should be near-instant once seeded (was rewriting localStorage each time)
    expect(elapsed).toBeLessThan(80);
    expect(loadPermitCache().length).toBe(first.length);
  });

  it("reserves placeholder invoice without creating a job", () => {
    const inv = reservePlaceholderInvoiceNo([], {
      scenarioId: "hampton-yossi",
      permitNo: "B01126007-L1-EL",
      address: "40 Hampton Pl",
    });
    expect(inv).toMatch(/^LE-/);
    const reserved = listReservedPlaceholderInvoices();
    expect(reserved.some((r) => r.invoiceNo === inv && !r.materialized)).toBe(true);
    markPlaceholderMaterialized(inv);
    expect(listReservedPlaceholderInvoices().find((r) => r.invoiceNo === inv)?.materialized).toBe(
      true
    );
  });

  it("CTA url carries scenario + placeholder inv (invoice on customer tap)", () => {
    const url = buildRenewNoticeCtaUrl({
      scenarioId: "hampton-yossi",
      invoiceNo: "LE-9999",
      origin: "https://leelectrical.us",
    });
    expect(url).toContain("renewCta=phaseA");
    expect(url).toContain("scenario=hampton-yossi");
    expect(url).toContain("inv=LE-9999");
  });

  it("noticeOnly email reserves ref wording (not real invoice job)", () => {
    const draft = buildPermitRenewEmail({
      scenario: READY_RENEW_SCENARIOS[0],
      invoiceNo: "LE-8888",
      payUrl: "https://leelectrical.us/app/pro/?renewCta=phaseA",
      noticeOnly: true,
    });
    expect(draft.body).toMatch(/Reference/i);
    expect(draft.body).toMatch(/LE-8888/);
    expect(draft.ctaUrl).toContain("renewCta");
  });

  it("send history + drops pending after notice-only send", () => {
    // Hampton always + Drive rows Levi Approve=Yes (10 DOB renewable). No 364 Schenectady.
    const before = listPendingRenewCards([]);
    expect(before.some((c) => c.scenarioId === "hampton-yossi")).toBe(true);
    expect(before.length).toBeGreaterThanOrEqual(1);
    expect(
      before.every((c) => !/364/.test(c.address || "") || !/schenectady/i.test(c.address || ""))
    ).toBe(true);
    appendRenewSendHistory({
      scenarioId: "hampton-yossi",
      address: "40 Hampton Pl",
      customer: "Yosef Beshari",
      permitNo: "B01126007-L1-EL",
      to: "yossi6886@gmail.com",
      placeholderInvoiceNo: "LE-7777",
    });
    expect(scenarioNoticeAlreadySent([], "hampton-yossi")).toBe(true);
    const pending = listPendingRenewCards([]);
    expect(pending.find((c) => c.scenarioId === "hampton-yossi")).toBeUndefined();
    // Same permit # also drops any drive:B01126007 card
    expect(
      pending.every(
        (c) => !/B01126007/i.test(String(c.permitNo || "")) && !/hampton/i.test(c.address || "")
      )
    ).toBe(true);
    const hist = listRenewSendHistory([]);
    expect(hist.length).toBeGreaterThanOrEqual(1);
    expect(hist[0].placeholderInvoiceNo).toBe("LE-7777");
  });
});
