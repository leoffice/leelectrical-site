// @vitest-environment jsdom
// Integration — Jobs view sort-by dropdown: six options, Smart default,
// localStorage persistence, and customer groups ranked by their best job.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { groupSub, mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

const jobs = () => [
  { id: "A", customer: "Alpha", title: "Big solo", amount: "$9,000", paid: false, status: {} },
  { id: "B", customer: "Beta", title: "Small one", amount: "$100", paid: false, status: {} },
  { id: "C", customer: "Beta", title: "Small two", amount: "$200", paid: false, status: {} },
];

/** DOM order helper — a must appear before b. */
const before = (a, b) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("sort dropdown", () => {
  it("renders next to the chips with the exact six options, Smart default; overdue jumps first", async () => {
    mockServer({
      jobs: jobs(),
      ov: { B: { followUp: { date: "2020-01-01" } } }, // tiny job, overdue
    });
    renderApp("#/");
    const sel = await screen.findByLabelText("Sort jobs");
    expect(sel).toHaveValue("smart");
    expect(within(sel).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Smart (overdue → amount)",
      "Amount",
      "Next step date",
      "Priority (overdue invoices)",
      "Follow-up due",
      "Newest",
    ]);
    // Beta's group leads despite Alpha's bigger amount (B is overdue)
    const betaRow = screen.getByTestId("client-group-amount");
    expect(betaRow).toHaveTextContent("$300");
    expect(before(betaRow, screen.getByText("Alpha"))).toBe(true);
  });

  it("choice persists in localStorage and is restored on next mount", async () => {
    mockServer({ jobs: jobs() });
    const user = userEvent.setup();
    const first = renderApp("#/");
    await user.selectOptions(await screen.findByLabelText("Sort jobs"), "newest");
    expect(localStorage.getItem("lepro_jobs_sort_v1")).toBe("newest");
    first.unmount();
    vi.unstubAllGlobals();

    mockServer({ jobs: jobs() });
    renderApp("#/");
    expect(await screen.findByLabelText("Sort jobs")).toHaveValue("newest");
  });

  it("Next step date: earliest first, undated groups last; groups take their best job's rank", async () => {
    mockServer({
      jobs: jobs(),
      ov: { C: { status: { Scheduled: { s: "done", d: "2099-01-02" } } } },
    });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Alpha");
    // default smart: nothing overdue -> amount -> Alpha first
    expect(before(screen.getByText("Alpha"), screen.getByText(/2 jobs/))).toBe(true);
    await user.selectOptions(screen.getByLabelText("Sort jobs"), "next");
    // Beta group's best job (C, dated) outranks undated Alpha
    expect(before(screen.getByText(/2 jobs/), screen.getByText("Alpha"))).toBe(true);
    // inside the group the dated job leads too
    await user.click(screen.getByText(/2 jobs/));
    expect(before(screen.getByText("Small two"), screen.getByText("Small one"))).toBe(true);
  });

  it("Amount sort restores the classic biggest-first order", async () => {
    mockServer({
      jobs: jobs(),
      ov: { B: { followUp: { date: "2020-01-01" } } },
    });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Alpha");
    await user.selectOptions(screen.getByLabelText("Sort jobs"), "amount");
    expect(before(screen.getByText("Alpha"), screen.getByText(/2 jobs/))).toBe(true);
  });
});
