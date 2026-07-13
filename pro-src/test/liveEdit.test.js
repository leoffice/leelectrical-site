import { describe, expect, it } from "vitest";
import {
  effectiveLabel,
  formatSyncDescription,
  hasPendingWork,
  isHidden,
  makeEditKey,
  mergeEdits,
} from "../src/lib/liveEdit.js";

describe("liveEdit", () => {
  it("makeEditKey scopes elements", () => {
    expect(makeEditKey("followup:service_call", "action:email")).toBe(
      "followup:service_call::action:email"
    );
  });

  it("mergeEdits applies hide and relabel", () => {
    const saved = {};
    const pending = {
      "a::b": { hidden: true },
      "a::c": { label: "Send email to him" },
    };
    const merged = mergeEdits(saved, pending);
    expect(isHidden(merged, "a::b")).toBe(true);
    expect(effectiveLabel(merged, "a::c", "Email")).toBe("Send email to him");
    expect(effectiveLabel(merged, "a::d", "Open job")).toBe("Open job");
  });

  it("formatSyncDescription lists pending tweaks", () => {
    const desc = formatSyncDescription(
      { "x::y": { label: "New label", suggestion: "Move above remind" } },
      [{ scope: "followup", excerpt: "approve estimate", text: "too formal" }]
    );
    expect(desc).toContain('Rename x::y → "New label"');
    expect(desc).toContain("Suggest (x::y): Move above remind");
    expect(desc).toContain('Highlight (followup): "approve estimate"');
  });

  it("hasPendingWork detects session work", () => {
    expect(hasPendingWork({}, [])).toBe(false);
    expect(hasPendingWork({ k: { hidden: true } }, [])).toBe(true);
    expect(hasPendingWork({}, [{ excerpt: "x" }])).toBe(true);
  });
});