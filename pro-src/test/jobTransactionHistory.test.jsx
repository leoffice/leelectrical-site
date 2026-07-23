// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

  it("invoice row shows due amount and left open rail (not invoice total)", () => {
    render(<JobTransactionHistory job={job} />);
    const inv = screen.getByTestId("job-txn-inv-251841");
    expect(inv).toHaveAttribute("data-open-invoice", "1");
    expect(within(inv).getByTestId("job-txn-open-rail")).toBeInTheDocument();
    // due is $300, not total $2,300
    expect(within(inv).getByTestId("job-txn-amount")).toHaveTextContent("$300");
    expect(within(inv).queryByText(/Due /)).toBeNull();
  });

  it("paid invoice shows $0 and no open rail", () => {
    const paid = { ...job, openBalance: 0, paid: true, payments: [{ id: "p1", amount: 2300, method: "Check", date: "2026-01-10" }] };
    render(<JobTransactionHistory job={paid} />);
    const inv = screen.getByTestId("job-txn-inv-251841");
    expect(inv).toHaveAttribute("data-open-invoice", "0");
    expect(within(inv).queryByTestId("job-txn-open-rail")).toBeNull();
    expect(within(inv).getByTestId("job-txn-amount")).toHaveTextContent("$0");
  });

  it("opens full payment editor when requested", async () => {
    const user = userEvent.setup();
    const onOpenFull = vi.fn();
    render(<JobTransactionHistory job={job} onOpenFull={onOpenFull} />);
    await user.click(screen.getByTestId("job-txn-open-full"));
    expect(onOpenFull).toHaveBeenCalledTimes(1);
  });

  it("tapping a payment row opens the payment card", async () => {
    const user = userEvent.setup();
    const onOpenRow = vi.fn();
    render(<JobTransactionHistory job={job} onOpenRow={onOpenRow} />);
    await user.click(screen.getByTestId("job-txn-filter-payments"));
    await user.click(screen.getByTestId("job-txn-pay-p1"));
    expect(onOpenRow).toHaveBeenCalledTimes(1);
    expect(onOpenRow.mock.calls[0][0].kind).toBe("payment");
    expect(onOpenRow.mock.calls[0][0].payment?.id).toBe("p1");
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

describe("JobInfoCard transaction history toggle", () => {
  it("shows Transaction history toggle next to % paid and never shows requisition flow", () => {
    const job = {
      id: "j-1",
      customer: "Test",
      title: "Panel",
      amount: 100,
      openBalance: 40,
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
    const pctRow = screen.getByTestId("job-info-pct-row");
    expect(pctRow).toBeInTheDocument();
    expect(within(pctRow).getByText("% paid")).toBeInTheDocument();
    expect(within(pctRow).getByTestId("job-txn-history-toggle")).toBeInTheDocument();
    expect(within(pctRow).getByText("Transaction history")).toBeInTheDocument();
    expect(screen.queryByTestId("job-requisition-toggle")).toBeNull();
    expect(screen.queryByText(/Requisition flow/i)).toBeNull();
    expect(screen.queryByText("Payment history")).toBeNull();
  });
});
