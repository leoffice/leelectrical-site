import { describe, expect, it } from "vitest";
import { prefillFromEvent } from "../src/components/NewJobFlow.jsx";

describe("prefillFromEvent", () => {
  it("parses customer <name> from calendar description (#58)", () => {
    const p = prefillFromEvent({
      id: "ev-cal58",
      summary: "Install — Broadway",
      start: "2026-07-10T14:00",
      location: "100 Broadway",
      description: "customer Avraham Drizin apt 4B rear entrance, call on arrival",
    });
    expect(p.customer).toBe("Avraham Drizin");
    expect(p.businessName).toBe("Avraham Drizin");
    expect(p.apartment).toBe("4B");
    expect(p.address).toBe("100 Broadway");
  });
});