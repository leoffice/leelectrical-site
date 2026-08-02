// @vitest-environment jsdom
// Customer card: transaction toggle lives inside the card; tapping the white
// card body also toggles history (Levi 2026-08-02).
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
    customer: "Toggle Co",
    qboCustomerId: "9",
    invoiceNo: "900",
    billingAddress: "1 Main St",
    serviceAddress: "2 Site Rd",
    title: "Panel",
    paid: false,
    amount: "$100",
  },
];

describe("customer card — transaction history toggle", () => {
  it("keeps the toggle inside the customer card", async () => {
    mockServer({ jobs });
    renderApp("#/customer/c:toggle%20co");
    const view = await screen.findByTestId("customer-view");
    const card = within(view).getByTestId("customer-card");
    expect(within(card).getByTestId("customer-short-txns-row")).toBeInTheDocument();
    expect(within(card).getByRole("switch", { name: "Transaction history" })).toBeInTheDocument();
    expect(within(view).getByTestId("customer-txn-history")).toBeInTheDocument();
  });

  it("tapping the white card body turns transaction history off and on", async () => {
    mockServer({ jobs });
    const user = userEvent.setup();
    renderApp("#/customer/c:toggle%20co");
    const view = await screen.findByTestId("customer-view");
    const card = within(view).getByTestId("customer-card");
    expect(within(view).getByTestId("customer-txn-history")).toBeInTheDocument();

    await user.click(card);
    await waitFor(() => {
      expect(within(view).queryByTestId("customer-txn-history")).not.toBeInTheDocument();
    });

    await user.click(card);
    expect(await within(view).findByTestId("customer-txn-history")).toBeInTheDocument();
  });
});
