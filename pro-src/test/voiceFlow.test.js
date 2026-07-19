import { describe, expect, it } from "vitest";
import {
  consolidateRepetition,
  needsSmartPolish,
  polishVoiceText,
} from "../src/lib/voiceFlow.js";
import { findBaezJob, joyCustomerKey, seedBaezProject } from "../src/lib/requisitionData.js";

describe("voiceFlow — English (17)", () => {
  it("capitalizes and adds period", () => {
    expect(polishVoiceText("hello world")).toBe("Hello world.");
  });

  it("preserves existing terminal punctuation", () => {
    expect(polishVoiceText("Done!")).toBe("Done!");
    expect(polishVoiceText("Really?")).toBe("Really?");
  });

  it("formats list cues into numbered lines", () => {
    const out = polishVoiceText("first do a then do b finally do c");
    expect(out).toContain("1.");
    expect(out).toContain("2.");
    expect(out).toContain("3.");
  });

  it("expands spoken comma", () => {
    expect(polishVoiceText("wait comma hold on")).toBe("Wait, hold on.");
  });

  it("expands spoken period", () => {
    expect(polishVoiceText("stop period done")).toBe("Stop. Done.");
  });

  it("expands spoken question mark", () => {
    expect(polishVoiceText("are you there question mark")).toBe("Are you there?");
  });

  it("expands new line command", () => {
    expect(polishVoiceText("line one new line line two")).toBe("Line one\nLine two.");
  });

  it("new line command disables auto-list", () => {
    const out = polishVoiceText("first item new line second item");
    expect(out).not.toContain("1.");
    expect(out).toContain("\n");
  });

  it("lone then does not trigger list", () => {
    const out = polishVoiceText("go to the site then check the panel");
    expect(out).not.toContain("1.");
    expect(out).toContain("then");
  });

  it("removes filler words", () => {
    expect(polishVoiceText("um check the um panel")).toBe("Check the panel.");
  });

  it("dedupes repeated words", () => {
    expect(polishVoiceText("check check the panel")).toBe("Check the panel.");
  });

  it("fixes spacing around punctuation", () => {
    expect(polishVoiceText("wait , hold on")).toBe("Wait, hold on.");
  });

  it("handles second and third list markers", () => {
    const out = polishVoiceText("first wire the panel second run conduit third test");
    expect(out).toMatch(/1\./);
    expect(out).toMatch(/2\./);
    expect(out).toMatch(/3\./);
  });

  it("handles also as list marker", () => {
    const out = polishVoiceText("first panel also conduit also test");
    expect(out).toContain("1.");
    expect(out).toContain("2.");
  });

  it("handles number one spoken cue", () => {
    const out = polishVoiceText("number one check panel number two run wire");
    expect(out).toContain("1.");
    expect(out).toContain("2.");
  });

  it("handles new paragraph", () => {
    const out = polishVoiceText("first part new paragraph second part");
    expect(out).toContain("\n\n");
  });

  it("trims and collapses whitespace", () => {
    expect(polishVoiceText("  hello   world  ")).toBe("Hello world.");
  });
});

describe("voiceFlow — Hebrew (5)", () => {
  it("expands נקודה and סימן שאלה", () => {
    expect(polishVoiceText("שלום נקודה מה שלומך סימן שאלה")).toBe("שלום. מה שלומך?");
  });

  it("expands פסיק", () => {
    expect(polishVoiceText("חכה פסיק המשך")).toBe("חכה, המשך.");
  });

  it("expands שורה חדשה", () => {
    const out = polishVoiceText("שורה אחת שורה חדשה שורה שנייה");
    expect(out).toContain("\n");
  });

  it("does not alter Hebrew casing", () => {
    const out = polishVoiceText("שלום עולם");
    expect(out).toBe("שלום עולם.");
    expect(out.startsWith("שלום")).toBe(true);
  });

  it("handles mixed Hebrew punctuation commands", () => {
    expect(polishVoiceText("בוקר טוב נקודה איך הולך סימן שאלה")).toBe("בוקר טוב. איך הולך?");
  });
});

describe("voiceFlow — smart polish helpers", () => {
  it("flags repetitive ramble for smart polish", () => {
    const ramble =
      "first test wispr flow then compare apples to apples then compare apples to apples then organize so everything is clear";
    expect(needsSmartPolish(ramble)).toBe(true);
  });

  it("skips smart polish for short clean phrases", () => {
    expect(needsSmartPolish("check the panel")).toBe(false);
  });

  it("consolidates duplicate numbered lines offline", () => {
    const dup = "1. Wire the panel\n2. Wire the panel\n3. Test circuits";
    const out = consolidateRepetition(dup);
    expect(out).toContain("1.");
    expect(out).toContain("2.");
    expect(out.split("\n").length).toBe(2);
  });
});

describe("requisition hub helpers", () => {
  it("joy customer key is normalized", () => {
    expect(joyCustomerKey()).toBe("c:joy construction");
  });

  it("findBaezJob matches address or title", () => {
    const jobs = [
      { id: "j1", title: "Panel upgrade", customer: "Someone" },
      { id: "j2", title: "Baez Place electrical", address: "334 East 176th Street" },
    ];
    expect(findBaezJob(jobs)?.id).toBe("j2");
  });

  // seedBaezProject is async now: the LE schedule-of-values it seeds from is
  // dynamically imported so it stays out of the tenant bundle.
  it("seed project has requisition enabled and customer key", async () => {
    const p = await seedBaezProject();
    expect(p.requisitionEnabled).toBe(true);
    expect(p.customerKey).toBe("c:joy construction");
  });
});