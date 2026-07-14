import { describe, it, expect } from "vitest";
import {
  WORK_DESCRIPTION_STYLES,
  addressInNewJersey,
  polishWorkDescription,
} from "../src/lib/workDescriptionPolish.js";

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

  it("professional style cites NEC code, not company name", () => {
    const out = polishWorkDescription("panel upgrade", "professional", {
      jobTitle: "Rewire",
      address: "200 Service Ave, Brooklyn, NY 11201",
    });
    expect(out).toContain("NEC");
    expect(out).toContain("NYC");
    expect(out).not.toContain("LE Electrical");
    expect(out).not.toContain("BLZ");
  });

  it("every polish style returns multiple lines, not one dotted sentence", () => {
    for (const s of WORK_DESCRIPTION_STYLES) {
      const out = polishWorkDescription("panel upgrade; new circuits", s.key, { jobTitle: "Rewire" });
      expect(out.split("\n").length).toBeGreaterThanOrEqual(2);
      expect(out).not.toMatch(/^[^.\n]+\.[^.\n]+\.[^.\n]+$/);
    }
  });

  it("detects New Jersey addresses", () => {
    expect(addressInNewJersey("50 Billing Blvd, Newark, NJ 07102")).toBe(true);
    expect(addressInNewJersey("200 Service Ave, Brooklyn, NY 11201")).toBe(false);
  });

  it("commercial polish mentions NYC for Brooklyn jobs, not NJ", () => {
    const out = polishWorkDescription("panel upgrade", "commercial", {
      address: "200 Service Ave, Brooklyn, NY 11201",
    });
    expect(out).toContain("NYC");
    expect(out).not.toMatch(/\bNJ\b/);
    expect(out).not.toContain("New Jersey");
  });

  it("commercial polish mentions NJ only for New Jersey jobs", () => {
    const out = polishWorkDescription("panel upgrade", "commercial", {
      address: "50 Billing Blvd, Newark, NJ 07102",
    });
    expect(out).toContain("NJ");
    expect(out).not.toContain("NYC/NJ");
  });
});