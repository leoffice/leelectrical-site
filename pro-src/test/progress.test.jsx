// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("Dev Progress dashboard", () => {
  it("loads build stats and expands an update", async () => {
    mockServer();
    renderApp("#/progress");
    const user = userEvent.setup();
    expect(await screen.findByTestId("progress-dashboard")).toBeInTheDocument();
    expect(screen.getByText(/Development Progress/)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    const row = screen.getByTestId("dev-update-1");
    await user.click(within(row).getByRole("button"));
    expect(await within(row).findByText("abc1234")).toBeInTheDocument();
  });

  it("shows nightly refresh note instead of manual refresh button", async () => {
    mockServer();
    renderApp("#/progress");
    await screen.findByTestId("progress-dashboard");
    expect(screen.getByText(/Refreshes nightly/i)).toBeInTheDocument();
    expect(screen.queryByTestId("progress-refresh-btn")).not.toBeInTheDocument();
  });

  it("Build is reachable from the bottom nav via More (internal only)", async () => {
    // Build left the always-visible tabs when the bar was trimmed for phone
    // legibility. For an internal build it must still be one tap away; for a
    // tenant it is absent from both the bar and the sheet (tenantRouteGate /
    // reportsTenant cover that side).
    mockServer();
    renderApp("#/");
    const nav = screen.getByTestId("bottom-nav");
    await userEvent.click(within(nav).getByTestId("nav-more"));
    expect(within(await screen.findByTestId("nav-more-sheet")).getByText("Build")).toBeInTheDocument();
  });
});