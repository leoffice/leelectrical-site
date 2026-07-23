// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { J1, mockServer, renderApp } from "./helpers.jsx";
import { docConfirmMessage, parseDocCommandResult } from "../src/lib/docConfirm.js";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("Task 63 — invoice/estimate tabs", () => {
  it("gray invoice tab opens create builder like estimate", async () => {
    mockServer({ jobs: [{ ...JSON.parse(JSON.stringify(J1)), estimateNo: "", invoiceNo: "" }] });
    const user = userEvent.setup();
    renderApp("#/job/J-1");
    const pane = await screen.findByTestId("detail-pane");
    const tabs = within(pane).getByTestId("job-doc-tabs");

    await user.click(within(tabs).getByTestId("tab-invoice"));
    expect(await screen.findByText(/Create invoice — Peretz Chein/)).toBeInTheDocument();
    expect(screen.getByTestId("doc-sync-email")).toBeInTheDocument();
    expect(screen.getByTestId("doc-save")).toBeInTheDocument();
  });

  it("gray estimate tab opens create; colored invoice opens doc sheet", async () => {
    mockServer({ jobs: [{ ...JSON.parse(JSON.stringify(J1)), estimateNo: "", invoiceNo: "251841" }] });
    const user = userEvent.setup();
    renderApp("#/job/J-1");
    const pane = await screen.findByTestId("detail-pane");
    const tabs = within(pane).getByTestId("job-doc-tabs");

    await user.click(within(tabs).getByTestId("tab-estimate"));
    expect(await screen.findByText(/Generate estimate/)).toBeInTheDocument();
    await user.click(screen.getByLabelText("Close"));

    await user.click(within(tabs).getByTestId("tab-invoice"));
    expect(await screen.findByText("Invoice 251841")).toBeInTheDocument();
  });

  it("existing estimate tab offers convert to invoice", async () => {
    mockServer({
      jobs: [{ ...JSON.parse(JSON.stringify(J1)), estimateNo: "E-99", invoiceNo: "" }],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-1");
    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByTestId("tab-estimate"));
    expect(await screen.findByText("Convert to invoice")).toBeInTheDocument();
  });

  it("hides bottom change-order tab when job has no change-order history", async () => {
    mockServer({ jobs: [{ ...JSON.parse(JSON.stringify(J1)), estimateNo: "", invoiceNo: "251841" }] });
    renderApp("#/job/J-1");
    const pane = await screen.findByTestId("detail-pane");
    const tabs = within(pane).getByTestId("job-doc-tabs");
    expect(within(tabs).queryByTestId("tab-change-orders")).not.toBeInTheDocument();
    expect(within(pane).getByTestId("add-change-order-btn")).toBeInTheDocument();
  });

  it("shows bottom change-order tab when change-order history exists", async () => {
    const original = {
      ...JSON.parse(JSON.stringify(J1)),
      id: "J-1",
      estimateNo: "",
      invoiceNo: "251841",
      address: "10 Main St",
      city: "Brooklyn",
      state: "NY",
    };
    const coJob = {
      ...original,
      id: "J-co-1",
      changeOrder: true,
      changeOrderSourceId: "J-1",
      changeOrderSeq: 1,
      invoiceNo: "251841-CO-01",
      title: "Change Order 1",
    };
    mockServer({ jobs: [original, coJob] });
    renderApp("#/job/J-1");
    const pane = await screen.findByTestId("detail-pane");
    const tabs = within(pane).getByTestId("job-doc-tabs");
    expect(within(tabs).getByTestId("tab-change-orders")).toBeInTheDocument();
    expect(within(tabs).getByTestId("tab-change-orders")).toHaveTextContent(/COs/);
  });
});

describe("docConfirm", () => {
  it("parses QBO result and builds message", () => {
    const p = parseDocCommandResult(JSON.stringify({ invoiceNo: "251900", total: 2300 }), "invoice");
    expect(p.invoiceNo).toBe("251900");
    expect(docConfirmMessage({ kind: "invoice", no: "251900", amount: "$2,300", customer: "Peretz" })).toContain(
      "Invoice #251900"
    );
  });
});