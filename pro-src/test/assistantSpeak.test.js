// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pickVoiceForPreset,
  plainTextForSpeech,
  speakAssistantText,
  stopAssistantSpeech,
} from "../src/lib/assistantSpeak.js";
import { setAssistantSpeakEnabled, setAssistantVoiceId } from "../src/lib/appSettings.js";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("assistantSpeak — plain text", () => {
  it("strips button blocks and bold chrome", () => {
    const raw =
      "**✅ DONE**\n\nPayment staged.\n\n---BUTTONS---\nRecord payment | pay\nCancel | cancel";
    expect(plainTextForSpeech(raw)).toBe("✅ DONE Payment staged.");
  });
});

describe("assistantSpeak — voice pick", () => {
  it("prefers english and preset hints", () => {
    const voices = [
      { name: "Daniel", lang: "en-GB", voiceURI: "daniel" },
      { name: "Samantha", lang: "en-US", voiceURI: "sam" },
      { name: "French", lang: "fr-FR", voiceURI: "fr" },
    ];
    expect(pickVoiceForPreset("clear-male", voices).name).toBe("Daniel");
    expect(pickVoiceForPreset("clear-female", voices).name).toBe("Samantha");
    expect(pickVoiceForPreset("auto", voices).lang).toMatch(/^en/);
  });
});

describe("assistantSpeak — speak gate", () => {
  it("no-ops when speak is off", () => {
    setAssistantSpeakEnabled(false);
    const speak = vi.fn();
    globalThis.speechSynthesis = { speak, cancel: vi.fn(), getVoices: () => [] };
    globalThis.SpeechSynthesisUtterance = function (t) {
      this.text = t;
    };
    expect(speakAssistantText("hello")).toBe(false);
    expect(speak).not.toHaveBeenCalled();
  });

  it("speaks when enabled", () => {
    setAssistantSpeakEnabled(true);
    setAssistantVoiceId("auto");
    const speak = vi.fn();
    const cancel = vi.fn();
    globalThis.speechSynthesis = { speak, cancel, getVoices: () => [] };
    globalThis.SpeechSynthesisUtterance = function (t) {
      this.text = t;
    };
    expect(speakAssistantText("Hello from Israel")).toBe(true);
    expect(cancel).toHaveBeenCalled();
    expect(speak).toHaveBeenCalled();
    stopAssistantSpeech();
    expect(cancel).toHaveBeenCalledTimes(2);
  });
});
