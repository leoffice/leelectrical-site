// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { autoEditKey } from "../src/lib/liveEdit.js";

describe("autoEditKey", () => {
  it("prefers data-testid for keys", () => {
    const el = document.createElement("button");
    el.dataset.testid = "save-btn";
    el.textContent = "Save";
    expect(autoEditKey(el, "/today")).toContain("save-btn");
  });
});