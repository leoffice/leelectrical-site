import { describe, expect, it } from "vitest";
import { fmtBalanceNow, parsePayThanksParams } from "../src/lib/payThanks.js";

describe("payThanks helpers", () => {
  it("parses success redirect params including balance", () => {
    const p = new URLSearchParams("ok=1&inv=251839&amt=652&bal=0&ref=ABC");
    expect(parsePayThanksParams(p)).toEqual({
      ok: true,
      inv: "251839",
      amt: "652",
      bal: 0,
      msg: "",
    });
  });

  it("parses partial balance remaining", () => {
    const p = new URLSearchParams("ok=1&inv=231315&amt=10000&bal=1000");
    expect(parsePayThanksParams(p)).toEqual({
      ok: true,
      inv: "231315",
      amt: "10000",
      bal: 1000,
      msg: "",
    });
  });

  it("formats balance now from job data", () => {
    expect(fmtBalanceNow(0)).toBe("Paid in full");
    expect(fmtBalanceNow(1050.5)).toBe("$1,050.50");
    expect(fmtBalanceNow(null)).toBe("");
  });
});