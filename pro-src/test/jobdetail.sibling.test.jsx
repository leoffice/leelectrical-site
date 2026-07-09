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

describe("JobDetail — sibling jobs on Job Info collapse", () => {
  const jobs = () => [
    job("K-1", "Meir Kabakov", "Panel swap", "$1,000", { invoiceNo: "1001" }),
    job("K-2", "Meir Kabakov", "EV charger", "$900"),
    job("K-3", "Meir Kabakov", "Service", "$300"),
  ];

  it("shows other customer jobs when Job Info is collapsed, hides them when expanded", async () => {
    mockServer({ jobs: jobs() });
    const user = userEvent.setup();
    renderApp("#/job/K-1?from=c%3Ameir%20kabakov");

    const pane = await screen.findByTestId("detail-pane");
    const card = within(pane).getByTestId("job-info-card");

    // expanded by default — siblings hidden
    expect(screen.queryByTestId("customer-sibling-jobs")).not.toBeInTheDocument();

    // collapse → siblings appear
    await user.click(card);
    const siblings = await screen.findByTestId("customer-sibling-jobs");
    expect(within(siblings).getByText("EV charger")).toBeInTheDocument();
    expect(within(siblings).getByText("Service")).toBeInTheDocument();
    expect(within(siblings).queryByText("Panel swap")).not.toBeInTheDocument();

    // expand again → siblings go away
    await user.click(card);
    expect(screen.queryByTestId("customer-sibling-jobs")).not.toBeInTheDocument();
  });
});