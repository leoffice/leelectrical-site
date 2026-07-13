import { describe, it, expect } from "vitest";
import { hideSuggestedAction, intentDuplicatesSuggestion, suggestedActionKeys } from "../src/lib/followUpDedupe.js";

describe("followUpDedupe", () => {
  it("detects duplicate suggestion keys", () => {
    const keys = suggestedActionKeys([{ key: "open_job" }, { key: "create_invoice" }]);
    expect(hideSuggestedAction(keys, "open_job")).toBe(true);
    expect(hideSuggestedAction(keys, "create_job")).toBe(false);
  });

  it("flags note intent that matches a smart suggestion", () => {
    const actions = [{ key: "create_invoice" }];
    expect(intentDuplicatesSuggestion({ kind: "invoice" }, actions)).toBe(true);
    expect(intentDuplicatesSuggestion({ kind: "estimate" }, actions)).toBe(false);
  });
});