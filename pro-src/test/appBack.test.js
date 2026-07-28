import { describe, expect, it } from "vitest";
import {
  detailBackTarget,
  isDetailRoute,
  isDoubleBack,
  isRootRoute,
  parseHashPath,
  parseHashSearch,
} from "../src/lib/appBack.js";

describe("appBack helpers", () => {
  it("parses hash paths and search", () => {
    expect(parseHashPath("#/job/J-1?from=g%3A1")).toBe("/job/J-1");
    expect(parseHashSearch("#/job/J-1?from=g%3A1")).toBe("?from=g%3A1");
    expect(parseHashPath("#/")).toBe("/");
  });

  it("classifies root vs detail routes", () => {
    expect(isRootRoute("/")).toBe(true);
    expect(isRootRoute("/today")).toBe(true);
    expect(isRootRoute("/projects/joy-baez")).toBe(true);
    expect(isRootRoute("/job/J-1")).toBe(false);
    expect(isDetailRoute("/job/J-1")).toBe(true);
    expect(isDetailRoute("/customer/g%3A1")).toBe(true);
    expect(isDetailRoute("/today")).toBe(false);
  });

  it("resolves detail back targets", () => {
    expect(detailBackTarget("/job/J-1")).toBe("/");
    expect(detailBackTarget("/job/J-1", "?from=meir")).toBe("/customer/meir");
    expect(detailBackTarget("/customer/meir")).toBe("/");
  });

  it("detects rapid double-back", () => {
    const t = 1_000_000;
    expect(isDoubleBack(t + 500, t)).toBe(true);
    expect(isDoubleBack(t + 2500, t)).toBe(false);
    expect(isDoubleBack(t + 500, 0)).toBe(false);
  });
});