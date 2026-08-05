// @vitest-environment jsdom
// Customer page layout (Levi 2026-07-27 / 2026-08-05):
// - Header = customer + billing address
// - Transaction history ON (default) → What happened only (no Statement/tabs/overview)
// - History OFF → Statement / Invoices / service addresses / open invoices
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.location.hash = "#/";
});

const jobs = [
  {
    id: "J-a",
    customer: "Addr Co",
    qboCustomerId: "1",
    invoiceNo: "100",
    serviceAddress: "55 Elm St",
    billingAddress: "9 Billing Plaza",
    title: "Panel A",
    paid: false,
    amount: "$100",
  },
  {
    id: "J-b",
    customer: "Addr Co",
    qboCustomerId: "1",
    invoiceNo: "101",
    serviceAddress: "20 Pine Rd",
    billingAddress: "9 Billing Plaza",
    title: "Panel B",
    paid: true,
    amount: "$200",
  },
];

describe("customer page — billing with the customer, the rest below", () => {
  it("header card carries the billing address, not the service address", async () => {
    mockServer({ jobs });
    renderApp("#/customer/c:addr%20co");
    const view = await screen.findByTestId("customer-view");
    const card = within(view).getByTestId("customer-card");

    expect(within(card).getByText("Billing address")).toBeInTheDocument();
    expect(within(card).getByText("9 Billing Plaza")).toBeInTheDocument();
    // Service addresses are a list below, not a single row up here.
    expect(within(card).queryByText("Service address")).not.toBeInTheDocument();
    expect(within(card).queryByText("55 Elm St")).not.toBeInTheDocument();
  });

  it("transaction history on (default) shows only What happened — no Statement tabs or overview", async () => {
    mockServer({ jobs });
    renderApp("#/customer/c:addr%20co");
    const view = await screen.findByTestId("customer-view");
    expect(await within(view).findByTestId("customer-txn-history")).toBeInTheDocument();
    expect(within(view).queryByTestId("customer-doc-tabs")).not.toBeInTheDocument();
    expect(within(view).queryByTestId("cust-overview")).not.toBeInTheDocument();
    expect(within(view).queryByTestId("cust-generate-statement")).not.toBeInTheDocument();
  });

  it("history off shows service addresses and open invoices under the card", async () => {
    mockServer({ jobs });
    const user = userEvent.setup();
    renderApp("#/customer/c:addr%20co");
    const view = await screen.findByTestId("customer-view");
    const card = within(view).getByTestId("customer-card");
    // Turn transaction history off → Statement / Invoices / overview return.
    await user.click(card);
    await waitFor(() => {
      expect(within(view).queryByTestId("customer-txn-history")).not.toBeInTheDocument();
    });
    const overview = await within(view).findByTestId("cust-overview");

    const addrs = within(overview).getByTestId("cust-section-service-addresses");
    expect(within(addrs).getByText("55 Elm St")).toBeInTheDocument();
    expect(within(addrs).getByText("20 Pine Rd")).toBeInTheDocument();

    const open = within(overview).getByTestId("cust-section-open-invoices");
    expect(within(open).getByText("Invoice #100")).toBeInTheDocument();
    // Paid invoice belongs under Closed, not here.
    expect(within(open).queryByText("Invoice #101")).not.toBeInTheDocument();

    // Billing address first, then everything else.
    expect(card.compareDocumentPosition(overview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
