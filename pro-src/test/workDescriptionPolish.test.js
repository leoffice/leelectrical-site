import { describe, it, expect } from "vitest";
import { WORK_DESCRIPTION_STYLES, polishWorkDescription } from "../src/lib/workDescriptionPolish.js";

describe("workDescriptionPolish", () => {
  it("exposes 10 work-description polish styles", () => {
    expect(WORK_DESCRIPTION_STYLES).toHaveLength(10);
  });

  it("breakdown style bulletizes multi-part notes", () => {
    const out = polishWorkDescription("panel upgrade; new circuits; permit filing", "breakdown");
    expect(out).toContain("Scope of work:");
    expect(out).toContain("•");
  });

  it("professional style wraps rough notes", () => {
    const out = polishWorkDescription("replace ballast in hallway", "professional", { jobTitle: "Ballast swap" });
    expect(out).toContain("Ballast swap");
    expect(out).toContain("replace ballast");
  });
});