// @vitest-environment jsdom
// UI reactivity probe — real-shaped data at scale, ZERO mutations.
// Opens calendar / add flows and asserts paint stays paged + snappy.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp, pinCalWeek } from "./helpers.jsx";
import { CAL_SEARCH_PAGE } from "../src/components/CalendarSearchSheet.jsx";
import {
  buildProbeCalendarEvents,
  buildProbeJobs,
  calendarPaintCap,
  measureMs,
  CAL_OPEN_BUDGET_MS,
  ADDRESS_SEED_BUDGET_MS,
  LAG_PROBE_TARGETS,
} from "../src/lib/uiReactivityProbe.js";
import { collectAddressSeeds } from "../src/lib/addressComplete.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("UI reactivity probe — calendar scale (read-only)", () => {
  it("lists the lag surfaces under probe", () => {
    expect(LAG_PROBE_TARGETS.length).toBeGreaterThanOrEqual(5);
  });

  it("calendarPaintCap never exceeds one page even with 500 events", () => {
    pinCalWeek();
    const events = buildProbeCalendarEvents(500);
    const { matchCount, paintedCap, pageSize } = calendarPaintCap(events, "");
    expect(matchCount).toBeGreaterThan(CAL_SEARCH_PAGE);
    expect(paintedCap).toBe(pageSize);
    expect(paintedCap).toBeLessThanOrEqual(CAL_SEARCH_PAGE);
  });

  it("Add job → Choose from calendar paints ≤ page rows and enqueues nothing", async () => {
    pinCalWeek();
    const events = buildProbeCalendarEvents(500);
    const jobs = buildProbeJobs(200);
    const srv = mockServer({ events, jobs });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByTestId("fab-add");

    await user.click(screen.getByTestId("fab-add"));
    await user.click(screen.getByText("Add a job"));

    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    await user.click(screen.getByText("Choose from calendar"));
    await screen.findByTestId("cal-search-input");
    const openMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;

    const results = screen.getByTestId("cal-search-results");
    const rows = within(results).getAllByRole("button").filter((b) => !/load more/i.test(b.textContent || ""));
    expect(rows.length).toBeLessThanOrEqual(CAL_SEARCH_PAGE);
    expect(screen.getByTestId("cal-search-load-more")).toBeInTheDocument();

    // Read-only: opening the picker must not enqueue create/link/upsert.
    expect(srv.enqueued("calendar_upsert")).toHaveLength(0);
    expect(srv.enqueued("create_customer")).toHaveLength(0);
    expect(Object.keys(srv.state.ov).filter((k) => k.startsWith("local-"))).toHaveLength(0);

    // Soft budget — jsdom is slower than device; still catch multi-second freezes.
    expect(openMs, `calendar open took ${openMs}ms (budget ${CAL_OPEN_BUDGET_MS * 8})`).toBeLessThan(
      CAL_OPEN_BUDGET_MS * 8
    );
  });

  it("Add customer menu keeps Choose from calendar first; form also exposes it on top", async () => {
    mockServer({ events: buildProbeCalendarEvents(20) });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await user.click(screen.getByTestId("fab-add"));
    await user.click(screen.getByText("Add a customer"));
    const menu = screen.getByRole("dialog");
    const opts = within(menu).getAllByRole("button");
    const calIdx = opts.findIndex((b) => /choose from calendar/i.test(b.textContent || ""));
    const manIdx = opts.findIndex((b) => /enter manually/i.test(b.textContent || ""));
    expect(calIdx).toBeGreaterThanOrEqual(0);
    expect(manIdx).toBeGreaterThan(calIdx);

    await user.click(screen.getByTestId("addcustomer-manual"));
    expect(screen.getByTestId("addcustomer-from-calendar-top")).toBeInTheDocument();
  });

  it("calendar → customer autosaves (no second Save) and does not leave a stuck form", async () => {
    pinCalWeek();
    const events = [
      {
        id: "ev-cust-auto",
        summary: "Service call — Auto Cust",
        start: "2026-07-10T11:00",
        location: "88 Auto St",
        description: "customer Auto Cust phone: 718-555-7777",
      },
    ];
    const srv = mockServer({ events });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await user.click(screen.getByTestId("fab-add"));
    await user.click(screen.getByText("Add a customer"));
    await user.click(screen.getByTestId("addcustomer-from-calendar"));
    await user.click(await screen.findByText("Service call — Auto Cust"));

    // Never ask for a second Save — either Creating… or already on the job.
    expect(screen.queryByTestId("addcustomer-save-sync")).not.toBeInTheDocument();

    // Lands on the new job (customer context on the job).
    expect(await screen.findByTestId("detail-pane")).toBeInTheDocument();
    const key = Object.keys(srv.state.ov).find((k) => k.startsWith("local-"));
    expect(key).toBeTruthy();
    expect(srv.state.ov[key].customer).toMatch(/Auto Cust/i);
    expect(srv.state.ov[key].calEventId).toBe("ev-cust-auto");
  });

  it("address seed scan stays under budget at probe scale (read-only)", () => {
    const events = buildProbeCalendarEvents(500);
    const jobs = buildProbeJobs(400);
    const { ms, result } = measureMs(() => collectAddressSeeds(jobs, events));
    expect(result.length).toBeGreaterThan(50);
    expect(ms, `collectAddressSeeds took ${ms}ms (budget ${ADDRESS_SEED_BUDGET_MS * 8})`).toBeLessThan(
      ADDRESS_SEED_BUDGET_MS * 8
    );
  });

  it("Add job → calendar → Create job closes sheet, opens job, no QBO wait", async () => {
    pinCalWeek();
    const events = [
      {
        id: "ev-job-freeze",
        summary: "Walkthrough — Freeze Check Co",
        start: "2026-07-11T14:00",
        location: "12 Probe Ave",
        description: "customer Freeze Check Co",
      },
    ];
    const srv = mockServer({
      events,
      // Slow QBO must not block Create job close/nav.
      searchCustomers: () =>
        new Promise((resolve) => setTimeout(() => resolve([{ id: "Q-1", name: "Freeze Check Co" }]), 2500)),
    });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByTestId("fab-add");
    await user.click(screen.getByTestId("fab-add"));
    await user.click(screen.getByText("Add a job"));
    await user.click(screen.getByTestId("job-from-calendar"));
    await user.click(await screen.findByText("Walkthrough — Freeze Check Co"));
    await screen.findByTestId("newjob-business-name");

    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    await user.click(screen.getByRole("button", { name: /create job/i }));
    expect(await screen.findByTestId("detail-pane")).toBeInTheDocument();
    const navMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;

    const key = Object.keys(srv.state.ov).find((k) => k.startsWith("local-"));
    expect(key).toBeTruthy();
    // QBO create may enqueue in the background — must not delay close/nav.
    // Must feel instant — not wait on the 2.5s QBO search.
    expect(navMs, `Create job → job detail took ${navMs}ms`).toBeLessThan(1500);
  });
});
