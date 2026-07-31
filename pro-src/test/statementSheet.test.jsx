/** @vitest-environment jsdom */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StatementSheet from "../src/components/StatementSheet.jsx";

const jobs = [
  {
    id: "j1",
    invoiceNo: "100",
    invoiceDate: "2026-05-01",
    customer: "Test Co",
    email: "test@example.com",
    amount: "500",
    openBalance: "500",
    title: "Work",
  },
];

vi.mock("../src/state/store.jsx", () => ({
  useStore: () => ({
    api: {
      sendDocEmailNow: vi.fn(async () => ({ ok: true, dryRun: true })),
    },
    patchAndSave: vi.fn(async () => {}),
    showToast: vi.fn(),
  }),
}));

vi.mock("../src/lib/pdfOpen.js", () => ({
  downloadPdfBlob: vi.fn(),
  openPdfBlob: vi.fn(),
}));

describe("StatementSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows trigger controls: type picker, item selection, email", () => {
    render(
      <StatementSheet
        jobs={jobs}
        customerName="Test Co"
        customerEmail="test@example.com"
        primaryJob={jobs[0]}
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId("statement-sheet")).toBeTruthy();
    expect(screen.getByTestId("statement-type-picker")).toBeTruthy();
    expect(screen.getByTestId("statement-type-open_items")).toBeTruthy();
    expect(screen.getByTestId("statement-type-activity")).toBeTruthy();
    expect(screen.getByTestId("statement-type-balance_forward")).toBeTruthy();
    expect(screen.getByTestId("statement-item-picker")).toBeTruthy();
    expect(screen.getByTestId("statement-email")).toBeTruthy();
    expect(screen.getByTestId("statement-preview")).toBeTruthy();
    expect(screen.getByTestId("statement-balance-due")).toBeTruthy();
  });

  it("opens send confirm with keep/once when email differs", () => {
    render(
      <StatementSheet
        jobs={jobs}
        customerName="Test Co"
        customerEmail="test@example.com"
        primaryJob={jobs[0]}
        onClose={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("statement-email"));
    expect(screen.getByTestId("send-confirm-email")).toBeTruthy();
    // Change recipient → policy chips appear
    fireEvent.change(screen.getByTestId("send-confirm-email"), {
      target: { value: "other@example.com" },
    });
    expect(screen.getByTestId("send-email-policy")).toBeTruthy();
    expect(screen.getByTestId("send-email-keep")).toBeTruthy();
    expect(screen.getByTestId("send-email-once")).toBeTruthy();
  });

  it("switches type to activity and shows date range", () => {
    render(
      <StatementSheet jobs={jobs} customerName="Test Co" onClose={() => {}} />
    );
    fireEvent.click(screen.getByTestId("statement-type-activity"));
    expect(screen.getByTestId("statement-date-range")).toBeTruthy();
  });
});
