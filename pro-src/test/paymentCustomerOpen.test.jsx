// @vitest-environment jsdom
// Payment edit: customer → service address → open invoices (no dual Find invoice list).
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("payment apply by service address", () => {
  const jobs = [
    {
      id: "J-pay-orphan",
      customer: "Mendeley Lane",
      qboCustomerId: "88",
      serviceAddress: "157 Ramson Avenue",
      amount: "$2000",
      payments: [
        {
          id: "pay-zelle-2k",
          amount: 2000,
          method: "Zelle",
          date: "2026-07-10",
          ref: "Z123",
        },
      ],
    },
    {
      id: "J-open-inv",
      customer: "Mendeley Lane",
      qboCustomerId: "88",
      serviceAddress: "157 Ramson Avenue",
      invoiceNo: "251900",
      amount: "$1500",
      openBalance: 1500,
      paid: false,
      invoiceLines: [{ itemName: "Panel", qty: 1, unitPrice: 1500 }],
    },
    {
      id: "J-other-addr",
      customer: "Mendeley Lane",
      qboCustomerId: "88",
      serviceAddress: "9 Other Street",
      invoiceNo: "251901",
      amount: "$800",
      openBalance: 800,
      paid: false,
      invoiceLines: [{ itemName: "Lights", qty: 1, unitPrice: 800 }],
    },
  ];

  it("edit payment: service address then open invoices — no Find invoice filter", async () => {
    mockServer({ jobs });
    const user = userEvent.setup();
    // Open job payment history with this payment already in edit
    renderApp("#/job/J-pay-orphan?payhist=1&payId=pay-zelle-2k");
    expect(await screen.findByTestId("payment-edit-form")).toBeInTheDocument();
    await user.click(screen.getByTestId("payment-full-edit"));

    expect(await screen.findByTestId("payment-edit-address-select")).toBeInTheDocument();
    expect(screen.queryByTestId("payment-edit-invoice-filter")).not.toBeInTheDocument();
    expect(screen.queryByTestId("payment-edit-invoice-select")).not.toBeInTheDocument();

    // Seed address auto-selected → open invoices at that site only
    expect(await screen.findByTestId("payment-edit-invoice-list")).toBeInTheDocument();
    expect(screen.getByTestId("payment-edit-inv-251900")).toBeInTheDocument();
    expect(screen.queryByTestId("payment-edit-inv-251901")).not.toBeInTheDocument();
  });

  it("switching service address swaps the open-invoice list", async () => {
    mockServer({ jobs });
    const user = userEvent.setup();
    renderApp("#/job/J-pay-orphan?payhist=1&payId=pay-zelle-2k");
    await screen.findByTestId("payment-edit-form");
    await user.click(screen.getByTestId("payment-full-edit"));
    const addr = await screen.findByTestId("payment-edit-address-select");
    // Pick the other address
    await user.selectOptions(addr, Array.from(addr.options).find((o) => /Other Street/i.test(o.textContent))?.value || "");
    await waitFor(() => {
      expect(screen.getByTestId("payment-edit-inv-251901")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("payment-edit-inv-251900")).not.toBeInTheDocument();
  });
});
