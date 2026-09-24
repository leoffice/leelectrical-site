// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { normalizeJob } from "../src/data/merge.js";
import { stageOf } from "../src/lib/stages.js";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.location.hash = "#/";
});

const PARTIAL_ID = "local-1790228127169";

describe("partial jobs open", () => {
  it("missing status and followUp do not throw; a non-array invoiceHistory does", () => {
    const sparse = { id: PARTIAL_ID, customer: "Hand entered", address: "9 Bond St" };
    expect(() => stageOf(sparse)).not.toThrow();
    expect(() => (sparse.followUp || {}).text).not.toThrow();
    const bad = { invoiceHistory: { bad: true } };
    expect(() => (bad.invoiceHistory || []).slice()).toThrow(TypeError);

    const fixed = normalizeJob({ ...sparse, invoiceHistory: { bad: true }, amount: "$42", payments: [{ id: "p", amount: 42 }] });
    expect(() => fixed.invoiceHistory.slice()).not.toThrow();
    expect(fixed.invoiceHistory).toEqual([]);
    expect(fixed.followUp).toEqual({ text: "", date: "" });
    expect(fixed.status.Lead).toEqual({ s: "current" });
    expect(fixed.billingAddress).toBe("");
    expect(fixed.apartment).toBe("");
    expect(fixed.description).toBe("");
    expect(fixed.invoiceNo).toBe("");
    expect(fixed.estimateNo).toBe("");
    expect(fixed.calEventId).toBe("");
    expect(fixed._sasCallId).toBe("");
    expect(fixed._sasRecordingUrl).toBe("");
    expect(fixed.amount).toBe("$42");
    expect(fixed.payments).toEqual([{ id: "p", amount: 42 }]);
    expect(Array.isArray(fixed.attachments)).toBe(true);
  });

  it("renders job detail for a partial local job, including a bad invoiceHistory", async () => {
    mockServer({
      jobs: [
        {
          id: PARTIAL_ID,
          customer: "Hand entered",
          address: "9 Bond St",
          serviceAddress: "9 Bond St",
          invoiceHistory: { bad: true },
          attachments: "not-a-list",
        },
      ],
      ov: {},
    });
    renderApp("#/job/" + PARTIAL_ID);
    const pane = await screen.findByTestId("detail-pane");
    expect(within(pane).getByText("Follow-up type")).toBeInTheDocument();
    expect(within(pane).getAllByText("9 Bond St").length).toBeGreaterThan(0);
    expect(within(pane).getAllByText("Hand entered").length).toBeGreaterThan(0);
  });

  it("an address row opens the full detail instead of a collapsed card", async () => {
    const user = userEvent.setup();
    mockServer({
      jobs: [
        {
          id: "J-a",
          customer: "Addr Co",
          invoiceNo: "100",
          serviceAddress: "55 Elm St",
          title: "Panel A",
          paid: false,
          amount: "$100",
        },
        {
          id: PARTIAL_ID,
          customer: "Addr Co",
          serviceAddress: "55 Elm St",
          address: "55 Elm St",
          title: "",
        },
      ],
    });
    renderApp("#/customer/c:addr%20co");
    const view = await screen.findByTestId("customer-view");
    await user.click(within(view).getByTestId("cust-tab-addresses"));
    const panel = await within(view).findByTestId("cust-tab-panel-addresses");
    await user.click(within(panel).getByText("55 Elm St"));
    await user.click(within(panel).getByTestId("cust-addr-job-" + PARTIAL_ID));
    await waitFor(() => expect(window.location.hash).toMatch(new RegExp("#/job/" + PARTIAL_ID)));
    expect(window.location.hash).not.toMatch(/fold=1/);
    expect(await screen.findByTestId("detail-pane")).toBeInTheDocument();
    expect(screen.getByText("Follow-up type")).toBeInTheDocument();
  });
});
