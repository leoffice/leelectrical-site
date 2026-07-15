// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  applyDomLabels,
  applyLabelToElement,
  buildStyleRules,
  effectiveLabel,
  formatSyncDescription,
  hasPendingWork,
  isHidden,
  makeEditKey,
  mergeEdits,
  scopeFromPath,
  tagEditableElements,
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
      "a::b": { style: { fontSize: "18px", color: "#059669", width: "120px", height: "48px" } },
    });
    expect(css).toContain("font-size: 18px");
    expect(css).toContain("width: 120px");
    expect(css).toContain("height: 48px");
    expect(css).toContain('data-live-edit-key="a::b"');
  });

  it("buildStyleRules hides elements", () => {
    const css = buildStyleRules({ "a::b": { hidden: true } });
    expect(css).toContain("display: none !important");
  });

  it("applyLabelToElement relabels and restores", () => {
    const btn = document.createElement("button");
    btn.textContent = "🔄 Sync now";
    applyLabelToElement(btn, "Pull data", true);
    expect(btn.textContent).toBe("🔄 Pull data");
    applyLabelToElement(btn, "", false);
    expect(btn.textContent).toBe("🔄 Sync now");
  });

  it("tagEditableElements and applyDomLabels update the page", () => {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.dataset.testid = "sync-chip";
    btn.textContent = "Sync";
    document.body.appendChild(btn);

    tagEditableElements("/");
    expect(btn.dataset.liveEditKey).toBe("root::sync-chip");

    applyDomLabels("/", { "root::sync-chip": { label: "Refresh" } });
    expect(btn.textContent).toBe("Refresh");

    applyDomLabels("/", {});
    expect(btn.textContent).toBe("Sync");
    btn.remove();
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