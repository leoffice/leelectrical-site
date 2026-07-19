// @vitest-environment jsdom
// Regression: tapping a doc pill on a card in the address carousel must act on
// THAT card's job and must not navigate elsewhere. Tapping a control on a
// partially-visible card scrolls it into view; that scroll used to be read as
// "user swiped to another job" and fired onSelectJob, racing the tap — the
// "Inv 251850 opens a different customer" report.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import JobAddressCarousel from "../src/components/JobAddressCarousel.jsx";

const JOB_A = { id: "job-a", customer: "Alpha Co", invoiceNo: "111111", address: "1445 President st" };
const JOB_B = { id: "job-b", customer: "Beta Co", invoiceNo: "251850", address: "1445 President st" };

/** Give the scroll container a real width so onScroll's index math works. */
function sizeScroller(width = 400) {
  const el = screen.getByTestId("job-address-scroll");
  Object.defineProperty(el, "clientWidth", { value: width, configurable: true });
  return el;
}

/** Simulate the browser scrolling card `i` into view. */
function scrollToCard(el, i, cardWidthFactor = 0.88) {
  el.scrollLeft = i * el.clientWidth * cardWidthFactor;
  fireEvent.scroll(el);
}

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

describe("carousel pill tap routing", () => {
  it("an invoice pill tap acts on its own card's job", () => {
    const h = renderCarousel();
    // Card B's invoice pill.
    const cardB = screen.getByTestId("carousel-job-job-b");
    fireEvent.click(cardB.querySelector('[data-testid="tab-invoice"]'));
    expect(h.onInvoice).toHaveBeenCalledTimes(1);
    expect(h.onInvoice.mock.calls[0][0]).toMatchObject({ id: "job-b", invoiceNo: "251850" });
  });

  it("the scroll caused by a pill tap does NOT navigate to another job", () => {
    const h = renderCarousel();
    const el = sizeScroller();
    const cardB = screen.getByTestId("carousel-job-job-b");

    fireEvent.click(cardB.querySelector('[data-testid="tab-invoice"]'));
    // The tap scrolls card B into view — this must not be read as a swipe.
    scrollToCard(el, 1);

    expect(h.onInvoice).toHaveBeenCalledTimes(1);
    expect(h.onSelectJob).not.toHaveBeenCalled();
  });

  it("the same guard protects estimate and payment pills", () => {
    const h = renderCarousel();
    const el = sizeScroller();
    const cardB = screen.getByTestId("carousel-job-job-b");

    fireEvent.click(cardB.querySelector('[data-testid="tab-estimate"]'));
    scrollToCard(el, 1);
    expect(h.onEstimate).toHaveBeenCalledTimes(1);
    expect(h.onSelectJob).not.toHaveBeenCalled();
  });

  it("a genuine swipe (no preceding tap) still selects the new job", () => {
    const h = renderCarousel();
    const el = sizeScroller();
    scrollToCard(el, 1);
    expect(h.onSelectJob).toHaveBeenCalledTimes(1);
    expect(h.onSelectJob.mock.calls[0][0]).toMatchObject({ id: "job-b" });
  });

  it("a swipe after the guard window expires still selects", () => {
    vi.useFakeTimers();
    try {
      const h = renderCarousel();
      const el = sizeScroller();
      const cardB = screen.getByTestId("carousel-job-job-b");
      fireEvent.click(cardB.querySelector('[data-testid="tab-invoice"]'));

      // Well past the tap-guard window — this is a real swipe now.
      vi.advanceTimersByTime(2000);
      scrollToCard(el, 1);
      expect(h.onSelectJob).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
