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

describe("Add flow — calendar search + add appointment", () => {
  it("Choose from calendar uses searchable full calendar list", async () => {
    mockServer({
      events: [
        { id: "ev-old", summary: "Old job", start: "2026-01-15T10:00", location: "1 Main" },
        { id: "ev-new", summary: "Brooklyn panel", start: "2026-08-01T10:00", location: "55 Elm St" },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await user.click(screen.getByTestId("fab-add"));
    await user.click(screen.getByText("Add a job"));
    await user.click(screen.getByText("Choose from calendar"));

    expect(screen.getByTestId("cal-search-input")).toBeInTheDocument();
    expect(screen.getByText("Old job")).toBeInTheDocument();
    expect(screen.getByText("Brooklyn panel")).toBeInTheDocument();

    await user.type(screen.getByTestId("cal-search-input"), "elm");
    expect(screen.queryByText("Old job")).not.toBeInTheDocument();
    expect(screen.getByText("Brooklyn panel")).toBeInTheDocument();
  });

  it("Add an appointment opens booking sheet (not calendar job picker)", async () => {
    mockServer();
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await user.click(screen.getByTestId("fab-add"));
    await user.click(screen.getByText("Add a job"));
    await user.click(screen.getByText("Add an appointment"));

    expect(screen.getByTestId("appt-week-calendar")).toBeInTheDocument();
    expect(screen.getByTestId("appt-datetime")).toBeInTheDocument();
    expect(screen.queryByTestId("cal-search-input")).not.toBeInTheDocument();
  });

  it("Add appointment from job detail pre-fills customer and guest email", async () => {
    const srv = mockServer({ jobs: [JSON.parse(JSON.stringify(J1))] });
    const user = userEvent.setup();
    renderApp("#/job/J-1");
    await screen.findByTestId("detail-pane");

    await user.click(screen.getByTestId("fab-add"));
    await user.click(screen.getByText("Add a job"));
    await user.click(screen.getByText("Add an appointment"));

    expect(screen.getByText(/Add appointment — Peretz Chein/)).toBeInTheDocument();
    expect(screen.getByLabelText("Appointment title")).toHaveValue("Panel upgrade — Peretz Chein");
    expect(screen.getByLabelText("Location")).toHaveValue("123 Main St, Brooklyn");
    expect(screen.getByTestId("guest-email")).toHaveValue("p@x.com");

    await user.click(screen.getByTestId("appt-save"));
    await waitFor(() => expect(srv.enqueued("calendar_upsert")).toHaveLength(1));
    const cmd = srv.enqueued("calendar_upsert")[0];
    expect(cmd.payload.guests).toEqual(["p@x.com"]);
    expect(cmd.payload.summary).toContain("Peretz Chein");
  });
});