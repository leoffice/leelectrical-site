// @vitest-environment jsdom
// Address card is count-label only (no swipe). Doc pills act on the active job.
// Sibling invoices at the same address open from the folded job list, not a carousel.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import JobAddressCarousel from "../src/components/JobAddressCarousel.jsx";

const JOB_A = { id: "job-a", customer: "Alpha Co", invoiceNo: "111111", address: "1445 President st" };
const JOB_B = { id: "job-b", customer: "Beta Co", invoiceNo: "251850", address: "1445 President st" };

function renderCarousel(overrides = {}) {
  const handlers = {
    onSelectJob: vi.fn(),
    onInvoice: vi.fn(),
    onEstimate: vi.fn(),
    onPayment: vi.fn(),
    ...overrides,
  };
  render(
    <JobAddressCarousel
      jobs={[JOB_A, JOB_B]}
      activeId="job-a"
      events={[]}
      commands={[]}
      sasCalls={[]}
      {...handlers}
    />
  );
  return handlers;
}

afterEach(() => vi.clearAllMocks());

describe("address card (no swipe)", () => {
  it("shows a count label when multiple jobs share an address", () => {
    renderCarousel();
    expect(screen.getByTestId("jobs-at-address-count")).toHaveTextContent("2 jobs at this address");
    expect(screen.queryByTestId("job-address-scroll")).not.toBeInTheDocument();
  });

  it("renders only the active job card", () => {
    renderCarousel();
    expect(screen.getByTestId("carousel-job-job-a")).toBeInTheDocument();
    expect(screen.queryByTestId("carousel-job-job-b")).not.toBeInTheDocument();
  });

  it("an invoice pill tap acts on the active job", () => {
    const h = renderCarousel();
    const card = screen.getByTestId("carousel-job-job-a");
    fireEvent.click(card.querySelector('[data-testid="tab-invoice"]'));
    expect(h.onInvoice).toHaveBeenCalledTimes(1);
    expect(h.onInvoice.mock.calls[0][0]).toMatchObject({ id: "job-a", invoiceNo: "111111" });
    expect(h.onSelectJob).not.toHaveBeenCalled();
  });

  it("estimate and payment pills also use the active job", () => {
    const h = renderCarousel();
    const card = screen.getByTestId("carousel-job-job-a");
    fireEvent.click(card.querySelector('[data-testid="tab-estimate"]'));
    fireEvent.click(card.querySelector('[data-testid="tab-payment"]'));
    expect(h.onEstimate.mock.calls[0][0]).toMatchObject({ id: "job-a" });
    expect(h.onPayment.mock.calls[0][0]).toMatchObject({ id: "job-a" });
  });
});
