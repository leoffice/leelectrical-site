import { describe, it, expect, beforeEach } from "vitest";
import {
  WORK_DESCRIPTION_STYLES,
  TRAILER_SOW_ROUGH,
  DEDICATED_LINES_ROUGH,
  LABOR_ONLY_NOTE,
  addressInNewJersey,
  polishWorkDescription,
  polishClarifyingQuestions,
  polishWorkDescriptionWithAnswers,
  professionalLead,
  stripMetaFluff,
} from "../src/lib/workDescriptionPolish.js";
import {
  clearPolishLearningForTests,
  savePolishLearningEntry,
  preferLearnedPolish,
} from "../src/lib/workDescriptionPolishLearning.js";

beforeEach(() => {
  clearPolishLearningForTests();
});

describe("workDescriptionPolish", () => {
  it("exposes a short polish style menu", () => {
    expect(WORK_DESCRIPTION_STYLES).toHaveLength(4);
    expect(WORK_DESCRIPTION_STYLES.map((s) => s.key)).toEqual([
      "professional",
      "brief",
      "detailed",
      "invoice",
    ]);
  });

  it("breakdown style bulletizes multi-part notes", () => {
    const out = polishWorkDescription("panel upgrade; new circuits; permit filing", "breakdown");
    expect(out).toContain("Scope of work:");
    expect(out).toContain("•");
  });

  it("professional style wraps rough notes with em-dash lead", () => {
    const out = polishWorkDescription("replace ballast in hallway", "professional", { jobTitle: "Ballast swap" });
    expect(out).toContain("Electrical work — Ballast swap:");
    expect(out.toLowerCase()).toContain("ballast");
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

  it("Professional trailer SOW matches approved Levi voice (golden fixture)", () => {
    const out = polishWorkDescription(TRAILER_SOW_ROUGH, "professional", {
      jobTitle: "temporary sleeping trailers",
    });
    const rows = out.split("\n");
    expect(rows[0]).toBe("Electrical work — temporary sleeping trailers:");
    expect(out).toMatch(/^Electrical work — temporary sleeping trailers:\n• /);
    // Clean bullets — one item per line, never one long dotted sentence.
    const bullets = rows.filter((r) => r.startsWith("• "));
    expect(bullets.length).toBeGreaterThanOrEqual(5);
    expect(bullets.every((b) => !b.includes("• ", 2))).toBe(true);
    expect(out).toContain("400 A");
    expect(out).toContain("three-phase");
    expect(out).toMatch(/• Install /);
    expect(out).toMatch(/• Run overhead/);
    expect(out).toContain(LABOR_ONLY_NOTE);
    // Labor note is its own paragraph, not jammed into a bullet.
    expect(rows).toContain(LABOR_ONLY_NOTE);
    expect(out).toContain("Work performed in accordance with NEC and applicable local code requirements");
    // No company branding in customer-facing SOW.
    expect(out).not.toContain("LE Electrical");
    expect(out).not.toContain("BLZ");
  });

  it("Invoice-ready uses the same Levi SOW voice as Professional", () => {
    const pro = polishWorkDescription(TRAILER_SOW_ROUGH, "professional", {
      jobTitle: "temporary sleeping trailers",
    });
    const inv = polishWorkDescription(TRAILER_SOW_ROUGH, "invoice", {
      jobTitle: "temporary sleeping trailers",
    });
    expect(inv).toContain("Electrical work — temporary sleeping trailers:");
    expect(inv).toContain(LABOR_ONLY_NOTE);
    expect(inv).toContain("NEC");
    expect(inv.split("\n").filter((r) => r.startsWith("• ")).length).toBe(
      pro.split("\n").filter((r) => r.startsWith("• ")).length
    );
  });

  it("professionalLead uses an em dash", () => {
    expect(professionalLead("temporary sleeping trailers")).toBe(
      "Electrical work — temporary sleeping trailers:"
    );
  });

  it("dedicated-lines fail case: strip preamble, imperative bullets, no invented price/junk", () => {
    const out = polishWorkDescription(DEDICATED_LINES_ROUGH, "professional", {
      skipLearning: true,
    });
    const rows = out.split("\n");
    expect(rows[0]).toBe("Electrical work:");
    expect(out).not.toMatch(/The following is the description/i);
    expect(out).not.toMatch(/I don't/i);
    expect(out).not.toMatch(/Price includes labor and materials/i);
    expect(out).not.toContain(LABOR_ONLY_NOTE);
    const bullets = rows.filter((r) => r.startsWith("• "));
    expect(bullets).toEqual([
      "• Remove existing equipment",
      "• Install 5 dedicated circuits / lines on the same floor (~150 ft of cable)",
    ]);
    expect(out).toContain("Work performed in accordance with NEC and applicable local code requirements");
  });

  it("stripMetaFluff drops description preamble only", () => {
    expect(stripMetaFluff(DEDICATED_LINES_ROUGH)).toMatch(/^We are going to remove/i);
    expect(stripMetaFluff("panel upgrade")).toBe("panel upgrade");
  });

  it("does not invent labor+materials commercial note when Levi did not say it", () => {
    const out = polishWorkDescription(
      "Remove old panel. Install new 200A panel.",
      "professional",
      { skipLearning: true }
    );
    expect(out).not.toMatch(/labor and materials/i);
    expect(out).not.toContain(LABOR_ONLY_NOTE);
  });

  it("prefers a saved Levi edit on the next polish of similar rough notes", async () => {
    const raw = DEDICATED_LINES_ROUGH;
    const edited =
      "Electrical work:\n• Remove existing equipment\n• Install 5 dedicated circuits on floor 2 (~150 ft)\nWork performed in accordance with NEC and applicable local code requirements.";
    await savePolishLearningEntry({
      raw,
      polished: "Electrical work:\n• We are going to remove…",
      edited,
      styleKey: "professional",
    });
    expect(preferLearnedPolish(raw, "professional")).toBe(edited);
    const out = polishWorkDescription(raw, "professional");
    expect(out).toBe(edited);
  });
});

describe("polish clarifying questionnaire", () => {
  it("generates trailer-style clarifying questions from rough notes", () => {
    const qs = polishClarifyingQuestions(TRAILER_SOW_ROUGH, {
      jobTitle: "temporary sleeping trailers",
    });
    expect(qs.length).toBeGreaterThanOrEqual(5);
    expect(qs.length).toBeLessThanOrEqual(10);
    expect(qs.every((q) => q.id && q.prompt)).toBe(true);
    const ids = qs.map((q) => q.id);
    expect(ids).toContain("count_load");
    expect(ids).toContain("overhead_path");
    expect(ids).toContain("labor_materials");
  });

  it("re-polishes incorporating answered clarifications and ignoring blanks", () => {
    const out = polishWorkDescriptionWithAnswers(
      TRAILER_SOW_ROUGH,
      "professional",
      { jobTitle: "temporary sleeping trailers" },
      {
        count_load: "8 trailers · 60 A each",
        duration: "Aug 15 – Oct 1",
        overhead_path: "",
      }
    );
    expect(out).toContain("Electrical work — temporary sleeping trailers:");
    expect(out).toContain("8 trailers");
    expect(out).toContain("Aug 15");
    expect(out).toContain(LABOR_ONLY_NOTE);
    expect(out).toContain("NEC");
    // Blank answers must not invent Q:A paste.
    expect(out).not.toMatch(/Exact path for the overhead run/);
  });

  it("returns no questions for tiny notes", () => {
    expect(polishClarifyingQuestions("panel")).toEqual([]);
  });
});
