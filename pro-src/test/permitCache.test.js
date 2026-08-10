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
    expect(listPendingRenewCards([])).toHaveLength(2);
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
    expect(pending.find((c) => c.scenarioId === "schenectady-hackner")).toBeTruthy();
    const hist = listRenewSendHistory([]);
    expect(hist.length).toBeGreaterThanOrEqual(1);
    expect(hist[0].placeholderInvoiceNo).toBe("LE-7777");
  });
});
