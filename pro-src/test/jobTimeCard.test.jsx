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
  // Phase 3: the clock-in / job-timer card was removed from Job Information.
  // Time tracking now lives on the Time tab only.
  it("is no longer shown on job detail", async () => {
    mockServer();
    localStorage.setItem("lepro_employee_id", "emp-levi");
    renderApp("#/job/" + encodeURIComponent(J1.id));
    // Job detail renders (find the job info card), but the timer card is gone.
    await screen.findByTestId("job-info-card");
    await waitFor(() =>
      expect(screen.queryByTestId("job-time-card")).not.toBeInTheDocument()
    );
    expect(screen.queryByTestId("job-clock-in-btn")).not.toBeInTheDocument();
  });
});