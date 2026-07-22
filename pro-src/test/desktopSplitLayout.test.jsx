// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

const setWidth = (w) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
  window.dispatchEvent(new Event("resize"));
};

afterEach(() => {
  localStorage.clear();
  window.location.hash = "#/";
});

describe("desktop collapsible layout — 1280px", () => {
  beforeEach(() => setWidth(1280));

  it("sidebar collapse toggles to icon-only widgets", async () => {
    mockServer();
    const user = userEvent.setup();
    renderApp("#/");
    const sidebar = await screen.findByTestId("sidebar");
    expect(sidebar.getAttribute("data-collapsed")).toBe("0");
    expect(screen.getByTestId("sidebar-collapse")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-resize")).toBeInTheDocument();

    await user.click(screen.getByTestId("sidebar-collapse"));
    await waitFor(() => expect(screen.getByTestId("sidebar").getAttribute("data-collapsed")).toBe("1"));
    // Labels hide; icons remain reachable by aria-label
    expect(screen.getByTestId("sidebar").querySelector('[aria-label="Customers"]')).toBeTruthy();
  });

  it("job detail has resizable list pane and collapse control", async () => {
    mockServer();
    renderApp("#/job/J-1?fold=0");
    await screen.findByTestId("detail-pane");
    expect(screen.getByTestId("desktop-list-split")).toBeInTheDocument();
    expect(screen.getByTestId("list-pane")).toBeInTheDocument();
    expect(screen.getByTestId("list-detail-resize")).toBeInTheDocument();
    expect(screen.getByTestId("list-pane-collapse")).toBeInTheDocument();
  });

  it("balance cards show left aging rail when money is owed", async () => {
    mockServer({
      jobs: [
        {
          id: "J-old",
          customer: "Aged Co",
          title: "Old bill",
          amount: "$500",
          invoiceNo: "9001",
          paid: false,
          invoiceDate: "2025-01-01",
          status: {},
        },
      ],
    });
    renderApp("#/");
    await screen.findByTestId("balance-list");
    const rail = screen.getByTestId("aging-stripe");
    expect(rail).toBeInTheDocument();
    expect(rail.getAttribute("data-age-days")).toBeTruthy();
  });
});
