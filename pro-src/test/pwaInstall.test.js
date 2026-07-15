// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissInstallPrompt,
  dismissShortcutWarn,
  isAndroid,
  isBrowserTab,
  isIosSafari,
  isStandalone,
  shouldOfferInstall,
  shouldWarnShortcut,
  wasInstallDismissed,
  wasShortcutWarnDismissed,
} from "../src/lib/pwaInstall.js";

describe("pwaInstall", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
      standalone: false,
    });
    vi.stubGlobal("matchMedia", (q) => ({
      matches: q.includes("standalone") ? false : false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("detects iOS Safari", () => {
    expect(isIosSafari()).toBe(true);
    expect(isAndroid()).toBe(false);
  });

  it("offers install on iOS when not standalone and not dismissed", () => {
    expect(shouldOfferInstall()).toBe(true);
  });

  it("hides when already standalone", () => {
    vi.stubGlobal("matchMedia", (q) => ({
      matches: q.includes("standalone"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    expect(isStandalone()).toBe(true);
    expect(shouldOfferInstall()).toBe(false);
  });

  it("hides after dismiss", () => {
    dismissInstallPrompt();
    expect(wasInstallDismissed()).toBe(true);
    expect(shouldOfferInstall()).toBe(false);
  });

  it("detects Android", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36",
      platform: "Linux armv8l",
      maxTouchPoints: 5,
      standalone: false,
    });
    expect(isAndroid()).toBe(true);
    expect(isIosSafari()).toBe(false);
    expect(shouldOfferInstall()).toBe(true);
  });

  it("detects browser-tab shortcut mode on Android", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36",
      platform: "Linux armv8l",
      maxTouchPoints: 5,
      standalone: false,
    });
    vi.stubGlobal("matchMedia", (q) => ({
      matches: q.includes("browser"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    expect(isBrowserTab()).toBe(true);
    expect(shouldWarnShortcut()).toBe(true);
  });

  it("hides shortcut warning after dismiss", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36",
      platform: "Linux armv8l",
      maxTouchPoints: 5,
      standalone: false,
    });
    vi.stubGlobal("matchMedia", (q) => ({
      matches: q.includes("browser"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    dismissShortcutWarn();
    expect(wasShortcutWarnDismissed()).toBe(true);
    expect(shouldWarnShortcut()).toBe(false);
  });
});