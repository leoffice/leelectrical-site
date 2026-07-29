// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  localStorage.clear();
  window.location.hash = "#/";
});

const job = (id, customer, title, amount, extra = {}) => ({
  id,
  customer,
  title,
  amount,
  paid: false,
  status: {},
  ...extra,
});

describe("JobDetail — same-address invoices when progress is folded", () => {
  // Three invoices at the same service address + one estimate (must not list) + one other-address invoice.
  const jobs = () => [
    job("K-1", "Meir Kabakov", "Panel swap", "$1,000", {
      invoiceNo: "1001",
      serviceAddress: "10 Oak St",
    }),
    job("K-2", "Meir Kabakov", "EV charger", "$900", {
      invoiceNo: "1002",
      serviceAddress: "10 Oak St",
    }),
    job("K-3", "Meir Kabakov", "Service call", "$300", {
      invoiceNo: "1003",
      serviceAddress: "10 Oak St",
    }),
    job("K-est", "Meir Kabakov", "Quoted only", "$500", {
      estimateNo: "E-9",
      serviceAddress: "10 Oak St",
    }),
    job("K-other", "Meir Kabakov", "Other site", "$200", {
      invoiceNo: "2001",
      serviceAddress: "99 Pine St",
    }),
  ];

  it("starts folded on job info; no auto open-invoice list; transaction history on by default", async () => {
    mockServer({ jobs: jobs() });
    const user = userEvent.setup();
    renderApp("#/job/K-1?from=c%3Ameir%20kabakov");

    const pane = await screen.findByTestId("detail-pane");
    const card = within(pane).getByTestId("job-info-card");

    // collapsed by default — job info card only; open invoices at address stay collapsed
    expect(within(card).getByText("Service address")).toBeInTheDocument();
    expect(screen.getByTestId("jobs-at-address-count")).toHaveTextContent(/4 jobs at this address/i);
    expect(screen.queryByTestId("customer-sibling-jobs")).not.toBeInTheDocument();

    // Levi 2026-07-28: customer transaction history is on by default
    const ledger = await screen.findByTestId("customer-txn-history");
    expect(ledger).toBeInTheDocument();

    // expand progress still works from the job card
    await user.click(card);
    expect(within(card).getByText("Service address")).toBeInTheDocument();
  });

  it("fold=0 opens fully expanded with no sibling list", async () => {
    mockServer({ jobs: jobs() });
    renderApp("#/job/K-1?fold=0");
    await screen.findByTestId("job-info-card");
    expect(screen.queryByTestId("customer-sibling-jobs")).not.toBeInTheDocument();
  });

  it("job customer card Transaction history toggle can hide ledger; estimates stay in ledger", async () => {
    mockServer({ jobs: jobs() });
    const user = userEvent.setup();
    renderApp("#/job/K-1?from=c%3Ameir%20kabakov");

    const pane = await screen.findByTestId("detail-pane");
    const card = within(pane).getByTestId("customer-card");
    expect(within(card).getByTestId("customer-short-txns-row")).toBeInTheDocument();

    // Default on
    const ledger = await screen.findByTestId("customer-txn-history");
    expect(within(ledger).getByTestId("cust-txn-filter-estimates")).toBeInTheDocument();
    await user.click(within(ledger).getByTestId("cust-txn-filter-estimates"));
    expect(within(ledger).getByText(/E-9|Quoted only/i)).toBeInTheDocument();

    // Toggle off
    await user.click(within(card).getByRole("switch", { name: /Transaction/i }));
    expect(screen.queryByTestId("customer-txn-history")).not.toBeInTheDocument();
  });

  it("tap customer card from job opened via customer returns to customer default", async () => {
    mockServer({ jobs: jobs() });
    const user = userEvent.setup();
    renderApp("#/job/K-1?from=c%3Ameir%20kabakov");

    const pane = await screen.findByTestId("detail-pane");
    expect(within(pane).getByTestId("job-info-card")).toBeInTheDocument();
    const card = within(pane).getByTestId("customer-card");
    // Tap card body (name), not Edit / links / toggle
    await user.click(within(card).getByText(/Meir Kabakov/i));

    const view = await screen.findByTestId("customer-view");
    expect(within(view).getByTestId("customer-card")).toBeInTheDocument();
    expect(within(view).getByTestId("customer-txn-history")).toBeInTheDocument();
    expect(screen.queryByTestId("detail-pane")).not.toBeInTheDocument();
  });
});
