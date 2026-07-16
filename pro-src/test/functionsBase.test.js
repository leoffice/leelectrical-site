import { afterEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_ORIGIN, functionsBase, siteOrigin } from "../src/lib/functionsBase.js";

describe("functionsBase", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses same-origin on apex leelectrical.us", () => {
    vi.stubGlobal("location", { hostname: "leelectrical.us" });
    expect(functionsBase()).toBe("/.netlify/functions");
  });

  it("uses canonical apex URL on www (Cloudflare has no functions)", () => {
    vi.stubGlobal("location", { hostname: "www.leelectrical.us" });
    expect(functionsBase()).toBe(`${CANONICAL_ORIGIN}/.netlify/functions`);
  });

  it("uses canonical apex URL for local dev", () => {
    vi.stubGlobal("location", { hostname: "localhost" });
    expect(functionsBase()).toBe(`${CANONICAL_ORIGIN}/.netlify/functions`);
  });
});

describe("siteOrigin", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns canonical apex on www", () => {
    vi.stubGlobal("location", {
      protocol: "https:",
      hostname: "www.leelectrical.us",
      port: "",
    });
    expect(siteOrigin()).toBe(CANONICAL_ORIGIN);
  });

  it("keeps localhost origin for dev", () => {
    vi.stubGlobal("location", {
      protocol: "http:",
      hostname: "localhost",
      port: "5173",
    });
    expect(siteOrigin()).toBe("http://localhost:5173");
  });
});