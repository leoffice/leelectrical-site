// @vitest-environment jsdom
// Customer transaction history opens payment sheet in-place (no job remount hang).
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";
import { setQuickbooksDocsFeatureEnabled } from "../src/lib/appSettings.js";

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("customer payment open + find invoice", () => {
  const jobs = [
    {
      id: "J-ramson",
      customer: "Mendeley Lane",
      qboCustomerId: "88",
      serviceAddress: "157 Ramson Avenue",
      estimateNo: "E-77",
      estimateLines: [{ itemName: "Service upgrade", qty: 1, unitPrice: 2000 }],
      amount: "$2000",
      payments: [
        {
          id: "pay-zelle-2k",
          amount: 2000,
          method: "Zelle",
          date: "2026-07-10",
          ref: "Z123",
        },
      ],
    },
  ];

  it("opens payment edit from customer history without leaving customer view", async () => {
    mockServer({ jobs });
    const user = userEvent.setup();
    // qboCustomerId → route key q:88
    renderApp("#/customer/q:88");
    const view = await screen.findByTestId("customer-view");
    await waitFor(() => expect(within(view).getByTestId("customer-txn-history")).toBeInTheDocument());

    const payRow = within(view).getByTestId("cust-txn-pay-pay-zelle-2k");
    await user.click(payRow);

    // Payment sheet opens on customer page — still on /customer, not stuck navigating.
    expect(await screen.findByTestId("payment-history-list")).toBeInTheDocument();
    expect(window.location.hash).toMatch(/#\/customer\//);
    expect(await screen.findByTestId("payment-edit-form")).toBeInTheDocument();
  });

  it("Find invoice lists open estimate for service address when no invoice", async () => {
    mockServer({ jobs });
    const user = userEvent.setup();
    renderApp("#/customer/q:88");
    const view = await screen.findByTestId("customer-view");
    await waitFor(() => expect(within(view).getByTestId("customer-txn-history")).toBeInTheDocument());
    await user.click(within(view).getByTestId("cust-txn-pay-pay-zelle-2k"));
    await screen.findByTestId("payment-history-list");
    // Tap payment row → edit form (auto when initialEditId set)
    expect(await screen.findByTestId("payment-edit-form")).toBeInTheDocument();
    await user.click(screen.getByTestId("payment-full-edit"));
    expect(await screen.findByTestId("payment-edit-invoice-list")).toBeInTheDocument();
    expect(screen.getByTestId("payment-edit-est-E-77")).toBeInTheDocument();
    // No duplicate "choose invoice" select
    expect(screen.queryByTestId("payment-edit-invoice-select")).not.toBeInTheDocument();
  });

  it("draft invoice Sync to QuickBooks does not reopen create builder", async () => {
    setQuickbooksDocsFeatureEnabled(true);
    const srv = mockServer({
      jobs: [
        {
          id: "J-draft-inv",
          customer: "Draft Pay Co",
          qboCustomerId: "9",
          email: "d@x.com",
          serviceAddress: "1 Main",
          invoiceLines: [{ itemName: "Labor", qty: 1, unitPrice: 500 }],
          amount: "$500",
          paid: false,
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-draft-inv");
    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByTestId("tab-invoice"));
    expect(await screen.findByTestId("doc-draft-banner")).toBeInTheDocument();
    expect(screen.getByTestId("doc-draft-actions")).toBeInTheDocument();
    expect(screen.getByTestId("doc-sync-qbo")).toHaveTextContent(/Sync to QuickBooks/i);
    expect(screen.getByTestId("doc-edit")).toHaveTextContent(/Edit invoice/i);
    await user.click(screen.getByTestId("doc-sync-qbo"));
    // Syncs in background — must NOT open create invoice builder
    await waitFor(() => {
      expect(screen.queryByTestId("doc-action-bar")).not.toBeInTheDocument();
    });
    expect(srv.enqueued("create_invoice").length).toBeGreaterThan(0);
  });
});
