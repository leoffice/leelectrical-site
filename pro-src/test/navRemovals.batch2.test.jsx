// @vitest-environment jsdom
// Batch 2 tail — nav removals: no Build tab, no mobile top-right QB sync control.
import { afterEach, describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";
import { visibleNavItems, isRouteAllowed } from "../src/lib/tenantNav.js";
import { LE_TENANT_SEED } from "../src/lib/tenantConfig.js";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("nav registry — Build removed but routed", () => {
  const le = LE_TENANT_SEED;
  it("Build is not a visible nav item even for the internal owner", () => {
    const tos = visibleNavItems(le).map((i) => i.to);
    expect(tos).not.toContain("/progress");
    // Dev (the other internal tool) is untouched.
    expect(tos).toContain("/dev");
  });
  it("/progress route stays reachable for internal (reachability preserved)", () => {
    expect(isRouteAllowed("/progress", le)).toBe(true);
  });
});

describe("mobile top-right QuickBooks sync control removed", () => {
  it("does not render the mobile floating sync chip; sidebar sync chip remains", async () => {
    mockServer();
    renderApp("#/");
    await screen.findByTestId("sidebar");
    // The mobile top-right floating QB sync control is gone.
    expect(screen.queryByTestId("mobile-sync-float")).not.toBeInTheDocument();
    // The desktop sidebar still exposes the sync chip (QB sync lives there / Settings).
    const sidebar = screen.getByTestId("sidebar");
    expect(within(sidebar).getByTestId("sync-chip")).toBeInTheDocument();
  });

  it("no Build label appears anywhere in the app chrome", async () => {
    mockServer();
    renderApp("#/");
    await screen.findByTestId("sidebar");
    expect(screen.queryByText("Build")).not.toBeInTheDocument();
  });
});
