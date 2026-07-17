// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMPANY_LOGO_KEY,
  SPEECH_TO_TEXT_KEY,
  clearCompanyLogo,
  getCompanyLogoDataUrl,
  getCompanyLogoSrc,
  isSpeechToTextEnabled,
  readAppSettings,
  setCompanyLogoDataUrl,
  setSpeechToTextEnabled,
} from "../src/lib/appSettings.js";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("appSettings — speech to text", () => {
  it("defaults to enabled", () => {
    expect(isSpeechToTextEnabled()).toBe(true);
    expect(readAppSettings().speechToText).toBe(true);
  });

  it("can turn speech off and on", () => {
    setSpeechToTextEnabled(false);
    expect(localStorage.getItem(SPEECH_TO_TEXT_KEY)).toBe("0");
    expect(isSpeechToTextEnabled()).toBe(false);
    setSpeechToTextEnabled(true);
    expect(isSpeechToTextEnabled()).toBe(true);
  });
});

describe("appSettings — company logo", () => {
  it("defaults to built-in logo file", () => {
    expect(getCompanyLogoDataUrl()).toBe("");
    expect(readAppSettings().logoCustom).toBe(false);
    expect(getCompanyLogoSrc()).toMatch(/le-logo\.png/);
  });

  it("stores and clears a custom logo data URL", () => {
    const data = "data:image/png;base64,abc";
    setCompanyLogoDataUrl(data);
    expect(localStorage.getItem(COMPANY_LOGO_KEY)).toBe(data);
    expect(getCompanyLogoSrc()).toBe(data);
    expect(readAppSettings().logoCustom).toBe(true);
    clearCompanyLogo();
    expect(getCompanyLogoDataUrl()).toBe("");
    expect(getCompanyLogoSrc()).toMatch(/le-logo\.png/);
  });
});
