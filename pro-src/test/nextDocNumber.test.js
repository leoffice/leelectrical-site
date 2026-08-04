// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  LE_INVOICE_START,
  isLeInvoiceNo,
  maxDocNumberOnBoard,
  nextDocNumberFromJobs,
  numericDocCore,
  resolveDocNumberOnSave,
} from "../src/lib/nextDocNumber.js";

afterEach(() => {
  localStorage.clear();
});

describe("nextDocNumber", () => {
  it("parses pure, CO-style, and LE- numbers", () => {
    expect(numericDocCore("251841")).toBe(251841);
    expect(numericDocCore("251100-CO-01")).toBe(251100);
    expect(numericDocCore("LE-2700")).toBe(2700);
    expect(numericDocCore("LE-2701-CO-01")).toBe(2701);
    expect(numericDocCore("E-12")).toBe(0);
    expect(numericDocCore("")).toBe(0);
    expect(isLeInvoiceNo("LE-2700")).toBe(true);
    expect(isLeInvoiceNo("251841")).toBe(false);
  });

  it("invoice max only tracks LE- series (legacy QBO numbers ignored)", () => {
    const jobs = [
      { invoiceNo: "251800" },
      { invoiceNo: "251841" },
      { invoiceNo: "251100-CO-02" },
      { invoiceNo: "LE-2705" },
      { estimateNo: "900" },
    ];
    // Floor at LE start-1 when no higher LE-; with LE-2705 → 2705
    expect(maxDocNumberOnBoard(jobs, "invoice")).toBe(2705);
    expect(maxDocNumberOnBoard(jobs, "estimate")).toBe(900);
    // No LE- on board → ready for 2700
    expect(maxDocNumberOnBoard([{ invoiceNo: "251900" }], "invoice")).toBe(LE_INVOICE_START - 1);
  });

  it("allocates LE-2700+ for new invoices and does not reissue", () => {
    const jobs = [{ invoiceNo: "251900" }];
    expect(nextDocNumberFromJobs(jobs, "invoice")).toBe("LE-2700");
    expect(nextDocNumberFromJobs(jobs, "invoice")).toBe("LE-2701");
    // Counter floor continues LE series even with empty board.
    expect(nextDocNumberFromJobs([], "invoice")).toBe("LE-2702");
  });

  it("continues after highest LE- on the board", () => {
    const jobs = [{ invoiceNo: "LE-2710" }, { invoiceNo: "251999" }];
    expect(nextDocNumberFromJobs(jobs, "invoice")).toBe("LE-2711");
  });

  it("estimates stay plain numeric", () => {
    expect(nextDocNumberFromJobs([{ estimateNo: "900" }], "estimate")).toBe("901");
  });

  it("resolve keeps existing, then preferred, then next LE-", () => {
    const jobs = [{ invoiceNo: "100" }];
    expect(
      resolveDocNumberOnSave({ kind: "invoice", existing: "99", preferred: "100-CO-01", jobs })
    ).toBe("99");
    expect(
      resolveDocNumberOnSave({ kind: "invoice", existing: "", preferred: "100-CO-01", jobs })
    ).toBe("100-CO-01");
    expect(resolveDocNumberOnSave({ kind: "invoice", existing: "", preferred: "", jobs })).toBe(
      "LE-2700"
    );
  });
});
