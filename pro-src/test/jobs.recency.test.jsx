// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
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

describe("Active tab customer recency", () => {
  it("most recently opened customer rises to the top", async () => {
    mockServer({
      jobs: [
        { id: "A", customer: "Alpha Corp", title: "Job A", amount: "$100", paid: false, status: {} },
        { id: "B", customer: "Beta LLC", title: "Job B", amount: "$200", paid: false, status: {} },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/");
    // Recency ordering is an All-customers-view behaviour; Balance view is
    // balance-sorted and expands in place instead of navigating.
    await user.click(await screen.findByRole("button", { name: "All customers" }));
    const alpha = await screen.findByText("Alpha Corp");
    const beta = await screen.findByText("Beta LLC");
    expect(before(alpha, beta)).toBe(true);

    await user.click(beta);
    await screen.findByTestId("customer-view");
    await user.click(screen.getByText("‹ Customers"));

    const alpha2 = await screen.findByText("Alpha Corp");
    const beta2 = await screen.findByText("Beta LLC");
    expect(before(beta2, alpha2)).toBe(true);
  });
});