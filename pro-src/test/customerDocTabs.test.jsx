// @vitest-environment jsdom
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

describe("customer doc tabs — create + service addresses", () => {
  const jobs = [
    {
      id: "J-a",
      customer: "Addr Co",
      qboCustomerId: "1",
      invoiceNo: "100",
      serviceAddress: "55 Elm St",
      title: "Panel A",
      paid: false,
      amount: "$100",
    },
    {
      id: "J-b",
      customer: "Addr Co",
      qboCustomerId: "1",
      invoiceNo: "101",
      serviceAddress: "55 Elm St",
      title: "Panel B",
      paid: true,
      amount: "$200",
    },
    {
      id: "J-c",
      customer: "Addr Co",
      qboCustomerId: "1",
      estimateNo: "E-5",
      serviceAddress: "20 Pine Rd",
      title: "Rough-in",
    },
  ];

  it("create invoice from customer view opens doc builder on new job", async () => {
    mockServer({ jobs });
    const user = userEvent.setup();
    renderApp("#/customer/c:addr%20co");
    const view = await screen.findByTestId("customer-view");
    await user.click(within(view).getByTestId("cust-tab-invoices"));
    await user.click(within(view).getByTestId("cust-create-invoice"));
    await waitFor(() => expect(window.location.hash).toMatch(/#\/job\/local-/));
    expect(await screen.findByText(/Create invoice — Addr Co/)).toBeInTheDocument();
  });

  it("service addresses tab lists sites and jobs at selected address", async () => {
    mockServer({ jobs });
    const user = userEvent.setup();
    renderApp("#/customer/c:addr%20co");
    const view = await screen.findByTestId("customer-view");
    await user.click(within(view).getByTestId("cust-tab-addresses"));
    const panel = await within(view).findByTestId("cust-tab-panel-addresses");
    expect(within(panel).getByText("55 Elm St")).toBeInTheDocument();
    expect(within(panel).getByText("20 Pine Rd")).toBeInTheDocument();
    await user.click(within(panel).getByText("55 Elm St"));
    expect(within(panel).getByText("Panel A")).toBeInTheDocument();
    expect(within(panel).getByText("Panel B")).toBeInTheDocument();
  });

  it("job detail shows add job and change order next to edit", async () => {
    mockServer({ jobs: [jobs[0]] });
    const user = userEvent.setup();
    renderApp("#/job/J-a");
    const pane = await screen.findByTestId("detail-pane");
    expect(within(pane).getByTestId("job-add-btn")).toBeInTheDocument();
    expect(within(pane).getByTestId("add-change-order-btn")).toBeInTheDocument();
    await user.click(within(pane).getByTestId("add-change-order-btn"));
    expect(await screen.findByTestId("co-pick-invoice")).toBeInTheDocument();
  });
});