// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ASSISTANT_SPEAK_KEY,
  ASSISTANT_VOICE_KEY,
  CHAT_PANEL_SIZE_KEY,
  COMPANY_LOGO_KEY,
  SPEECH_TO_TEXT_KEY,
  clearCompanyLogo,
  getAssistantVoiceId,
  getChatPanelSize,
  getCompanyLogoDataUrl,
  getCompanyLogoSrc,
  isAssistantSpeakEnabled,
  isSpeechToTextEnabled,
  readAppSettings,
  setAssistantSpeakEnabled,
  setAssistantVoiceId,
  setChatPanelSize,
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

describe("appSettings — chat panel size + assistant voice", () => {
  it("defaults chat panel to normal", () => {
    expect(getChatPanelSize()).toBe("normal");
    expect(readAppSettings().chatPanelSize).toBe("normal");
  });

  it("stores expanded and normal sizes", () => {
    setChatPanelSize("expanded");
    expect(localStorage.getItem(CHAT_PANEL_SIZE_KEY)).toBe("expanded");
    expect(getChatPanelSize()).toBe("expanded");
    setChatPanelSize("normal");
    expect(getChatPanelSize()).toBe("normal");
  });

  it("defaults speak replies off and voice auto", () => {
    expect(isAssistantSpeakEnabled()).toBe(false);
    expect(getAssistantVoiceId()).toBe("auto");
    expect(readAppSettings().assistantSpeak).toBe(false);
    expect(readAppSettings().assistantVoice).toBe("auto");
  });

  it("stores speak toggle and voice preset", () => {
    setAssistantSpeakEnabled(true);
    expect(localStorage.getItem(ASSISTANT_SPEAK_KEY)).toBe("1");
    expect(isAssistantSpeakEnabled()).toBe(true);
    setAssistantVoiceId("clear-female");
    expect(localStorage.getItem(ASSISTANT_VOICE_KEY)).toBe("clear-female");
    expect(getAssistantVoiceId()).toBe("clear-female");
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
