// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";
import { fmtMoney } from "../src/lib/progressDashboard.js";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("Progress dashboard", () => {
  it("loads metrics and expands a highlight", async () => {
    mockServer();
    renderApp("#/progress");
    const user = userEvent.setup();
    expect(await screen.findByTestId("progress-dashboard")).toBeInTheDocument();
    expect(screen.getByText("Your app is moving fast")).toBeInTheDocument();
    expect(screen.getByText("4.2×")).toBeInTheDocument();
    expect(screen.getByText(fmtMoney(3200))).toBeInTheDocument();
    await user.click(screen.getByText("Test win"));
    expect(await screen.findByText("Details here.")).toBeInTheDocument();
  });

  it("shows refresh button on Progress route", async () => {
    mockServer();
    renderApp("#/progress");
    await screen.findByTestId("progress-dashboard");
    expect(screen.getAllByTestId("progress-refresh-btn").length).toBeGreaterThan(0);
  });

  it("refresh posts to progress API", async () => {
    const srv = mockServer();
    renderApp("#/progress");
    const user = userEvent.setup();
    await screen.findByTestId("progress-dashboard");
    await user.click(screen.getAllByTestId("progress-refresh-btn")[0]);
    await waitFor(() => expect(srv.posts("progress").length).toBeGreaterThan(0));
  });

  it("Progress tab appears in bottom nav", async () => {
    mockServer();
    renderApp("#/");
    const nav = screen.getByTestId("bottom-nav");
    expect(within(nav).getByText("Progress")).toBeInTheDocument();
  });
});