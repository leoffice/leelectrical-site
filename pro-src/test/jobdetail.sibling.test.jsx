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

describe("JobDetail — sibling jobs when detail sections collapse", () => {
  const jobs = () => [
    job("K-1", "Meir Kabakov", "Panel swap", "$1,000", { invoiceNo: "1001", serviceAddress: "10 Oak St" }),
    job("K-2", "Meir Kabakov", "EV charger", "$900", { serviceAddress: "20 Pine St" }),
    job("K-3", "Meir Kabakov", "Service", "$300", { serviceAddress: "30 Elm St" }),
  ];

  it("keeps Job Info visible; collapse shows sibling jobs below, expand hides them", async () => {
    mockServer({ jobs: jobs() });
    const user = userEvent.setup();
    renderApp("#/job/K-1?from=c%3Ameir%20kabakov");

    const pane = await screen.findByTestId("detail-pane");
    const card = within(pane).getByTestId("job-info-card");

    // expanded by default — siblings hidden, job info always full
    expect(screen.queryByTestId("customer-sibling-jobs")).not.toBeInTheDocument();
    expect(within(card).getByText("Service address")).toBeInTheDocument();

    // collapse detail sections → siblings appear, job info still full
    await user.click(card);
    expect(within(card).getByText("Service address")).toBeInTheDocument();
    const siblings = await screen.findByTestId("customer-sibling-jobs");
    expect(within(siblings).getByText("EV charger")).toBeInTheDocument();
    expect(within(siblings).getByText("Service")).toBeInTheDocument();
    expect(within(siblings).queryByText("Panel swap")).not.toBeInTheDocument();

    // expand again → siblings go away
    await user.click(card);
    expect(screen.queryByTestId("customer-sibling-jobs")).not.toBeInTheDocument();
  });
});