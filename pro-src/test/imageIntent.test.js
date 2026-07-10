import { describe, expect, it } from "vitest";
import {
  formatImageIntentSummary,
  invoiceHintsFromExtracted,
  letterOptions,
  suggestActionsFromImage,
} from "../src/lib/imageIntent.js";

const J1 = {
  id: "J-1",
  customer: "Acme LLC",
  invoiceNo: "251100",
  serviceAddress: "10 Main St Brooklyn NY",
};
const J2 = {
  id: "J-2",
  customer: "Beta Co",
  invoiceNo: "251808",
  serviceAddress: "55 Elm Street Brooklyn NY",
};

describe("invoiceHintsFromExtracted", () => {
  it("merges invoiceNumbers and memo", () => {
    expect(
      invoiceHintsFromExtracted({ invoiceNumbers: ["251808"], memo: "paid inv 251100" })
    ).toEqual(["251808", "251100"]);
  });
});

describe("suggestActionsFromImage", () => {
  it("suggests record payment + open job when invoice # matches", () => {
    const actions = suggestActionsFromImage({
      extracted: { documentType: "payment", amount: 1200, invoiceNumbers: ["251808"] },
      jobs: [J1, J2],
    });
    expect(actions.some((a) => a.kind === "record_payment" && a.invoiceNo === "251808")).toBe(true);
    expect(actions.some((a) => a.kind === "open_job" && a.job.id === "J-2")).toBe(true);
  });

  it("suggests open job by address", () => {
    const actions = suggestActionsFromImage({
      extracted: { addresses: ["55 Elm Street Brooklyn"] },
      jobs: [J1, J2],
    });
    expect(actions[0].kind).toBe("open_job");
    expect(actions[0].job.id).toBe("J-2");
  });

  it("falls back to ask Israel when no matches", () => {
    const actions = suggestActionsFromImage({ extracted: {}, jobs: [J1] });
    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe("ask");
  });
});

describe("formatImageIntentSummary", () => {
  it("includes A/B/C options", () => {
    const actions = suggestActionsFromImage({
      extracted: { invoiceNumbers: ["251808"], amount: 500, documentType: "payment" },
      jobs: [J2],
    });
    const s = formatImageIntentSummary(
      { invoiceNumbers: ["251808"], amount: 500, documentType: "payment" },
      actions
    );
    expect(s).toMatch(/invoice #251808/);
    expect(s).toMatch(/A\)/);
  });
});

describe("letterOptions", () => {
  it("labels up to three actions", () => {
    const opts = letterOptions([
      { id: "a", label: "One" },
      { id: "b", label: "Two" },
    ]);
    expect(opts[0].letter).toBe("A");
    expect(opts[1].letter).toBe("B");
  });
});