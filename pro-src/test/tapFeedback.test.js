// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { hapticTap, flashEl, installGlobalTapFeedback } from "../src/lib/tapFeedback.js";

describe("tapFeedback", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.__leTapFeedbackInstalled = false;
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("calls vibrate when available", () => {
    const vibrate = vi.fn();
    navigator.vibrate = vibrate;
    hapticTap(12);
    expect(vibrate).toHaveBeenCalledWith(12);
  });

  it("adds and clears le-press-flash", () => {
    vi.useFakeTimers();
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    flashEl(btn);
    expect(btn.classList.contains("le-press-flash")).toBe(true);
    vi.advanceTimersByTime(200);
    expect(btn.classList.contains("le-press-flash")).toBe(false);
    vi.useRealTimers();
  });

  it("installs once and flashes on pointerdown", () => {
    const vibrate = vi.fn();
    navigator.vibrate = vibrate;
    const btn = document.createElement("button");
    btn.textContent = "Go";
    document.body.appendChild(btn);
    installGlobalTapFeedback();
    installGlobalTapFeedback(); // idempotent
    btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    expect(btn.classList.contains("le-press-flash")).toBe(true);
    expect(vibrate).toHaveBeenCalled();
  });
});
