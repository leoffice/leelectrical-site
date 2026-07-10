// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("Company dashboard", () => {
  it("renders company KPI cards from live jobs", async () => {
    mockServer();
    renderApp("#/company");
    expect(await screen.findByTestId("company-dashboard")).toBeInTheDocument();
    expect(screen.getByText("Company Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Estimates submitted")).toBeInTheDocument();
    expect(screen.getAllByText("Money collected").length).toBeGreaterThan(0);
  });

  it("Company tab appears in bottom nav", async () => {
    mockServer();
    renderApp("#/");
    const nav = screen.getByTestId("bottom-nav");
    expect(within(nav).getByText("Company")).toBeInTheDocument();
  });
});