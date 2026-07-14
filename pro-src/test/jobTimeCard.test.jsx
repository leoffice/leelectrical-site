// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { J1, mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("Job time card", () => {
  it("shows on job detail and starts job timer", async () => {
    mockServer();
    localStorage.setItem("lepro_employee_id", "emp-levi");
    const user = userEvent.setup();
    renderApp("#/job/" + encodeURIComponent(J1.id));
    const card = await screen.findByTestId("job-time-card");
    expect(card).toBeInTheDocument();
    await user.click(screen.getByTestId("job-clock-in-btn"));
    expect(await screen.findByTestId("job-time-elapsed")).toBeInTheDocument();
    await user.click(screen.getByTestId("job-clock-out-btn"));
    await waitFor(() => expect(screen.queryByTestId("job-time-elapsed")).not.toBeInTheDocument());
  });
});