// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
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

describe("desktop layout — 1280px", () => {
  beforeEach(() => setWidth(1280));

  it("sidebar is fixed-width stable shell (no collapse thrash)", async () => {
    mockServer();
    renderApp("#/");
    const sidebar = await screen.findByTestId("sidebar");
    expect(sidebar).toBeInTheDocument();
    // Stable shell — no resize/collapse chrome that was causing layout twitch.
    expect(screen.queryByTestId("sidebar-collapse")).toBeNull();
    expect(screen.queryByTestId("sidebar-resize")).toBeNull();
    expect(screen.getByTestId("app-logo")).toBeInTheDocument();
  });

  it("job detail has list pane beside detail on desktop", async () => {
    mockServer();
    renderApp("#/job/J-1?fold=0");
    await screen.findByTestId("detail-pane");
    expect(screen.getByTestId("list-pane")).toBeInTheDocument();
    expect(screen.queryByTestId("desktop-list-split")).toBeNull();
    expect(screen.queryByTestId("list-detail-resize")).toBeNull();
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
