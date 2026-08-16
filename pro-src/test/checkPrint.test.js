import { describe, it, expect } from "vitest";
import {
  amountToWords,
  buildCheckPdf,
  BLZ_CHECK,
  normalizeCheckDate,
  todayCheckDate,
} from "../src/lib/checkPrintPdf.js";
import { micrLine, GLYPHS, ADVANCE, BODY_HEIGHT } from "../src/lib/e13bGlyphs.js";

const bytesToLatin1 = (u8) => {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return s;
};

describe("amountToWords", () => {
  it("spells the briefed example exactly", () => {
    expect(amountToWords(397.5)).toBe("Three hundred ninety-seven and 50/100");
  });
  it("handles whole dollars, zero cents, hundreds and thousands", () => {
    expect(amountToWords(1000)).toBe("One thousand and 00/100");
    expect(amountToWords(0)).toBe("Zero and 00/100");
    expect(amountToWords(1250.05)).toBe("One thousand two hundred fifty and 05/100");
    expect(amountToWords(21)).toBe("Twenty-one and 00/100");
    expect(amountToWords(15)).toBe("Fifteen and 00/100");
  });
  it("rounds to cents", () => {
    expect(amountToWords(99.999)).toBe("One hundred and 00/100");
  });
});

describe("E-13B MICR", () => {
  it("has all 14 glyphs on the standard grid", () => {
    for (const ch of "0123456789TAOD") expect(Array.isArray(GLYPHS[ch])).toBe(true);
    expect(ADVANCE).toBe(130);
    expect(BODY_HEIGHT).toBe(91);
  });
  it("builds the standard commercial MICR string (on-us/transit/account)", () => {
    expect(micrLine("021000021", "606031220", "1001")).toBe("O1001O T021000021T 606031220O");
  });
  it("MICR strips non-digits so saved accounts with dashes/spaces still print", () => {
    expect(micrLine("021-000021", "606 031 220", "1,001")).toBe("O1001O T021000021T 606031220O");
  });
});

describe("buildCheckPdf", () => {
  const pdf = buildCheckPdf({
    payee: "Acme Supply LLC",
    amount: 397.5,
    date: "08/14/2026",
    checkNo: "1001",
    memo: "Invoice 1234",
  });
  const text = bytesToLatin1(pdf);

  it("returns a single-page PDF byte array", () => {
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(800);
    expect(text.startsWith("%PDF-1.")).toBe(true);
    expect(text.includes("%%EOF")).toBe(true);
    expect(text.includes("/Count 1")).toBe(true);
  });

  it("prints payee, factual bank line, current address, and auto-spelled amount", () => {
    expect(text).toContain("Acme Supply LLC");
    expect(text).toContain("JPMorgan Chase Bank, N.A.");
    expect(text).toContain("1243 E 15th Street");
    expect(text).toContain("Brooklyn, NY 11230");
    expect(text).not.toContain("383 Kingston");
    expect(text).toContain("Three hundred ninety-seven and 50/100");
    expect(text).toContain("397.50");
  });

  it("labels the signature line and embeds Levi's signature by default", () => {
    expect(text).toContain("AUTHORIZED SIGNATURE");
    expect(text.includes("/Subtype /Image")).toBe(true);
    expect(text.includes("/DCTDecode")).toBe(true);
  });

  it("can print unsigned when signed:false", () => {
    const blank = bytesToLatin1(
      buildCheckPdf({ payee: "X", amount: 1, date: "08/14/2026", signed: false })
    );
    expect(blank).toContain("AUTHORIZED SIGNATURE");
    expect(blank.includes("/Subtype /Image")).toBe(false);
  });

  it("normalizes digit-only and empty dates", () => {
    expect(normalizeCheckDate("08142026")).toBe("08/14/2026");
    expect(normalizeCheckDate("081426")).toBe("08/14/2026");
    expect(normalizeCheckDate("8/14/26")).toBe("08/14/2026");
    const fixed = new Date(2026, 7, 14); // Aug 14 2026 local
    expect(normalizeCheckDate("", fixed)).toBe("08/14/2026");
    expect(todayCheckDate(fixed)).toBe("08/14/2026");
    const pdf = bytesToLatin1(buildCheckPdf({ payee: "Y", amount: 10, date: "08142026" }));
    expect(pdf).toContain("08/14/2026");
  });

  it("does NOT reproduce a Chase logo/wordmark", () => {
    // Only the factual legal bank name may appear — no 'CHASE' wordmark.
    expect(text.includes("CHASE")).toBe(false);
  });

  it("embeds the GPL GnuMICR E-13B TrueType font for the MICR line", () => {
    expect(text.includes("FontFile2")).toBe(true); // real font program embedded
    expect(text.includes("GnuMICR")).toBe(true);
    expect(text.includes("/F3 ")).toBe(true); // MICR line drawn in the MICR font
    // MICR string mapped to the font's symbol keys (A=transit, B=on-us):
    expect(text).toContain("(B1001B A021000021A 606031220B)");
  });

  it("uses BLZ's own account details with the current address", () => {
    expect(BLZ_CHECK.routing).toBe("021000021");
    expect(BLZ_CHECK.account).toBe("606031220");
    expect(BLZ_CHECK.addr1).toBe("1243 E 15th Street");
    expect(BLZ_CHECK.addr2).toBe("Brooklyn, NY 11230");
  });
});

describe("buildCheckPdf — multi-account (config override)", () => {
  const acct = {
    name: "Second Co LLC",
    addr1: "1 Test Ave",
    addr2: "Queens, NY 11000",
    phone: "(555) 000-0000",
    bank: "Wells Fargo Bank, N.A.",
    account: "123456789",
    routing: "021000021",
    fractional: "2-34/567",
    startCheckNo: "500",
  };
  const text = bytesToLatin1(buildCheckPdf({ payee: "Vendor Inc", amount: 12.34, config: acct }));

  it("draws the chosen account's name, bank, and address", () => {
    expect(text).toContain("Second Co LLC");
    expect(text).toContain("Wells Fargo Bank, N.A.");
    expect(text).toContain("1 Test Ave");
    expect(text).not.toContain("BLZ Electric");
    expect(text).not.toContain("JPMorgan Chase");
  });

  it("uses the account's starting check number when none is given", () => {
    // MICR check-number field is On-Us[ 500 ]On-Us via micrLine
    expect(micrLine(acct.routing, acct.account, "500")).toBe("O500O T021000021T 123456789O");
  });
});
