// @vitest-environment jsdom
// Invoice edit + bi-directional estimate/invoice service-address sync + orange tabs.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

const LINKED_JOB = {
  id: "J-LINK",
  customer: "Sync Customer",
  title: "Panel job",
  email: "sync@x.com",
  serviceAddress: "100 Main St",
  apartment: "1A",
  address: "100 Main St",
  amount: "$500",
  estimateNo: "E-55",
  invoiceNo: "251955",
  estimateLines: [{ itemName: "Labor", qty: 1, unitPrice: 500, description: "Electrical" }],
  invoiceLines: [{ itemName: "Labor", qty: 1, unitPrice: 500, description: "Electrical" }],
  paid: false,
  status: {
    Lead: { s: "done" },
    Estimate: { s: "done", d: "2026-07-01" },
    Invoiced: { s: "done", d: "2026-07-02" },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("estimate ↔ invoice sync — e2e", () => {
  it("invoice edit allowed; address change syncs estimate + both tabs orange then clear", async () => {
    const srv = mockServer({ jobs: [JSON.parse(JSON.stringify(LINKED_JOB))] });
    const user = userEvent.setup();
    renderApp("#/job/J-LINK");
    const pane = await screen.findByTestId("detail-pane");
    const tabs = within(pane).getByTestId("job-doc-tabs");

    await user.click(within(tabs).getByTestId("tab-invoice"));
    expect(await screen.findByTestId("doc-edit")).toHaveTextContent(/Edit invoice/i);
    await user.click(screen.getByTestId("doc-edit"));
    expect(await screen.findByText(/Edit invoice/)).toBeInTheDocument();

    const addr = screen.getByTestId("doc-service-address");
    await user.clear(addr);
    await user.type(addr, "200 New Address");
    await user.click(screen.getByTestId("doc-save-sync"));

    await waitFor(() => expect(srv.enqueued("update_invoice")).toHaveLength(1));
    await waitFor(() => expect(srv.enqueued("update_estimate")).toHaveLength(1));
    const invCmd = srv.enqueued("update_invoice")[0];
    const estCmd = srv.enqueued("update_estimate")[0];
    expect(invCmd.payload.serviceAddress).toBe("200 New Address");
    expect(estCmd.payload.serviceAddress).toBe("200 New Address");
    expect(invCmd.payload.invoiceNo).toBe("251955");

    await waitFor(() => {
      expect(within(tabs).getByTestId("tab-estimate")).toHaveClass("bg-amber-50");
      expect(within(tabs).getByTestId("tab-invoice")).toHaveClass("bg-amber-50");
    });

    for (const c of srv.state.commands) {
      if (c.type === "update_invoice" || c.type === "update_estimate") c.status = "done";
    }
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => {
      expect(within(tabs).getByTestId("tab-estimate")).not.toHaveClass("bg-amber-50");
      expect(within(tabs).getByTestId("tab-invoice")).not.toHaveClass("bg-amber-50");
    });
  }, 20000);

  it("estimate address change syncs invoice + QBO commands for both", async () => {
    const srv = mockServer({ jobs: [JSON.parse(JSON.stringify(LINKED_JOB))] });
    const user = userEvent.setup();
    renderApp("#/job/J-LINK");
    const pane = await screen.findByTestId("detail-pane");
    const tabs = within(pane).getByTestId("job-doc-tabs");

    await user.click(within(tabs).getByTestId("tab-estimate"));
    await user.click(await screen.findByTestId("doc-edit"));

    const addr = await screen.findByTestId("doc-service-address");
    await user.clear(addr);
    await user.type(addr, "88 Side St");
    await user.click(screen.getByTestId("doc-save-sync"));

    await waitFor(() => expect(srv.enqueued("update_estimate")).toHaveLength(1));
    await waitFor(() => expect(srv.enqueued("update_invoice")).toHaveLength(1));
    expect(srv.enqueued("update_estimate")[0].payload.serviceAddress).toBe("88 Side St");
    expect(srv.enqueued("update_invoice")[0].payload.serviceAddress).toBe("88 Side St");

    await waitFor(() => {
      expect(within(tabs).getByTestId("tab-estimate")).toHaveClass("bg-amber-50");
      expect(within(tabs).getByTestId("tab-invoice")).toHaveClass("bg-amber-50");
    });
  }, 20000);

  it("paperwork Invoiced step offers Edit invoice when invoice exists", async () => {
    const srv = mockServer({ jobs: [JSON.parse(JSON.stringify(LINKED_JOB))] });
    const user = userEvent.setup();
    renderApp("#/job/J-LINK");
    const pane = await screen.findByTestId("detail-pane");

    await user.click(within(pane).getByRole("button", { name: /🧾\s*Billing/i }));
    const invStep = await within(pane).findByTestId("progress-step-Invoiced");
    await user.click(invStep);
    const editBtn = await within(pane).findByTestId("edit-invoice-paperwork");
    await user.click(editBtn);
    expect(await screen.findByTestId("doc-save-sync")).toBeInTheDocument();
  }, 15000);
});