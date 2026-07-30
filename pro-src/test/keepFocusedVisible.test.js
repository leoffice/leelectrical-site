// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installKeepFocusedVisible,
  __isTextField,
  __ensureVisible,
  __resetKeepFocusedVisible,
} from "../src/lib/keepFocusedVisible.js";

afterEach(() => {
  __resetKeepFocusedVisible();
  document.body.innerHTML = "";
  document.documentElement.style.removeProperty("--vv-height");
  document.documentElement.style.removeProperty("--kb-inset");
  vi.restoreAllMocks();
});

beforeEach(() => {
  __resetKeepFocusedVisible();
});

describe("keepFocusedVisible", () => {
  it("recognizes email/text fields and ignores buttons/checkboxes", () => {
    const email = document.createElement("input");
    email.type = "email";
    const text = document.createElement("input");
    text.type = "text";
    const ta = document.createElement("textarea");
    const btn = document.createElement("input");
    btn.type = "button";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    expect(__isTextField(email)).toBe(true);
    expect(__isTextField(text)).toBe(true);
    expect(__isTextField(ta)).toBe(true);
    expect(__isTextField(btn)).toBe(false);
    expect(__isTextField(cb)).toBe(false);
  });

  it("install sets viewport CSS vars without throwing", () => {
    const uninstall = installKeepFocusedVisible();
    expect(document.documentElement.style.getPropertyValue("--vv-height")).toMatch(/px$/);
    expect(document.documentElement.style.getPropertyValue("--kb-inset")).toMatch(/px$/);
    uninstall();
  });

  it("ensureVisible calls scrollIntoView on the field (instant, not smooth)", () => {
    const input = document.createElement("input");
    input.type = "email";
    document.body.appendChild(input);
    const spy = vi.fn();
    input.scrollIntoView = spy;
    __ensureVisible(input);
    expect(spy).toHaveBeenCalled();
    const arg = spy.mock.calls[0][0];
    if (arg && typeof arg === "object") {
      expect(arg.behavior).toBe("auto");
    }
  });

  it("focusin on email field schedules keep-visible without lag (auto behavior)", () => {
    installKeepFocusedVisible();
    const input = document.createElement("input");
    input.type = "email";
    input.setAttribute("data-testid", "send-confirm-email");
    document.body.appendChild(input);
    const spy = vi.fn();
    input.scrollIntoView = spy;
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(spy).toHaveBeenCalled();
  });
});
