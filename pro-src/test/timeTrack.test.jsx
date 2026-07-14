// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { J1, mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("Time tab", () => {
  it("shows in nav and clocks in + out", async () => {
    mockServer();
    const user = userEvent.setup();
    renderApp("#/time");
    expect(await screen.findByTestId("time-view")).toBeInTheDocument();
    expect(screen.getByText("Clock in — start shift")).toBeInTheDocument();
    await user.click(screen.getByTestId("clock-in-btn"));
    expect(await screen.findByTestId("active-session")).toBeInTheDocument();
    expect(screen.getByTestId("clock-out-btn")).toBeInTheDocument();
    await user.click(screen.getByTestId("clock-out-btn"));
    await waitFor(() => expect(screen.queryByTestId("active-session")).not.toBeInTheDocument());
    expect(await screen.findByTestId("time-entry")).toBeInTheDocument();
  });

  it("starts job timer from job picker", async () => {
    mockServer();
    const user = userEvent.setup();
    renderApp("#/time");
    await screen.findByTestId("time-view");
    await user.click(screen.getByTestId("job-time-btn"));
    const sheet = await screen.findByTestId("job-pick-search");
    expect(sheet).toBeInTheDocument();
    await user.click(screen.getByText("Peretz Chein"));
    const active = await screen.findByTestId("active-session");
    expect(within(active).getByText(/Panel upgrade/)).toBeInTheDocument();
  });

  it("persists employee id on this device", async () => {
    mockServer();
    const user = userEvent.setup();
    renderApp("#/time");
    await screen.findByTestId("time-view");
    await user.click(screen.getByTestId("emp-emp-levi"));
    expect(localStorage.getItem("lepro_employee_id")).toBe("emp-levi");
  });

  it("shows weekly timesheet grid", async () => {
    mockServer();
    const user = userEvent.setup();
    renderApp("#/time");
    await screen.findByTestId("time-view");
    await user.click(screen.getByTestId("view-week"));
    expect(await screen.findByTestId("week-grid")).toBeInTheDocument();
  });

  it("adds a new employee", async () => {
    mockServer();
    const user = userEvent.setup();
    renderApp("#/time");
    await screen.findByTestId("time-view");
    await user.click(screen.getByTestId("add-employee-btn"));
    await user.type(screen.getByTestId("new-employee-name"), "Mike");
    await user.click(screen.getByText("Save"));
    await waitFor(() => expect(screen.getByRole("button", { name: /Mike/ })).toBeInTheDocument());
  });
});