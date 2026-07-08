import { describe, expect, it } from "vitest";
import { docConfirmMessage, parseDocCommandResult } from "../src/lib/docConfirm.js";

describe("docConfirm helpers", () => {
  it("parseDocCommandResult handles JSON and estimate", () => {
    expect(parseDocCommandResult('{"estimateNo":"E-12","total":500}', "estimate").estimateNo).toBe("E-12");
  });
  it("docConfirmMessage", () => {
    expect(docConfirmMessage({ kind: "estimate", no: "100", amount: "$500", customer: "AC" })).toMatch(
      /Estimate #100.*AC.*QuickBooks/
    );
  });
});