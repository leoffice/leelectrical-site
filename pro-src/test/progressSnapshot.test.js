import { describe, it, expect } from "vitest";
import defaultSnapshot from "../../netlify/functions/dev_progress_snapshot.json" with { type: "json" };

describe("progress snapshot import", () => {
  it("loads bundled snapshot without fs", () => {
    expect(defaultSnapshot).toBeTruthy();
    expect(defaultSnapshot.meta?.project).toBe("LE Pro");
    expect(Array.isArray(defaultSnapshot.updates)).toBe(true);
  });
});