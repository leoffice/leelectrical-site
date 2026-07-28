// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  maxDocNumberOnBoard,
  nextDocNumberFromJobs,
  numericDocCore,
  resolveDocNumberOnSave,
} from "../src/lib/nextDocNumber.js";

afterEach(() => {
  localStorage.clear();
});

describe("nextDocNumber", () => {
  it("parses pure and CO-style numbers", () => {
    expect(numericDocCore("251841")).toBe(251841);
    expect(numericDocCore("251100-CO-01")).toBe(251100);
    expect(numericDocCore("E-12")).toBe(0);
    expect(numericDocCore("")).toBe(0);
  });

  it("takes max from the board", () => {
    const jobs = [
      { invoiceNo: "251800" },
      { invoiceNo: "251841" },
      { invoiceNo: "251100-CO-02" },
      { estimateNo: "900" },
    ];
    expect(maxDocNumberOnBoard(jobs, "invoice")).toBe(251841);
    expect(maxDocNumberOnBoard(jobs, "estimate")).toBe(900);
  });

  it("allocates next and does not reissue", () => {
    const jobs = [{ invoiceNo: "251900" }];
    expect(nextDocNumberFromJobs(jobs, "invoice")).toBe("251901");
    // Counter floor prevents reuse even with empty board.
    expect(nextDocNumberFromJobs([], "invoice")).toBe("251902");
  });

  it("resolve keeps existing, then preferred, then next", () => {
    const jobs = [{ invoiceNo: "100" }];
    expect(
      resolveDocNumberOnSave({ kind: "invoice", existing: "99", preferred: "100-CO-01", jobs })
    ).toBe("99");
    expect(
      resolveDocNumberOnSave({ kind: "invoice", existing: "", preferred: "100-CO-01", jobs })
    ).toBe("100-CO-01");
    expect(resolveDocNumberOnSave({ kind: "invoice", existing: "", preferred: "", jobs })).toBe(
      "101"
    );
  });
});
