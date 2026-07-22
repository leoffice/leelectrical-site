import { describe, expect, it } from "vitest";
import { formatPrintDescription, wrapPrintDescription } from "../src/lib/printDescription.js";

describe("formatPrintDescription", () => {
  it("preserves intentional blank lines", () => {
    expect(formatPrintDescription("A\n\nB")).toBe("A\n\nB");
  });

  it("normalizes unicode bullets to dash bullets with a space", () => {
    expect(formatPrintDescription("• Removal\n● Install")).toBe("- Removal\n- Install");
  });

  it("does not invent product/service text", () => {
    expect(formatPrintDescription("")).toBe("");
    expect(formatPrintDescription(null)).toBe("");
  });
});

describe("wrapPrintDescription", () => {
  it("keeps blank lines as empty rows", () => {
    expect(wrapPrintDescription("A\n\nB", 40)).toEqual(["A", "", "B"]);
  });

  it("keeps bullet prefix and indents wrapped continuations", () => {
    const lines = wrapPrintDescription(
      "- Installation of a long enough phrase that will wrap past the budget",
      28
    );
    expect(lines[0].startsWith("- ")).toBe(true);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[1].startsWith("  ")).toBe(true);
  });
});
