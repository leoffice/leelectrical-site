import { describe, it, expect } from "vitest";
import { amountToWords, buildCheckPdf, BLZ_CHECK } from "../src/lib/checkPrintPdf.js";
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

  it("prints payee, factual bank line, and auto-spelled amount", () => {
    expect(text).toContain("Acme Supply LLC");
    expect(text).toContain("JPMorgan Chase Bank, N.A.");
    expect(text).toContain("Three hundred ninety-seven and 50/100");
    expect(text).toContain("397.50");
  });

  it("labels the signature line and embeds Levi's signature by default", () => {
    expect(text).toContain("AUTHORIZED SIGNATURE");
    // Default is auto-signed: JPEG signature XObject is present.
    expect(text.includes("/Subtype /Image")).toBe(true);
    expect(text.includes("/XObject")).toBe(true);
    expect(text.includes("/DCTDecode")).toBe(true);
  });

  it("can still print with a blank signature line when signed:false", () => {
    const blank = bytesToLatin1(
      buildCheckPdf({
        payee: "Acme Supply LLC",
        amount: 10,
        date: "08/14/2026",
        checkNo: "1002",
        signed: false,
      })
    );
    expect(blank).toContain("AUTHORIZED SIGNATURE");
    expect(blank.includes("/Subtype /Image")).toBe(false);
  });

  it("does NOT reproduce a Chase logo/wordmark", () => {
    // Only the factual legal bank name may appear — no 'CHASE' wordmark.
    expect(text.includes("CHASE")).toBe(false);
  });

  it("uses BLZ's own account details", () => {
    expect(BLZ_CHECK.routing).toBe("021000021");
    expect(BLZ_CHECK.account).toBe("606031220");
  });
});
