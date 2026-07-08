import { describe, expect, it } from "vitest";
import {
  docConfirmMessage,
  parseDocCommandResult,
  shouldShowDocConfirm,
} from "../src/lib/docConfirm.js";

describe("docConfirm helpers", () => {
  it("parseDocCommandResult handles JSON and estimate", () => {
    expect(parseDocCommandResult('{"estimateNo":"E-12","total":500}', "estimate").estimateNo).toBe("E-12");
  });
  it("shouldShowDocConfirm only once per command / confirmed job", () => {
    const seen = new Set(["cmd-old"]);
    expect(shouldShowDocConfirm({ commandId: "cmd-old", kind: "estimate", no: "25478", job: {} }, seen)).toBe(
      false
    );
    expect(
      shouldShowDocConfirm(
        { commandId: "cmd-new", kind: "estimate", no: "25478", job: { estimateNo: "25478", _estimateConfirmed: true } },
        seen
      )
    ).toBe(false);
    expect(shouldShowDocConfirm({ commandId: "cmd-new", kind: "estimate", no: "25478", job: {} }, seen)).toBe(true);
  });

  it("docConfirmMessage", () => {
    expect(docConfirmMessage({ kind: "estimate", no: "100", amount: "$500", customer: "AC" })).toMatch(
      /Estimate #100.*AC.*QuickBooks/
    );
  });
});