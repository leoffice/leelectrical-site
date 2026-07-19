// Global open-sheet registry — the mutex that stops auto-prompts stacking.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetSheetRegistry,
  anySheetOpen,
  isScreenCovered,
  openSheetCount,
  registerSheet,
  subscribeSheets,
} from "../src/lib/sheetRegistry.js";

afterEach(() => __resetSheetRegistry());

describe("sheetRegistry", () => {
  it("counts open sheets and clears when they unregister", () => {
    expect(anySheetOpen()).toBe(false);
    const a = registerSheet();
    expect(openSheetCount()).toBe(1);
    const b = registerSheet();
    expect(openSheetCount()).toBe(2);
    expect(anySheetOpen()).toBe(true);
    a();
    b();
    expect(openSheetCount()).toBe(0);
    expect(anySheetOpen()).toBe(false);
  });

  it("unregister is idempotent (StrictMode double-invoke must not go negative)", () => {
    const release = registerSheet();
    release();
    release();
    release();
    expect(openSheetCount()).toBe(0);
  });

  it("notifies subscribers on open and close", () => {
    const seen = [];
    const stop = subscribeSheets((n) => seen.push(n));
    const release = registerSheet();
    release();
    stop();
    expect(seen).toEqual([1, 0]);
  });

  it("stops notifying after unsubscribe", () => {
    const seen = [];
    const stop = subscribeSheets((n) => seen.push(n));
    stop();
    registerSheet()();
    expect(seen).toEqual([]);
  });

  it("a throwing subscriber does not stop the others", () => {
    const good = vi.fn();
    subscribeSheets(() => {
      throw new Error("bad listener");
    });
    subscribeSheets(good);
    registerSheet();
    expect(good).toHaveBeenCalledWith(1);
  });

  it("isScreenCovered follows the registry", () => {
    expect(isScreenCovered()).toBe(false);
    const release = registerSheet();
    expect(isScreenCovered()).toBe(true);
    release();
    expect(isScreenCovered()).toBe(false);
  });
});
