// @vitest-environment jsdom
// Batch A — Balance-first customer list: compact cards, expand in place, the
// sort picker, search partitioning, and the stability rule (no jump-to-top).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

const before = (a, b) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

// Names deliberately out of amount order so A-Z and Balance disagree.
// invoiceNo required — estimates (no invoice #) never count toward balance due.
const jobs = () => [
  { id: "A", customer: "Zeta Inc", title: "Big", amount: "$9,000", invoiceNo: "9001", paid: false, status: {} },
  { id: "B", customer: "Alpha Corp", title: "Mid", amount: "$500", invoiceNo: "9002", paid: false, status: {} },
  { id: "C", customer: "Mid Co", title: "Small", amount: "$100", invoiceNo: "9003", paid: false, status: {} },
  { id: "D", customer: "Paid Pete", title: "Settled", amount: "$400", invoiceNo: "9004", paid: true, status: {} },
];

const BY_BALANCE = ["Zeta Inc", "Alpha Corp", "Mid Co"];
const BY_NAME = ["Alpha Corp", "Mid Co", "Zeta Inc"];

const names = () =>
  screen.getAllByTestId("balance-card-name").map((n) => n.textContent);

describe("Balance view", () => {
  it("opens on Balance with compact cards, biggest balance first, paid customers excluded", async () => {
    mockServer({ jobs: jobs() });
    renderApp("#/");
    await screen.findByTestId("balance-list");
    expect(names()).toEqual(BY_BALANCE);
    // compact: amount on the row, no detail until tapped
    expect(screen.getAllByTestId("balance-card-amount")[0]).toHaveTextContent("$9,000");
    expect(screen.queryByTestId("balance-card-detail")).toBeNull();
  });

  it("CORE FIX: tapping the bottom card expands in place and does not move it", async () => {
    mockServer({ jobs: jobs() });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByTestId("balance-list");

    const taps = screen.getAllByTestId("balance-card-tap");
    const last = taps[taps.length - 1];
    expect(within(last).getByTestId("balance-card-name")).toHaveTextContent("Mid Co");

    await user.click(last);
    // expanded in place...
    expect(screen.getByTestId("balance-card-detail")).toBeInTheDocument();
    // ...and still last. This is the jump-to-top regression guard.
    expect(names()).toEqual(BY_BALANCE);

    // tap again collapses
    await user.click(screen.getAllByTestId("balance-card-tap").slice(-1)[0]);
    expect(screen.queryByTestId("balance-card-detail")).toBeNull();
    expect(names()).toEqual(BY_BALANCE);
  });

  it("A–Z sort reorders, and Set as default persists for the next mount", async () => {
    mockServer({ jobs: jobs() });
    const user = userEvent.setup();
    const first = renderApp("#/");
    await screen.findByTestId("balance-list");

    await user.click(screen.getByTestId("sort-customers"));
    await user.click(await screen.findByTestId("sort-default-az"));
    expect(names()).toEqual(BY_NAME); // really reordered, not coincidence
    expect(localStorage.getItem("lepro_cust_sort_v1")).toBe("az");

    first.unmount();
    vi.unstubAllGlobals();
    mockServer({ jobs: jobs() });
    renderApp("#/");
    await screen.findByTestId("balance-list");
    expect(screen.getByTestId("sort-customers")).toHaveTextContent("A–Z");
  });

  it("search shows balance matches first, then an 'Other customers' divider", async () => {
    mockServer({
      jobs: [
        ...jobs(),
        { id: "E", customer: "Alpha Legacy", title: "Old", amount: "$300", invoiceNo: "9005", paid: true, status: {} },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByTestId("balance-list");
    await user.type(screen.getByLabelText("Search jobs"), "alpha");

    const divider = await screen.findByTestId("other-customers-divider");
    const owed = screen.getByText("Alpha Corp");
    const history = screen.getByText("Alpha Legacy");
    expect(before(owed, divider)).toBe(true);
    expect(before(divider, history)).toBe(true);
  });

  it("All view is a flat list of everyone, including fully paid customers", async () => {
    mockServer({ jobs: jobs() });
    const user = userEvent.setup();
    renderApp("#/");
    await user.click(await screen.findByRole("button", { name: "All customers" }));
    expect(await screen.findByText("Paid Pete")).toBeInTheDocument();
    expect(screen.queryByTestId("balance-list")).toBeNull();
  });

  it("expand shows only open invoices + service address + invoice # (no estimates/paid)", async () => {
    mockServer({
      jobs: [
        {
          id: "open1",
          customer: "Zeta Inc",
          title: "Panel upgrade",
          amount: "$9,000",
          invoiceNo: "9001",
          paid: false,
          serviceAddress: "10 Main St",
          status: {},
        },
        {
          id: "est1",
          customer: "Zeta Inc",
          title: "Future work est",
          amount: "$2,000",
          estimateNo: "E-44",
          paid: false,
          serviceAddress: "10 Main St",
          status: {},
        },
        {
          id: "paid1",
          customer: "Zeta Inc",
          title: "Old paid job",
          amount: "$400",
          invoiceNo: "8000",
          paid: true,
          serviceAddress: "10 Main St",
          status: {},
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByTestId("balance-list");
    await user.click(screen.getAllByTestId("balance-card-tap")[0]);

    const detail = await screen.findByTestId("balance-card-detail");
    const panel = within(detail).getByTestId("customer-expand-panel");
    expect(panel).toBeInTheDocument();
    // Order: billing first, then service address blocks with open invoices only.
    const billing = within(panel).getByTestId("expand-billing-box");
    const service = within(panel).getByTestId("expand-service-block");
    expect(service).toHaveTextContent("10 Main St");
    expect(billing.compareDocumentPosition(service) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const rows = within(detail).getAllByTestId("group-job-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-invoice-no", "9001");
    expect(rows[0]).toHaveTextContent(/Inv #9001/);
    expect(within(detail).queryByText(/Est #E-44/i)).toBeNull();
    expect(within(detail).queryByText(/8000/)).toBeNull();
    expect(within(detail).queryByText(/Future work est/i)).toBeNull();
  });

  it("expanded balance card collapses after ~10s idle", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockServer({ jobs: jobs() });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp("#/");
    await screen.findByTestId("balance-list");
    await user.click(screen.getAllByTestId("balance-card-tap")[0]);
    expect(screen.getByTestId("balance-card-detail")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(screen.queryByTestId("balance-card-detail")).toBeNull();
    vi.useRealTimers();
  });
});
