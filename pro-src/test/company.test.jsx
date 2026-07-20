// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { screen, within, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";
import { isSpeechToTextEnabled, SPEECH_TO_TEXT_KEY } from "../src/lib/appSettings.js";

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
    // Batch 2 renamed the heading from "Company Dashboard" to "Reports" — the
    // tenant-facing name for this surface, and what §1b of the plan calls it.
    expect(screen.getByText("Reports")).toBeInTheDocument();
    expect(screen.getByText("Estimates submitted")).toBeInTheDocument();
    expect(screen.getAllByText("Money collected").length).toBeGreaterThan(0);
  });

  it("Company is reachable from the mobile bottom nav via More", async () => {
    // Company moved out of the always-visible tabs when the bottom bar was
    // trimmed for phone legibility; it must still be one tap away.
    mockServer();
    renderApp("#/");
    const nav = screen.getByTestId("bottom-nav");
    fireEvent.click(within(nav).getByTestId("nav-more"));
    expect(within(await screen.findByTestId("nav-more-sheet")).getByText("Company")).toBeInTheDocument();
  });

  it("shows company logo file + speech-to-text setting", async () => {
    mockServer();
    renderApp("#/company");
    expect(await screen.findByTestId("company-info-settings")).toBeInTheDocument();
    expect(screen.getByTestId("company-logo-preview")).toBeInTheDocument();
    expect(screen.getByTestId("company-logo-file")).toBeInTheDocument();
    expect(screen.getByText("Speech to text")).toBeInTheDocument();
    const toggle = screen.getByRole("switch", { name: "Speech to text" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(isSpeechToTextEnabled()).toBe(false);
    expect(localStorage.getItem(SPEECH_TO_TEXT_KEY)).toBe("0");
  });
});