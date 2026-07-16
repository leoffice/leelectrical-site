import { afterEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_ORIGIN, FUNCTIONS_ORIGIN, functionsBase, siteOrigin } from "../src/lib/functionsBase.js";

describe("functionsBase", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The apex leelectrical.us moved to Cloudflare and no longer serves
  // /.netlify/functions/* — API calls must go to the CF Pages Functions origin.
  it("uses the CF functions origin on apex leelectrical.us (no longer serves functions)", () => {
    vi.stubGlobal("location", { hostname: "leelectrical.us" });
    expect(functionsBase()).toBe(`${FUNCTIONS_ORIGIN}/.netlify/functions`);
  });

  it("uses the CF functions origin on www", () => {
    vi.stubGlobal("location", { hostname: "www.leelectrical.us" });
    expect(functionsBase()).toBe(`${FUNCTIONS_ORIGIN}/.netlify/functions`);
  });

  it("uses same-origin when served from the CF functions host itself", () => {
    vi.stubGlobal("location", { hostname: "cf-native.leelectrical-cf.pages.dev" });
    expect(functionsBase()).toBe("/.netlify/functions");
  });

  it("uses the CF functions origin for local dev", () => {
    vi.stubGlobal("location", { hostname: "localhost" });
    expect(functionsBase()).toBe(`${FUNCTIONS_ORIGIN}/.netlify/functions`);
  });

  it("keeps the canonical apex for customer-facing links", () => {
    expect(CANONICAL_ORIGIN).toBe("https://leelectrical.us");
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