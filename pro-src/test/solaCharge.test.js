import { describe, expect, it } from "vitest";
import {
  billingFromLanding,
  chargePreview,
  formatCardExpInput,
  normalizeAchAccount,
  normalizeAchRouting,
  normalizeCardExp,
  validateAchBankFields,
} from "../src/lib/solaCharge.js";

describe("solaCharge", () => {
  it("formatCardExpInput formats digits as MM/YY while typing", () => {
    expect(formatCardExpInput("")).toBe("");
    expect(formatCardExpInput("1")).toBe("1");
    expect(formatCardExpInput("12")).toBe("12");
    expect(formatCardExpInput("123")).toBe("12/3");
    expect(formatCardExpInput("12/28")).toBe("12/28");
    expect(formatCardExpInput("122820")).toBe("12/28");
  });

  it("normalizeCardExp accepts MM/YY and MMYY", () => {
    expect(normalizeCardExp("12/28")).toBe("1228");
    expect(normalizeCardExp("1228")).toBe("1228");
    expect(normalizeCardExp("")).toBe("");
  });

  it("billingFromLanding parses customer pay payload", () => {
    const bill = billingFromLanding({
      c: "Rae Klein",
      e: "rae@x.com",
      ph: "555-9",
      ba: "55 Elm St, Brooklyn, NY 11201",
      z: "11201",
    });
    expect(bill.name).toBe("Rae Klein");
    expect(bill.email).toBe("rae@x.com");
    expect(bill.zip).toBe("11201");
    expect(bill.street).toContain("Elm");
  });

  it("chargePreview adds 3.5% fee when enabled", () => {
    const withFee = chargePreview(1000, true);
    expect(withFee.principal).toBe(1000);
    expect(withFee.charge).toBe(1035);
    const noFee = chargePreview(1000, false);
    expect(noFee.charge).toBe(1000);
  });

  it("normalizes ACH routing and account digits", () => {
    expect(normalizeAchRouting("021-000021")).toBe("021000021");
    expect(normalizeAchRouting("123")).toBe("123");
    expect(normalizeAchAccount("12 3456 7890")).toBe("1234567890");
  });

  it("validateAchBankFields requires 9-digit routing, account, and name", () => {
    expect(validateAchBankFields({ routing: "021000021", account: "123456", name: "Acme LLC" }).ok).toBe(
      true
    );
    expect(validateAchBankFields({ routing: "123", account: "123456", name: "Acme" }).ok).toBe(false);
    expect(validateAchBankFields({ routing: "021000021", account: "12", name: "Acme" }).error).toMatch(
      /Account/
    );
    expect(validateAchBankFields({ routing: "021000021", account: "123456", name: "" }).error).toMatch(
      /name/i
    );
  });
});