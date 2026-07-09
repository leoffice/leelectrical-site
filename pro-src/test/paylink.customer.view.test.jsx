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
  it("Payment tab → link enqueues payment_link and shows Copy on success", { timeout: 10000 }, async () => {
    const srv = mockServer({ jobs: [job("P-1", "Rae Klein", "Panel", "$652", { invoiceNo: "251839", email: "rae@x.com", phone: "555-9" })] });
    const user = userEvent.setup();
    renderApp("#/job/P-1");

    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByTestId("tab-payment"));
    await user.click(await screen.findByText("Payment link"));
    await user.click(await screen.findByText("💳 Create payment link"));

    // it enqueued a deterministic payment_link command keyed paylink:<inv>
    await waitFor(() => {
      const cmd = srv.enqueued("payment_link")[0];
      expect(cmd).toBeTruthy();
      expect(cmd.idempotencyKey).toBe("paylink:251839:652");
      expect(cmd.payload.amount).toBe("652");
      expect(cmd.lane).toBe("deterministic");
      expect(cmd.payload.invoiceNo).toBe("251839");
    });

    // simulate the host listener completing it with a link, then the sheet polls
    const c = srv.state.commands.find((x) => x.type === "payment_link");
    c.status = "done";
    c.result = JSON.stringify({
      url: "https://secure.cardknox.com/lepaymentsdev?xAmount=652&xinvoice=251839",
      siteSlug: "lepaymentsdev",
    });

    expect(
      await screen.findByText(/\/app\/pro\/#\/pay\//, {}, { timeout: 6000 })
    ).toBeInTheDocument();
    expect(screen.getByText("📋 Copy link")).toBeInTheDocument();
  });

  it("lets Levi override the link amount before generating", { timeout: 10000 }, async () => {
    const srv = mockServer({
      jobs: [job("P-3", "Pat Lee", "Service", "$1,000", { invoiceNo: "251900", openBalance: 400 })],
    });
    const user = userEvent.setup();
    renderApp("#/job/P-3");

    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByTestId("tab-payment"));
    await user.click(await screen.findByText("Payment link"));
    const amt = await screen.findByLabelText("Payment link amount");
    expect(amt).toHaveValue("400");
    await user.clear(amt);
    await user.type(amt, "250");
    await user.click(await screen.findByText("💳 Create payment link"));

    await waitFor(() => {
      const cmd = srv.enqueued("payment_link")[0];
      expect(cmd.idempotencyKey).toBe("paylink:251900:250");
      expect(cmd.payload.amount).toBe("250");
    });
  });

  it("shows a graceful 'setup incomplete' state when the command fails", { timeout: 10000 }, async () => {
    const srv = mockServer({ jobs: [job("P-2", "Sol Berg", "Wiring", "$400", { invoiceNo: "251840" })] });
    const user = userEvent.setup();
    renderApp("#/job/P-2");

    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByTestId("tab-payment"));
    await user.click(await screen.findByText("Payment link"));
    await user.click(await screen.findByText("💳 Create payment link"));

    await waitFor(() => expect(srv.enqueued("payment_link")[0]).toBeTruthy());
    const c = srv.state.commands.find((x) => x.type === "payment_link");
    c.status = "failed";
    c.error = "siteSlug not set in sola_payments.json";

    expect(
      await screen.findByText("Sola payment link unavailable", { exact: false }, { timeout: 6000 })
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
    // K-1 (1000) + K-3 (300) = $1,300 due; group still lists all 3 jobs (incl. paid K-2)
    const grp = await screen.findByTestId("client-group");
    expect(within(grp).getByTestId("client-group-meta")).toHaveTextContent(/3 jobs/);
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
    // customer card + three job info cards
    expect(within(view).getByTestId("customer-card")).toBeInTheDocument();
    expect(within(view).getAllByTestId("job-info-card")).toHaveLength(3);
    expect(within(view).getByText("Panel swap")).toBeInTheDocument();
  });

  it("all job cards stay open with full info and doc tabs", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByTestId("client-group-amount");
    await user.click(screen.getByTestId("client-group-name"));

    const view = await screen.findByTestId("customer-view");
    const cards = within(view).getAllByTestId("job-info-card");
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(within(card).getByTestId("job-doc-tabs")).toBeInTheDocument();
    }
    expect(within(view).getByText("EV charger")).toBeInTheDocument();
    expect(within(view).getByText("Service")).toBeInTheDocument();
  });

  it("tapping a job card opens JobDetail with a back-to-customer breadcrumb", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByTestId("client-group-amount");
    await user.click(screen.getByTestId("client-group-name"));

    const view = await screen.findByTestId("customer-view");
    const panelCard = within(view).getByText("Panel swap").closest("[data-testid='job-info-card']");
    await user.click(panelCard);

    const back = await screen.findByTestId("detail-back");
    expect(back).toHaveTextContent("Meir Kabakov");

    await user.click(back);
    const view2 = await screen.findByTestId("customer-view");
    expect(view2).toBeInTheDocument();
    expect(within(view2).getByTestId("customer-jobs-section")).toBeInTheDocument();
  });
});
