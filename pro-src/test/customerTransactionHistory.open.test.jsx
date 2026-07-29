// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import CustomerTransactionHistory from "../src/components/CustomerTransactionHistory.jsx";

function wrap(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("CustomerTransactionHistory — Invoices Open / All", () => {
  const jobs = [
    {
      id: "j-open",
      customer: "Acme",
      invoiceNo: "9001",
      invoiceDate: "2026-07-01",
      amount: "1000",
      openBalance: 400,
      serviceAddress: "10 Main",
    },
    {
      id: "j-paid",
      customer: "Acme",
      invoiceNo: "9002",
      invoiceDate: "2026-06-01",
      amount: "500",
      paid: true,
      openBalance: 0,
      serviceAddress: "20 Oak",
    },
  ];

  it("shows Open / All only on Invoices; Open hides paid invoices", async () => {
    const user = userEvent.setup();
    wrap(<CustomerTransactionHistory jobs={jobs} fromCust="c:acme" />);

    // Scope control hidden on All
    expect(screen.queryByTestId("cust-txn-invoice-scope")).not.toBeInTheDocument();
    expect(screen.getByTestId("cust-txn-inv-9001")).toBeInTheDocument();
    expect(screen.getByTestId("cust-txn-inv-9002")).toBeInTheDocument();

    await user.click(screen.getByTestId("cust-txn-filter-invoices"));
    expect(screen.getByTestId("cust-txn-invoice-scope")).toBeInTheDocument();
    expect(screen.getByTestId("cust-txn-scope-all")).toBeInTheDocument();
    // Default All — both invoices
    expect(screen.getByTestId("cust-txn-inv-9001")).toBeInTheDocument();
    expect(screen.getByTestId("cust-txn-inv-9002")).toBeInTheDocument();

    await user.click(screen.getByTestId("cust-txn-scope-open"));
    expect(screen.getByTestId("cust-txn-inv-9001")).toBeInTheDocument();
    expect(screen.queryByTestId("cust-txn-inv-9002")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("cust-txn-scope-all"));
    expect(screen.getByTestId("cust-txn-inv-9001")).toBeInTheDocument();
    expect(screen.getByTestId("cust-txn-inv-9002")).toBeInTheDocument();
  });

  it("Invoices All lists open invoices before closed", async () => {
    const user = userEvent.setup();
    wrap(<CustomerTransactionHistory jobs={jobs} fromCust="c:acme" />);
    await user.click(screen.getByTestId("cust-txn-filter-invoices"));
    // Default All — open (9001) before paid/closed (9002)
    const list = screen.getByTestId("customer-txn-list");
    const rows = list.querySelectorAll("[data-testid^='cust-txn-inv-']");
    expect(rows[0]).toHaveAttribute("data-testid", "cust-txn-inv-9001");
    expect(rows[1]).toHaveAttribute("data-testid", "cust-txn-inv-9002");
  });
});
