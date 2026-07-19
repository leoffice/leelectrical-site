// @vitest-environment jsdom
// Regression: the page behind an open sheet must not scroll, and must be back
// exactly where the user left it when the sheet closes — otherwise rows shift
// under the cursor and taps land on the wrong control.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Sheet from "../src/components/Sheet.jsx";
import {
  __resetScrollLock,
  lockBodyScroll,
  lockedScrollY,
  scrollLockDepth,
} from "../src/lib/scrollLock.js";
import { __resetSheetRegistry } from "../src/lib/sheetRegistry.js";

afterEach(() => {
  __resetScrollLock();
  __resetSheetRegistry();
  vi.restoreAllMocks();
  window.scrollY = 0;
});

describe("scrollLock", () => {
  it("freezes body scroll and restores the previous overflow", () => {
    document.body.style.overflow = "auto";
    const release = lockBodyScroll();
    expect(document.body.style.overflow).toBe("hidden");
    release();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("refcounts nested sheets — unlocks only when the last one closes", () => {
    const a = lockBodyScroll();
    const b = lockBodyScroll();
    expect(scrollLockDepth()).toBe(2);
    a();
    expect(document.body.style.overflow).toBe("hidden"); // still one open
    b();
    expect(scrollLockDepth()).toBe(0);
    expect(document.body.style.overflow).toBe("");
  });

  it("release is idempotent and never drives the depth negative", () => {
    const release = lockBodyScroll();
    release();
    release();
    release();
    expect(scrollLockDepth()).toBe(0);
  });

  it("remembers the scroll position at lock time", () => {
    window.scrollY = 420;
    const release = lockBodyScroll();
    expect(lockedScrollY()).toBe(420);
    release();
  });

  it("restores the scroll position if the page drifted while locked", () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo;
    window.scrollY = 300;
    const release = lockBodyScroll();
    window.scrollY = 0; // page drifted behind the sheet
    release();
    expect(scrollTo).toHaveBeenCalledWith(0, 300);
  });

  it("does not call scrollTo when the position never moved", () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo;
    window.scrollY = 150;
    const release = lockBodyScroll();
    release();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe("Sheet locks the page behind it", () => {
  it("locks on mount and releases on unmount", async () => {
    expect(scrollLockDepth()).toBe(0);
    const { unmount } = render(
      <Sheet title="Test" onClose={() => {}}>
        <div>body</div>
      </Sheet>
    );
    await waitFor(() => expect(scrollLockDepth()).toBe(1));
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    await waitFor(() => expect(scrollLockDepth()).toBe(0));
    expect(document.body.style.overflow).toBe("");
  });

  it("two stacked sheets still unlock exactly once", async () => {
    const { unmount } = render(
      <>
        <Sheet title="A" onClose={() => {}}>
          <div>a</div>
        </Sheet>
        <Sheet title="B" onClose={() => {}}>
          <div>b</div>
        </Sheet>
      </>
    );
    await waitFor(() => expect(scrollLockDepth()).toBe(2));
    unmount();
    await waitFor(() => expect(scrollLockDepth()).toBe(0));
    expect(document.body.style.overflow).toBe("");
  });
});
