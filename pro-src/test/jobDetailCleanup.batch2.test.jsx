// @vitest-environment jsdom
// Batch 2 D1 — JobDetail cleanup: no job-time card, customer txn ledger when
// opened from a customer, requisition toggle only on Edit Invoice when a flow exists.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { J1, mockServer, renderApp } from "./helpers.jsx";
import {
  isRequisitionPilotJob,
  requisitionFlowExists,
  requisitionHrefForJob,
} from "../src/lib/requisitionData.js";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("requisitionFlowExists (unit)", () => {
  it("is true when requisitionEnabled / requisitionFlowEnabled / projectId", () => {
    expect(requisitionFlowExists({ id: "a", requisitionEnabled: true })).toBe(true);
    expect(requisitionFlowExists({ id: "b", requisitionFlowEnabled: true })).toBe(true);
    expect(requisitionFlowExists({ id: "c", projectId: "proj-1" })).toBe(true);
  });

  it("is false for a plain job with no flow flags", () => {
    expect(requisitionFlowExists({ id: "plain", customer: "Acme", title: "Panel" })).toBe(false);
    expect(requisitionFlowExists(null)).toBe(false);
  });

  it("href prefers projectId and falls back to /projects", () => {
    expect(requisitionHrefForJob({ id: "x", projectId: "proj-9" })).toBe("/projects/proj-9");
    expect(requisitionHrefForJob({ id: "y" })).toBe("/projects");
    expect(isRequisitionPilotJob(null)).toBe(false);
  });
});

describe("Item 5 — Job time card removed", () => {
  it("job detail does not render job-time-card", async () => {
    mockServer();
    renderApp("#/job/" + encodeURIComponent(J1.id));
    const pane = await screen.findByTestId("detail-pane");
    expect(within(pane).getByTestId("job-info-card")).toBeInTheDocument();
    expect(screen.queryByTestId("job-time-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("job-clock-in-btn")).not.toBeInTheDocument();
  });
});

describe("Item 1 — customer transactions persist on job when from= is set", () => {
  const jobs = [
    {
      id: "T-1",
      customer: "Txn Customer",
      invoiceNo: "9001",
      invoiceDate: "2026-07-01",
      amount: "1000",
      paid: false,
      serviceAddress: "10 Main St",
      payments: [{ id: "p1", amount: "400", date: "2026-07-05", method: "Zelle" }],
    },
    {
      id: "T-2",
      customer: "Txn Customer",
      invoiceNo: "9002",
      invoiceDate: "2026-06-15",
      amount: "500",
      paid: true,
      serviceAddress: "20 Oak Ave",
    },
  ];

  it("renders customer-txn-history when opened with from= customer key", async () => {
    mockServer({ jobs });
    renderApp("#/job/T-1?from=" + encodeURIComponent("c:txn customer") + "&fold=1");
    const pane = await screen.findByTestId("detail-pane");
    expect(within(pane).getByTestId("job-info-card")).toBeInTheDocument();
    // Outside fold guard — present even when fold=1 collapses detail sections
    expect(await screen.findByTestId("customer-txn-history")).toBeInTheDocument();
  });

  it("does not force customer-txn-history without from= context", async () => {
    mockServer({ jobs });
    renderApp("#/job/T-1");
    const pane = await screen.findByTestId("detail-pane");
    expect(within(pane).getByTestId("job-info-card")).toBeInTheDocument();
    expect(screen.queryByTestId("customer-txn-history")).not.toBeInTheDocument();
  });
});

describe("Item 2 — requisition toggle on Edit Invoice only", () => {
  it("is absent from Job Information card", async () => {
    mockServer({
      jobs: [
        {
          ...JSON.parse(JSON.stringify(J1)),
          requisitionEnabled: true,
          requisitionFlowEnabled: true,
        },
      ],
    });
    renderApp("#/job/J-1");
    const pane = await screen.findByTestId("detail-pane");
    const card = within(pane).getByTestId("job-info-card");
    expect(within(card).queryByTestId("job-requisition-toggle")).not.toBeInTheDocument();
    expect(screen.queryByTestId("job-requisition-toggle")).not.toBeInTheDocument();
  });

  it("appears on Edit Invoice when the job has a requisition flow", async () => {
    mockServer({
      jobs: [
        {
          ...JSON.parse(JSON.stringify(J1)),
          requisitionEnabled: true,
          requisitionFlowEnabled: true,
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-1");
    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByTestId("tab-invoice"));
    // Doc sheet → Edit opens DocBuilderSheet mode=edit
    await user.click(await screen.findByTestId("doc-edit"));
    expect(await screen.findByText(/Edit invoice/i)).toBeInTheDocument();
    expect(await screen.findByTestId("job-requisition-toggle")).toBeInTheDocument();
  });

  it("is absent on Edit Invoice when the job has no requisition flow", async () => {
    mockServer({
      jobs: [{ ...JSON.parse(JSON.stringify(J1)), requisitionEnabled: false, requisitionFlowEnabled: false }],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-1");
    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByTestId("tab-invoice"));
    await user.click(await screen.findByTestId("doc-edit"));
    expect(await screen.findByText(/Edit invoice/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId("job-requisition-toggle")).not.toBeInTheDocument();
    });
  });

  it("is absent on Create invoice even if requisition flow exists", async () => {
    mockServer({
      jobs: [
        {
          ...JSON.parse(JSON.stringify(J1)),
          invoiceNo: "",
          requisitionEnabled: true,
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-1");
    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByTestId("tab-invoice"));
    // Sheet title is "Create invoice — <customer>" (also appears as awareness text).
    expect(await screen.findByText(/Create invoice —/i)).toBeInTheDocument();
    expect(screen.queryByTestId("job-requisition-toggle")).not.toBeInTheDocument();
  });
});
