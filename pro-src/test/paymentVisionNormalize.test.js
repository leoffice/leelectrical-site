import { describe, expect, it } from "vitest";
import { normalizeImageBase64, normalizeVisionMime } from "../src/lib/paymentVision.js";
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
