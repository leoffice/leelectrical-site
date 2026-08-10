import { describe, expect, it } from "vitest";
import {
  PERMIT_RENEW_FEE_DEFAULT,
  buildPermitRenewInvoiceLines,
  hasPermitRenewMock,
  isLeviTesterJob,
  permitRenewMockPatch,
  renewFilingLabel,
} from "../src/lib/permitRenewInvoice.js";

describe("permitRenewInvoice", () => {
  it("builds a $365 renew line with address and filing", () => {
    const job = {
      serviceAddress: "40 Hampton Pl",
      permits: [{ agency: "dob", number: "B01126007-S1-EL" }],
    };
    const lines = buildPermitRenewInvoiceLines(job, { mock: true });
    expect(lines).toHaveLength(1);
    expect(lines[0].unitPrice).toBe(PERMIT_RENEW_FEE_DEFAULT);
    expect(lines[0].qty).toBe(1);
    expect(lines[0].description).toMatch(/40 Hampton/);
    expect(lines[0].description).toMatch(/B01126007/);
    expect(lines[0].description).toMatch(/MOCK/);
  });

  it("detects Levi Tester jobs", () => {
    expect(isLeviTesterJob({ customer: "Levi Tester" })).toBe(true);
    expect(isLeviTesterJob({ customer: "Yossi Bashari" })).toBe(false);
  });

  it("reads filing number from paperwork when permits empty", () => {
    expect(
      renewFilingLabel({ paperwork: { dob: { filingNumber: "B01126007" } } })
    ).toBe("B01126007");
  });

  it("permitRenewMockPatch seeds invoiceLines + marker", () => {
    const job = {
      customer: "Levi Tester",
      address: "40 Hampton Pl",
      permits: [{ agency: "city", number: "B01126007" }],
    };
    const patch = permitRenewMockPatch(job);
    expect(patch.amount).toBe(365);
    expect(patch.invoiceLines[0].unitPrice).toBe(365);
    expect(patch.permitRenewMock.phase).toBe(1);
    expect(patch.permitRenewMock.mock).toBe(true);
    expect(hasPermitRenewMock({ ...job, ...patch })).toBe(true);
  });
});
