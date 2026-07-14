import { describe, expect, it } from "vitest";
import {
  buildStyleRules,
  effectiveLabel,
  formatSyncDescription,
  hasPendingWork,
  isHidden,
  makeEditKey,
  mergeEdits,
  scopeFromPath,
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

  it("scopeFromPath normalizes routes", () => {
    expect(scopeFromPath("/job/J-1")).toBe("job:J-1");
    expect(scopeFromPath("/")).toBe("root");
  });

  it("buildStyleRules emits CSS", () => {
    const css = buildStyleRules({
      "a::b": { style: { fontSize: "18px", color: "#059669" } },
    });
    expect(css).toContain("font-size: 18px");
    expect(css).toContain('data-live-edit-key="a::b"');
  });

  it("formatSyncDescription includes area and style", () => {
    const desc = formatSyncDescription(
      { "x::y": { style: { fontSize: "20px" } } },
      [{ scope: "/today", rect: { width: 100, height: 50 }, text: "bigger calendar cells" }]
    );
    expect(desc).toContain("Style (x::y)");
    expect(desc).toContain("Area (/today)");
  });
});