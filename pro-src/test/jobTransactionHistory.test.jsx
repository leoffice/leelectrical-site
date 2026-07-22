// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import JobTransactionHistory from "../src/components/JobTransactionHistory.jsx";
import JobInfoCard from "../src/components/JobInfoCard.jsx";

describe("JobTransactionHistory", () => {
  const job = {
    id: "j-1",
    customer: "Test Co",
    invoiceNo: "251841",
    amount: "$2,300",
    openBalance: 300,
    payments: [
      { id: "p1", amount: 1000, method: "Check", date: "2026-01-10", ref: "1042" },
      { id: "p2", amount: 1000, method: "Zelle", date: "2026-02-01" },
    ],
  };

  it("lists this job's invoice and payments only", () => {
    render(<JobTransactionHistory job={job} />);
    expect(screen.getByTestId("job-txn-history")).toBeInTheDocument();
    expect(screen.getByTestId("job-txn-inv-251841")).toBeInTheDocument();
    expect(screen.getByText(/Check/)).toBeInTheDocument();
    expect(screen.getByText(/Zelle/)).toBeInTheDocument();
    expect(screen.getByText(/Invoice #251841/)).toBeInTheDocument();
  });

  it("opens full payment editor when requested", async () => {
    const user = userEvent.setup();
    const onOpenFull = vi.fn();
    render(<JobTransactionHistory job={job} onOpenFull={onOpenFull} />);
    await user.click(screen.getByTestId("job-txn-open-full"));
    expect(onOpenFull).toHaveBeenCalledTimes(1);
  });

  it("filters with All / Invoices / Payments / Estimates tabs", async () => {
    const user = userEvent.setup();
    render(<JobTransactionHistory job={job} />);
    expect(screen.getByTestId("job-txn-filter-all")).toBeInTheDocument();
    expect(screen.getByTestId("job-txn-filter-invoices")).toBeInTheDocument();
    expect(screen.getByTestId("job-txn-filter-payments")).toBeInTheDocument();
    expect(screen.getByTestId("job-txn-filter-estimates")).toBeInTheDocument();

    await user.click(screen.getByTestId("job-txn-filter-payments"));
    expect(screen.queryByTestId("job-txn-inv-251841")).toBeNull();
    expect(screen.getByText(/Check/)).toBeInTheDocument();
    expect(screen.getByText(/Zelle/)).toBeInTheDocument();

    await user.click(screen.getByTestId("job-txn-filter-invoices"));
    expect(screen.getByTestId("job-txn-inv-251841")).toBeInTheDocument();
    expect(screen.queryByText(/Zelle/)).toBeNull();
  });
});

describe("JobInfoCard payment history toggle", () => {
  it("shows payment history toggle and never shows requisition flow", () => {
    const job = {
      id: "j-1",
      customer: "Test",
      title: "Panel",
      amount: 100,
      invoiceNo: "1",
    };
    render(
      <JobInfoCard
        job={job}
        jobTxns={false}
        onJobTxnsChange={() => {}}
        onEstimate={() => {}}
        onInvoice={() => {}}
        onCalendar={() => {}}
      />
    );
    expect(screen.getByTestId("job-txn-history-toggle")).toBeInTheDocument();
    expect(screen.queryByTestId("job-requisition-toggle")).toBeNull();
    expect(screen.queryByText(/Requisition flow/i)).toBeNull();
  });
});
