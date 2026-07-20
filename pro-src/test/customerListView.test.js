// Unit — customer-list view model: sort comparators, the search partition, and
// the frozen-order helper that implements the no-jump stability rule.
import { describe, expect, it } from "vitest";
import {
  applyStableOrder,
  customerRowCmp,
  partitionBalanceSearch,
  sortCustomerRows,
} from "../src/lib/customerListView.js";

const row = (key, name, due) => ({ key, name, jobs: [], summary: { due } });

describe("customerRowCmp", () => {
  const rows = [row("a", "Zeta", 100), row("b", "alpha", 900), row("c", "Mid", 500)];

  it("balance: highest owed first", () => {
    expect(sortCustomerRows(rows, "balance").map((r) => r.name)).toEqual(["alpha", "Mid", "Zeta"]);
  });

  it("A–Z: case-insensitive", () => {
    expect(sortCustomerRows(rows, "az").map((r) => r.name)).toEqual(["alpha", "Mid", "Zeta"]);
  });

  it("A–Z: blank names sort last", () => {
    const withBlank = [row("x", "", 0), row("y", "Bravo", 0), row("z", "Alpha", 0)];
    expect(sortCustomerRows(withBlank, "az").map((r) => r.name)).toEqual(["Alpha", "Bravo", ""]);
  });

  it("balance ties fall back to A–Z so the order is deterministic", () => {
    const tied = [row("1", "Charlie", 500), row("2", "Alpha", 500), row("3", "Bravo", 500)];
    expect(sortCustomerRows(tied, "balance").map((r) => r.name)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
  });

  it("unknown sort keys fall back to balance", () => {
    expect(customerRowCmp("nonsense")(row("a", "A", 10), row("b", "B", 20))).toBeGreaterThan(0);
  });
});

describe("partitionBalanceSearch", () => {
  it("splits owing customers from the rest, preserving order", () => {
    const { owing, other } = partitionBalanceSearch([
      row("a", "Owes", 100),
      row("b", "Clear", 0),
      row("c", "Owes2", 50),
    ]);
    expect(owing.map((r) => r.name)).toEqual(["Owes", "Owes2"]);
    expect(other.map((r) => r.name)).toEqual(["Clear"]);
  });
});

describe("applyStableOrder — the no-jump rule", () => {
  it("keeps each row in its original slot when the input re-sorts mid-epoch", () => {
    const state = {};
    const first = [row("a", "A", 0), row("b", "B", 0), row("c", "C", 0)];
    expect(applyStableOrder(first, state, "e1").map((r) => r.key)).toEqual(["a", "b", "c"]);

    // recency touch bumps "c" to the front of the freshly-computed list...
    const resorted = [row("c", "C", 0), row("a", "A", 0), row("b", "B", 0)];
    // ...but within the same epoch the rendered order does not move.
    expect(applyStableOrder(resorted, state, "e1").map((r) => r.key)).toEqual(["a", "b", "c"]);
  });

  it("re-sorts when the epoch changes (toggle / refresh / remount)", () => {
    const state = {};
    applyStableOrder([row("a", "A", 0), row("b", "B", 0)], state, "e1");
    const next = [row("b", "B", 0), row("a", "A", 0)];
    expect(applyStableOrder(next, state, "e2").map((r) => r.key)).toEqual(["b", "a"]);
  });

  it("appends genuinely new customers instead of reshuffling the list", () => {
    const state = {};
    applyStableOrder([row("a", "A", 0), row("b", "B", 0)], state, "e1");
    const withNew = [row("new", "New", 0), row("a", "A", 0), row("b", "B", 0)];
    expect(applyStableOrder(withNew, state, "e1").map((r) => r.key)).toEqual(["a", "b", "new"]);
  });

  it("first paint with empty data still orders correctly once rows arrive", () => {
    const state = {};
    expect(applyStableOrder([], state, "e1")).toEqual([]);
    const arrived = [row("b", "B", 0), row("a", "A", 0)];
    expect(applyStableOrder(arrived, state, "e1").map((r) => r.key)).toEqual(["b", "a"]);
  });

  it("supports a custom key accessor (All-view tuples)", () => {
    const state = {};
    const tuples = [["k1", []], ["k2", []]];
    const keyOf = (t) => t[0];
    applyStableOrder(tuples, state, "e1", keyOf);
    const flipped = [["k2", []], ["k1", []]];
    expect(applyStableOrder(flipped, state, "e1", keyOf).map(keyOf)).toEqual(["k1", "k2"]);
  });
});
