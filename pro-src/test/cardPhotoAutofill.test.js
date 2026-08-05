import { describe, expect, it } from "vitest";
import {
  cardPhotoAutofillPatch,
  hasUsefulCardAutofill,
  isValidCardLuhn,
  maskCardPan,
  normalizeCardExp,
} from "../src/lib/cardPhotoAutofill.js";
import { scoreCheckFrame } from "../src/components/CheckPhotoCapture.jsx";

describe("cardPhotoAutofill", () => {
  it("validates Luhn and masks PAN", () => {
    expect(isValidCardLuhn("4111111111111111")).toBe(true);
    expect(isValidCardLuhn("4111111111111112")).toBe(false);
    expect(maskCardPan("4111111111111111")).toMatch(/1111$/);
  });

  it("normalizes expiry formats", () => {
    expect(normalizeCardExp("08/28")).toBe("08/28");
    expect(normalizeCardExp("8/2028")).toBe("08/28");
    expect(normalizeCardExp("0828")).toBe("08/28");
  });

  it("builds assist patch without inventing weak PANs as full pan", () => {
    const patch = cardPhotoAutofillPatch({
      cardNumber: "4111111111111111",
      exp: "12/29",
      name: "LEVI TEST",
      brand: "visa",
    });
    expect(patch.pan).toBe("4111111111111111");
    expect(patch.last4).toBe("1111");
    expect(patch.exp).toBe("12/29");
    expect(patch.name).toBe("LEVI TEST");
    expect(hasUsefulCardAutofill(patch)).toBe(true);
  });

  it("still passes full-length PAN when Luhn fails (iframe fill; gateway validates)", () => {
    const patch = cardPhotoAutofillPatch({ cardNumber: "1234567890123456", last4: "3456" });
    expect(patch.pan).toBe("1234567890123456");
    expect(patch.last4).toBe("3456");
    expect(patch.masked).toBeUndefined();
  });

  it("exp + last4 without stars chrome (fill fields only)", () => {
    const patch = cardPhotoAutofillPatch({ last4: "4242", exp: "08/28" });
    expect(patch.last4).toBe("4242");
    expect(patch.masked).toBeUndefined();
    expect(patch.exp).toBe("08/28");
    expect(hasUsefulCardAutofill(patch)).toBe(true);
  });

  it("short PAN fragments → last4 only, no invent full pan", () => {
    expect(maskCardPan("1111")).toBe("••••••••••••1111");
    const patch = cardPhotoAutofillPatch({ cardNumber: "4111" });
    expect(patch.last4).toBe("4111");
    expect(patch.pan).toBeUndefined();
    expect(patch.masked).toBeUndefined();
  });

  it("passes CVV when vision returns it", () => {
    const patch = cardPhotoAutofillPatch({
      cardNumber: "4111111111111111",
      exp: "08/28",
      cvv: "123",
    });
    expect(patch.cvv).toBe("123");
  });
});

describe("scoreCheckFrame", () => {
  function mockCtx(pixels /* Uint8ClampedArray-like RGBA */) {
    const w = 80;
    const h = 50;
    return {
      getImageData: () => ({ data: pixels, width: w, height: h }),
    };
  }

  it("scores uniform bright wash low", () => {
    const data = new Uint8ClampedArray(80 * 50 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
    expect(scoreCheckFrame(mockCtx(data), 80, 50)).toBeLessThan(0.2);
  });

  it("scores high-contrast ink higher than wash", () => {
    const data = new Uint8ClampedArray(80 * 50 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 240;
      data[i + 1] = 240;
      data[i + 2] = 235;
      data[i + 3] = 255;
    }
    // dark horizontal lines for edges/ink
    for (let y = 10; y < 40; y += 4) {
      for (let x = 0; x < 80; x += 1) {
        const i = (y * 80 + x) * 4;
        data[i] = 20;
        data[i + 1] = 20;
        data[i + 2] = 20;
      }
    }
    expect(scoreCheckFrame(mockCtx(data), 80, 50)).toBeGreaterThan(0.25);
  });
});
