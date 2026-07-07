import { describe, expect, it } from "vitest";
import {
  customerJobGroups,
  displayEventNotes,
  jobIdFromEventDescription,
  linkedJobForEvent,
  withJobLink,
} from "../src/lib/calendarLink.js";

describe("calendarLink", () => {
  it("parses and writes leJobId tags", () => {
    expect(jobIdFromEventDescription("phone: 917\nleJobId:J-9")).toBe("J-9");
    expect(withJobLink("notes here", "J-9")).toBe("notes here\nleJobId:J-9");
    expect(displayEventNotes("notes here\nleJobId:J-9")).toBe("notes here");
  });

  it("linkedJobForEvent matches calEventId or description tag", () => {
    const jobs = [
      { id: "J-1", customer: "A", calEventId: "ev-a" },
      { id: "J-2", customer: "B", calEventId: "" },
    ];
    expect(linkedJobForEvent({ id: "ev-a", description: "" }, jobs)?.id).toBe("J-1");
    expect(linkedJobForEvent({ id: "ev-b", description: "leJobId:J-2" }, jobs)?.id).toBe("J-2");
    expect(linkedJobForEvent({ id: "ev-x" }, jobs)).toBeNull();
  });

  it("customerJobGroups folds jobs by customer", () => {
    const groups = customerJobGroups([
      { id: "1", customer: "Alpha Co", title: "A" },
      { id: "2", customer: "Alpha Co", title: "B" },
      { id: "3", customer: "Beta", title: "C" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find(([k]) => k.startsWith("c:") || k.startsWith("g:"))[1]).toHaveLength(2);
  });
});