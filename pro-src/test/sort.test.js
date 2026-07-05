// Unit — Jobs view sort-by comparators (SORT_OPTIONS / sortCmp / sortJobs).
import { describe, expect, it } from "vitest";
import { SORT_OPTIONS, isOverdue, nextStepDate, sortJobs } from "../src/lib/stages.js";
import { todayStr } from "../src/lib/format.js";

const j = (id, over = {}) => ({ id, amount: "", paid: false, status: {}, ...over });
const ids = (list) => list.map((x) => x.id);

describe("SORT_OPTIONS", () => {
  it("offers the exact six choices, Smart first (the default)", () => {
    expect(SORT_OPTIONS.map((o) => o.key)).toEqual([
      "smart", "amount", "next", "priority", "followup", "newest",
    ]);
    expect(SORT_OPTIONS.map((o) => o.label)).toEqual([
      "Smart (overdue → amount)",
      "Amount",
      "Next step date",
      "Priority (overdue invoices)",
      "Follow-up due",
      "Newest",
    ]);
  });
});

describe("sortJobs — default & amount", () => {
  it("no key keeps sleek's behavior: biggest amount first (inputs untouched)", () => {
    const list = [j("a", { amount: "$500" }), j("b", { amount: "$2,300" }), j("c", { amount: 900 })];
    expect(ids(sortJobs(list))).toEqual(["b", "c", "a"]);
    expect(ids(list)).toEqual(["a", "b", "c"]); // not mutated
    expect(ids(sortJobs(list, "amount"))).toEqual(["b", "c", "a"]);
    expect(ids(sortJobs(list, "bogus-key"))).toEqual(["b", "c", "a"]); // safe fallback
  });
});

describe("smart (overdue → amount)", () => {
  it("unpaid jobs with a past follow-up date jump ahead; amount breaks ties", () => {
    const list = [
      j("big", { amount: "$9,000" }),
      j("late", { amount: "$100", followUp: { date: "2020-01-01" } }),
      j("late2", { amount: "$300", followUp: { date: "2020-06-01" } }),
    ];
    expect(ids(sortJobs(list, "smart"))).toEqual(["late2", "late", "big"]);
  });

  it("paid or future-dated jobs are not overdue", () => {
    expect(isOverdue(j("x", { paid: true, followUp: { date: "2020-01-01" } }))).toBe(false);
    expect(isOverdue(j("y", { followUp: { date: "2099-01-01" } }))).toBe(false);
    expect(isOverdue(j("z", { followUp: { date: "2020-01-01" } }))).toBe(true);
    expect(isOverdue(j("t", { followUp: { date: todayStr() } }))).toBe(false); // due today ≠ overdue
  });
});

describe("next step date", () => {
  it("nextStepDate = earliest of Scheduled date and follow-up date", () => {
    expect(nextStepDate(j("a"))).toBe("");
    expect(nextStepDate(j("b", { status: { Scheduled: { s: "done", d: "2099-02-01" } } }))).toBe("2099-02-01");
    expect(
      nextStepDate(
        j("c", { status: { Scheduled: { s: "done", d: "2099-02-01" } }, followUp: { date: "2099-01-15" } })
      )
    ).toBe("2099-01-15");
  });

  it("earliest date first, undated last, amount breaks ties", () => {
    const list = [
      j("undated", { amount: "$9,999" }),
      j("feb", { status: { Scheduled: { s: "done", d: "2099-02-01" } } }),
      j("jan", { followUp: { date: "2099-01-05" } }),
      j("undated2", { amount: "$1" }),
    ];
    expect(ids(sortJobs(list, "next"))).toEqual(["jan", "feb", "undated", "undated2"]);
  });
});

describe("priority (overdue invoices)", () => {
  it("unpaid invoiced jobs first (oldest invoice date first), then the rest by amount", () => {
    const list = [
      j("noinv", { amount: "$8,000" }),
      j("inv-new", { invoiceNo: "9", status: { Invoiced: { s: "done", d: "2026-06-01" } } }),
      j("inv-old", { invoiceNo: "7", status: { Invoiced: { s: "done", d: "2025-01-01" } } }),
      j("paid-inv", { invoiceNo: "5", paid: true, amount: "$50,000" }),
    ];
    expect(ids(sortJobs(list, "priority"))).toEqual(["inv-old", "inv-new", "noinv", "paid-inv"]);
  });
});

describe("follow-up due", () => {
  it("earliest follow-up date first, undated last", () => {
    const list = [
      j("none", { amount: "$9,000" }),
      j("later", { followUp: { date: "2099-05-01" } }),
      j("soon", { followUp: { date: "2026-07-10" } }),
    ];
    expect(ids(sortJobs(list, "followup"))).toEqual(["soon", "later", "none"]);
  });
});

describe("newest", () => {
  it("createdAt desc, falling back to local-<ts> ids, then the Lead date", () => {
    const list = [
      j("J-lead", { status: { Lead: { s: "done", d: "2026-01-01" } } }),
      j("local-2000", {}),
      j("stamped", { createdAt: 5000 }),
      j("J-nothing", {}),
    ];
    expect(ids(sortJobs(list, "newest"))).toEqual(["J-lead", "stamped", "local-2000", "J-nothing"]);
  });
});
