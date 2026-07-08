import { describe, expect, it } from "vitest";
import {
  PAPER,
  paperworkAwarenessLines,
  paperworkUpNext,
} from "../src/lib/paperwork.js";

describe("paperworkUpNext", () => {
  it("shows activate account after upload complete", () => {
    const br = {
      enabled: true,
      steps: {
        "Application submitted": true,
        "POE scheduled": true,
        "Uploaded paperwork complete": true,
      },
      dates: {},
    };
    expect(paperworkUpNext("coned", br).label).toBe("Activate the new account");
  });

  it("shows inspection on date when appointment is scheduled", () => {
    const br = {
      enabled: true,
      steps: {
        "Application submitted": true,
        "POE scheduled": true,
        "Uploaded paperwork complete": true,
        "New accounts activated": true,
        "Interim checklist": true,
        "Final checklist": true,
      },
      dates: { "Inspection appointment": "2099-07-10T14:30" },
    };
    expect(paperworkUpNext("coned", br).label).toMatch(/Inspection on Jul 10/);
  });

  it("returns awareness lines for each enabled branch", () => {
    const lines = paperworkAwarenessLines({
      paperwork: {
        coned: { enabled: true, steps: {} },
        dob: { enabled: true, steps: { "Permit issued": true } },
      },
    });
    expect(lines).toHaveLength(2);
    expect(lines[0].branchLabel).toBe("Con Ed filing");
    expect(lines[1].branchLabel).toBe("DOB");
    expect(lines[1].upNext).toBe("Request inspection");
  });

  it("Con Ed has Inspection appointment after Final checklist", () => {
    const idx = PAPER.coned.steps.indexOf("Inspection appointment");
    expect(idx).toBe(PAPER.coned.steps.indexOf("Final checklist") + 1);
  });
});