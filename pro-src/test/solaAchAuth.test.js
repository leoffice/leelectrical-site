import { describe, expect, it } from "vitest";
import {
  ACH_AUTH_LETTER,
  isValidAbaRouting,
  validateAchBankFields,
} from "../src/lib/solaCharge.js";

describe("Sola ACH staff path helpers", () => {
  it("exports authorization letter language for Process UI", () => {
    expect(ACH_AUTH_LETTER.title).toMatch(/authorization/i);
    expect(ACH_AUTH_LETTER.body.length).toBeGreaterThan(40);
    expect(ACH_AUTH_LETTER.checkboxLabel).toMatch(/authoriz/i);
  });

  it("ABA routing checksum accepts known-good and rejects bad", () => {
    // 021000021 = JPMorgan Chase (classic valid ABA)
    expect(isValidAbaRouting("021000021")).toBe(true);
    expect(isValidAbaRouting("021000022")).toBe(false);
    expect(isValidAbaRouting("123")).toBe(false);
  });

  it("validateAchBankFields requires name, account, and valid routing", () => {
    expect(validateAchBankFields({ routing: "021000021", account: "12345678", name: "Test" }).ok).toBe(true);
    expect(validateAchBankFields({ routing: "021000022", account: "12345678", name: "Test" }).ok).toBe(false);
    expect(validateAchBankFields({ routing: "021000021", account: "12", name: "Test" }).ok).toBe(false);
    expect(validateAchBankFields({ routing: "021000021", account: "12345678", name: "" }).ok).toBe(false);
  });
});
