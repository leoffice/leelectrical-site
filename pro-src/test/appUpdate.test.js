// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkForAppUpdate } from "../src/lib/appUpdate.js";

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
});