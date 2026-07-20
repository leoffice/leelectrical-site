// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkForAppUpdate, makeForegroundUpdateHandler } from "../src/lib/appUpdate.js";

describe("appUpdate", () => {
  const reload = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("location", {
      hostname: "www.leelectrical.us",
      pathname: "/app/pro/",
      reload,
    });
    localStorage.clear();
    reload.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores live sha on first open without reloading", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ gitShaShort: "abc1234" }),
    });

    await checkForAppUpdate();

    expect(localStorage.getItem("le-pro-live-sha")).toBe("abc1234");
    expect(reload).not.toHaveBeenCalled();
  });

  it("clears caches and reloads when live sha changes", async () => {
    localStorage.setItem("le-pro-live-sha", "old1111");
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ gitShaShort: "new2222" }),
    });

    await checkForAppUpdate();

    expect(localStorage.getItem("le-pro-live-sha")).toBe("new2222");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload-loop when sha keeps changing within the guard window", async () => {
    localStorage.setItem("le-pro-live-sha", "old1111");
    sessionStorage.setItem("le-pro-update-reload-ts", String(Date.now()));
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ gitShaShort: "new2222" }),
    });

    await checkForAppUpdate();

    expect(localStorage.getItem("le-pro-live-sha")).toBe("new2222");
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("makeForegroundUpdateHandler (long-open PWA re-check)", () => {
  const setHidden = (v) => Object.defineProperty(document, "hidden", { value: v, configurable: true });
  afterEach(() => setHidden(false));

  it("re-checks for a new deploy when the app is refocused and visible", () => {
    setHidden(false);
    const check = vi.fn();
    const handler = makeForegroundUpdateHandler(() => 1_000_000, check);
    handler();
    expect(check).toHaveBeenCalledTimes(1); // a long-open PWA now notices the deploy
  });

  it("does not check while the app is hidden (background)", () => {
    setHidden(true);
    const check = vi.fn();
    const handler = makeForegroundUpdateHandler(() => 2_000_000, check);
    handler();
    expect(check).not.toHaveBeenCalled();
  });

  it("throttles rapid refocus, then checks again after the window passes", () => {
    setHidden(false);
    const check = vi.fn();
    let t = 5_000_000;
    const handler = makeForegroundUpdateHandler(() => t, check);
    handler();                 // t=5_000_000 → checks (1)
    handler();                 // same instant → throttled
    t = 5_030_000;             // +30s, still inside 60s window
    handler();                 // throttled
    t = 5_070_000;             // +70s from first → past window
    handler();                 // checks (2)
    expect(check).toHaveBeenCalledTimes(2);
  });
});