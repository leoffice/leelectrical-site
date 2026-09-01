import { describe, it, expect } from "vitest";
import { expandNameToken, nameQueryMatches, tokensMatch } from "../src/lib/nameAliases.js";

describe("nameAliases", () => {
  it("expands Yosef ↔ Yossi", () => {
    expect(expandNameToken("Yosef")).toEqual(expect.arrayContaining(["yosef", "yossi"]));
    expect(tokensMatch("Yosef", "Yossi")).toBe(true);
  });

  it("matches Yosef Sternberg to Yossi Sternberg", () => {
    expect(nameQueryMatches("Yossi Sternberg", "Yosef Sternberg")).toBe(true);
    expect(nameQueryMatches("Yossi Sternberg", "sternberg")).toBe(true);
    expect(nameQueryMatches("Yossi Sternberg", "Yosef")).toBe(true);
  });

  it("does not match unrelated names", () => {
    expect(nameQueryMatches("Ester Sternberg", "Yosef Saidof")).toBe(false);
    expect(nameQueryMatches("Yossi Hackner", "Yosef Sternberg")).toBe(false);
  });
});
