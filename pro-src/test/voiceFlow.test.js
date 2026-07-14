import { describe, expect, it } from "vitest";
import { polishVoiceText } from "../src/lib/voiceFlow.js";
import { findBaezJob, joyCustomerKey, seedBaezProject } from "../src/lib/requisitionData.js";

describe("voiceFlow", () => {
  it("polishes voice transcript with cap and period", () => {
    expect(polishVoiceText("hello world")).toBe("Hello world.");
    expect(polishVoiceText("Done!")).toBe("Done!");
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

  it("seed project has requisition enabled and customer key", () => {
    const p = seedBaezProject();
    expect(p.requisitionEnabled).toBe(true);
    expect(p.customerKey).toBe("c:joy construction");
  });
});