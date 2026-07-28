import { describe, expect, it, vi } from "vitest";
import {
  canvasLooksBlank,
  compressImageForVision,
  normalizeImageBase64,
  normalizeVisionMime,
} from "../src/lib/paymentVision.js";
import { normalizeVisionImageInput } from "../../netlify/functions/lib/paymentVision.mjs";

describe("normalizeImageBase64 (client)", () => {
  it("strips data URL prefix", () => {
    expect(normalizeImageBase64("data:image/jpeg;base64,abc123")).toBe("abc123");
  });

  it("strips whitespace and newlines", () => {
    expect(normalizeImageBase64("ab\nc d\r\n")).toBe("abcd");
  });

  it("leaves pure base64 alone", () => {
    expect(normalizeImageBase64("/9j/4AAQ")).toBe("/9j/4AAQ");
  });
});

describe("normalizeVisionMime (client)", () => {
  it("maps image/jpg to image/jpeg", () => {
    expect(normalizeVisionMime("image/jpg")).toBe("image/jpeg");
  });

  it("defaults empty and octet-stream", () => {
    expect(normalizeVisionMime("")).toBe("image/jpeg");
    expect(normalizeVisionMime("application/octet-stream")).toBe("image/jpeg");
  });
});

describe("normalizeVisionImageInput (server)", () => {
  it("strips data URL so xAI is not double-prefixed", () => {
    const n = normalizeVisionImageInput("data:image/jpeg;base64,/9j/4AAQ", "image/png");
    expect(n.imageBase64).toBe("/9j/4AAQ");
    expect(n.mime).toBe("image/jpeg");
  });

  it("maps image/jpg and strips whitespace", () => {
    const n = normalizeVisionImageInput("ab cd\n", "image/jpg");
    expect(n.imageBase64).toBe("abcd");
    expect(n.mime).toBe("image/jpeg");
  });

  it("does not double-wrap pure base64", () => {
    const n = normalizeVisionImageInput("/9j/4AAQ", "image/jpeg");
    expect(n.imageBase64).toBe("/9j/4AAQ");
    expect(n.mime).toBe("image/jpeg");
  });
});

describe("canvasLooksBlank", () => {
  it("flags uniform near-white canvas (washed check photo)", () => {
    const w = 40;
    const h = 30;
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 250;
      pixels[i + 1] = 250;
      pixels[i + 2] = 250;
      pixels[i + 3] = 255;
    }
    const ctx = {
      getImageData: () => ({ data: pixels }),
    };
    expect(canvasLooksBlank(ctx, w, h)).toBe(true);
  });

  it("allows a dark check with real content", () => {
    const w = 40;
    const h = 30;
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      // Mix of dark ink + paper
      const dark = (i / 4) % 3 === 0;
      pixels[i] = dark ? 20 : 230;
      pixels[i + 1] = dark ? 20 : 230;
      pixels[i + 2] = dark ? 20 : 230;
      pixels[i + 3] = 255;
    }
    const ctx = {
      getImageData: () => ({ data: pixels }),
    };
    expect(canvasLooksBlank(ctx, w, h)).toBe(false);
  });
});

describe("compressImageForVision — prefer original", () => {
  it("returns original for typical multi-MB check photos (no canvas)", async () => {
    // 2MB-ish fake JPEG — under 5.5MB skip-canvas threshold.
    const bytes = new Uint8Array(2_000_000);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    const file = {
      size: 2_000_000,
      type: "image/jpeg",
      name: "check.jpg",
    };
    // Stub FileReader so fileToBase64 works in node/vitest.
    const prev = globalThis.FileReader;
    globalThis.FileReader = class {
      onload = null;
      onerror = null;
      result = null;
      readAsDataURL() {
        this.result = "data:image/jpeg;base64," + "ABC".repeat(40);
        queueMicrotask(() => {
          if (typeof this.onload === "function") this.onload();
        });
      }
    };
    try {
      const out = await compressImageForVision(file);
      expect(out.usedCompress).toBe(false);
      expect(out.b64).toBeTruthy();
      expect(out.mime).toMatch(/jpeg/i);
    } finally {
      if (prev) globalThis.FileReader = prev;
      else delete globalThis.FileReader;
    }
  });
});
