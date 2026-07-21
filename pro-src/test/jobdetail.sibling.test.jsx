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

  it("starts folded on job info; shows same-address invoices below; expands on card tap", async () => {
    mockServer({ jobs: jobs() });
    const user = userEvent.setup();
    renderApp("#/job/K-1?from=c%3Ameir%20kabakov");

    const pane = await screen.findByTestId("detail-pane");
    const card = within(pane).getByTestId("job-info-card");

    // collapsed by default — job info card only, same-address invoices listed
    expect(within(card).getByText("Service address")).toBeInTheDocument();
    expect(screen.getByTestId("jobs-at-address-count")).toHaveTextContent(/4 jobs at this address/i);
    const siblings = await screen.findByTestId("customer-sibling-jobs");
    expect(within(siblings).getByText("EV charger")).toBeInTheDocument();
    expect(within(siblings).getByText("Service call")).toBeInTheDocument();
    expect(within(siblings).queryByText("Panel swap")).not.toBeInTheDocument();
    // estimates and other-address invoices stay out
    expect(within(siblings).queryByText("Quoted only")).not.toBeInTheDocument();
    expect(within(siblings).queryByText("Other site")).not.toBeInTheDocument();

    // expand progress → same-address list hides
    await user.click(card);
    expect(screen.queryByTestId("customer-sibling-jobs")).not.toBeInTheDocument();
    expect(within(card).getByText("Service address")).toBeInTheDocument();

    // fold again → list returns
    await user.click(card);
    expect(await screen.findByTestId("customer-sibling-jobs")).toBeInTheDocument();
  });

  it("fold=0 opens fully expanded with no sibling list", async () => {
    mockServer({ jobs: jobs() });
    renderApp("#/job/K-1?fold=0");
    await screen.findByTestId("job-info-card");
    expect(screen.queryByTestId("customer-sibling-jobs")).not.toBeInTheDocument();
  });
});
