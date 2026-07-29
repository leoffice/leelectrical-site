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

describe("JobDetail — default view is job card + transaction history", () => {
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

  it("does not auto-list open invoices at the address; keeps job card + history", async () => {
    mockServer({ jobs: jobs() });
    renderApp("#/job/K-1?from=c%3Ameir%20kabakov");

    const pane = await screen.findByTestId("detail-pane");
    const card = within(pane).getByTestId("job-info-card");
    expect(within(card).getByText("Service address")).toBeInTheDocument();
    // Levi 2026-07-28: no auto-expanded sibling invoice list
    expect(screen.queryByTestId("customer-sibling-jobs")).not.toBeInTheDocument();
    // Customer transaction history is on by default
    expect(screen.getByTestId("customer-txn-history")).toBeInTheDocument();
  });

  it("fold=0 opens fully expanded with no sibling list", async () => {
    mockServer({ jobs: jobs() });
    renderApp("#/job/K-1?fold=0");
    await screen.findByTestId("detail-pane");
    expect(screen.queryByTestId("customer-sibling-jobs")).not.toBeInTheDocument();
  });
});
