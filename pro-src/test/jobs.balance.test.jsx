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
const jobs = () => [
  { id: "A", customer: "Zeta Inc", title: "Big", amount: "$9,000", paid: false, status: {} },
  { id: "B", customer: "Alpha Corp", title: "Mid", amount: "$500", paid: false, status: {} },
  { id: "C", customer: "Mid Co", title: "Small", amount: "$100", paid: false, status: {} },
  { id: "D", customer: "Paid Pete", title: "Settled", amount: "$400", paid: true, status: {} },
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
        { id: "E", customer: "Alpha Legacy", title: "Old", amount: "$300", paid: true, status: {} },
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
});
