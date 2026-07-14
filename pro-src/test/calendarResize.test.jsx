// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp, EV } from "./helpers.jsx";

const CAL_HEIGHT_KEY = "lepro_calendar_height_v1";
const WEEKDAY = "2026-07-10"; // Friday — week grid includes this day

describe("calendar resize", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(WEEKDAY + "T12:00:00"));
    localStorage.removeItem(CAL_HEIGHT_KEY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads saved calendar height on the Today view", async () => {
    mockServer({ events: [{ ...EV, start: WEEKDAY + "T10:00" }] });
    localStorage.setItem(CAL_HEIGHT_KEY, "320");
    renderApp("#/today");
    await screen.findByTestId("week-calendar");
    const events = await screen.findByTestId("week-day-events");
    expect(events.style.maxHeight).toBe("320px");
  });

  it("resizes when dragging the handle and persists the choice", async () => {
    mockServer({ events: [{ ...EV, start: WEEKDAY + "T10:00" }] });
    renderApp("#/today");
    await screen.findByTestId("week-calendar");
    const handle = screen.getByTestId("calendar-resize-handle");
    const events = screen.getByTestId("week-day-events");

    fireEvent.pointerDown(handle, { clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 260, pointerId: 1 });
    fireEvent.pointerUp(window, { clientY: 260, pointerId: 1 });

    expect(events.style.maxHeight).toBe("260px");
    expect(localStorage.getItem(CAL_HEIGHT_KEY)).toBe("260");

    fireEvent.doubleClick(handle);
    expect(events.style.maxHeight).toBe("200px");
    expect(localStorage.getItem(CAL_HEIGHT_KEY)).toBe("200");
  });
});