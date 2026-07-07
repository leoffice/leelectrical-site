// @vitest-environment jsdom
// Integration — Feature 1 (payment-link sheet in JobDetail) and Feature 2
// (customer group total-due row + Customer detail view). Renders the real App.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { groupSub, mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
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

describe("Feature 1 — payment link", () => {
  it("💳 Payment link button enqueues a payment_link command and shows the link + Copy on success", { timeout: 10000 }, async () => {
    const srv = mockServer({ jobs: [job("P-1", "Rae Klein", "Panel", "$652", { invoiceNo: "251839", email: "rae@x.com", phone: "555-9" })] });
    const user = userEvent.setup();
    renderApp("#/job/P-1");

    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByText("💳 Payment link"));
    await user.click(await screen.findByText("💳 Create payment link"));

    // it enqueued a deterministic payment_link command keyed paylink:<inv>
    await waitFor(() => {
      const cmd = srv.enqueued("payment_link")[0];
      expect(cmd).toBeTruthy();
      expect(cmd.idempotencyKey).toBe("paylink:251839");
      expect(cmd.lane).toBe("deterministic");
      expect(cmd.payload.invoiceNo).toBe("251839");
    });

    // simulate the host listener completing it with a link, then the sheet polls
    const c = srv.state.commands.find((x) => x.type === "payment_link");
    c.status = "done";
    c.result = JSON.stringify({ url: "https://customer.billergenie.com/pay/abc123" });

    expect(
      await screen.findByText("https://customer.billergenie.com/pay/abc123", {}, { timeout: 6000 })
    ).toBeInTheDocument();
    expect(screen.getByText("📋 Copy link")).toBeInTheDocument();
  });

  it("shows a graceful 'setup incomplete' state when the command fails", { timeout: 10000 }, async () => {
    const srv = mockServer({ jobs: [job("P-2", "Sol Berg", "Wiring", "$400", { invoiceNo: "251840" })] });
    const user = userEvent.setup();
    renderApp("#/job/P-2");

    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByText("💳 Payment link"));
    await user.click(await screen.findByText("💳 Create payment link"));

    await waitFor(() => expect(srv.enqueued("payment_link")[0]).toBeTruthy());
    const c = srv.state.commands.find((x) => x.type === "payment_link");
    c.status = "failed";
    c.error = "Biller Genie public API key not configured";

    expect(
      await screen.findByText("Biller Genie setup incomplete", { exact: false }, { timeout: 6000 })
    ).toBeInTheDocument();
  });
});

describe("Feature 2 — customer group total due + Customer view", () => {
  const jobs = () => [
    job("K-1", "Meir Kabakov", "Panel swap", "$1,000", { invoiceNo: "1001", email: "meir@x.com", phone: "555-1" }),
    job("K-2", "meir kabakov ", "EV charger", "$900", { paid: true }), // paid -> 0 balance
    job("K-3", "Meir Kabakov.", "Service", "$300"), // folds into the same group
  ];

  beforeEach(() => mockServer({ jobs: jobs() }));

  it("group row shows TOTAL BALANCE DUE (sum of unpaid open balances)", async () => {
    renderApp("#/");
    // K-1 (1000) + K-3 (300) = $1,300 due in Active filter (K-2 paid is hidden)
    const grp = await screen.findByTestId("client-group");
    expect(within(grp).getByText("2 jobs")).toBeInTheDocument();
    expect(within(grp).getByTestId("client-group-amount")).toHaveTextContent("$1,300");
  });

  it("tapping the customer name opens the Customer view with contact + total due + rows", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByTestId("client-group-amount");

    await user.click(screen.getByTestId("client-group-name"));

    const view = await screen.findByTestId("customer-view");
    expect(within(view).getByText("Meir Kabakov")).toBeInTheDocument();
    expect(within(view).getByTestId("customer-total-due")).toHaveTextContent("$1,300");
    expect(within(view).getByText(/3 jobs · 2 open invoices/)).toBeInTheDocument();
    // all three job rows present
    expect(within(view).getAllByTestId("customer-job-row")).toHaveLength(3);
    expect(within(view).getByText("Panel swap")).toBeInTheDocument();
  });

  it("tapping a job row opens JobDetail with a back-to-customer breadcrumb", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByTestId("client-group-amount");
    await user.click(screen.getByTestId("client-group-name"));

    const view = await screen.findByTestId("customer-view");
    await user.click(within(view).getByText("Panel swap"));

    // JobDetail now shows the customer name as the back breadcrumb
    const back = await screen.findByTestId("detail-back");
    expect(back).toHaveTextContent("Meir Kabakov");

    // and clicking it returns to the customer view
    await user.click(back);
    expect(await screen.findByTestId("customer-view")).toBeInTheDocument();
  });
});
