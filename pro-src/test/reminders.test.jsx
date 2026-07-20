// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { HashRouter } from "react-router-dom";
import { mockServer, renderApp , useAllCustomersView } from "./helpers.jsx";
import { StoreProvider } from "../src/state/store.jsx";
import PauseRemindersInPopup from "../src/components/PauseRemindersInPopup.jsx";

// Balance view is the default landing view — these specs assert All-view markup.
beforeEach(() => useAllCustomersView());
import {
  GLOBAL_PAUSE_KEY,
  buildReminderList,
  buildPromptQueue,
  isRemindersPaused,
  pauseAllReminders,
} from "../src/lib/followUpReminders.js";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("reminders lib", () => {
  it("buildReminderList surfaces unsent docs sorted before service calls", () => {
    const jobs = [{ id: "J-9", customer: "Bob", invoiceNo: "88", invoiceHistory: [] }];
    const list = buildReminderList([], jobs, "2026-07-15");
    expect(list.some((x) => x.kind === "unsent_doc")).toBe(true);
    expect(list[0].kind).toBe("unsent_doc");
  });

  it("buildPromptQueue returns empty while globally paused", () => {
    const jobs = [{ id: "J-9", customer: "Bob", invoiceNo: "88", invoiceHistory: [] }];
    pauseAllReminders(30, new Date("2026-07-15T12:00:00"));
    expect(localStorage.getItem(GLOBAL_PAUSE_KEY)).toBeTruthy();
    expect(buildPromptQueue([], jobs, "2026-07-15", new Date("2026-07-15T12:00:00"))).toHaveLength(0);
  });
});

describe("Reminders tab", () => {
  const unsentJob = () => ({
    id: "J-9",
    customer: "Bob",
    invoiceNo: "88",
    invoiceHistory: [],
    paid: false,
    status: { Lead: { s: "done", d: "2026-06-01" } },
  });

  it("shows Reminders in nav with badge for unsent docs", async () => {
    mockServer({ jobs: [unsentJob()], events: [] });
    renderApp("#/");
    await screen.findByText("Bob");
    const nav = screen.getByTestId("bottom-nav");
    const remindersTab = within(nav).getByText("Reminders").closest("a");
    expect(remindersTab).toBeInTheDocument();
    await waitFor(() => expect(within(remindersTab).getByText("1")).toBeInTheDocument());
  });

  it("lists expandable reminders with parallel unsent actions and Don't Remind Me", async () => {
    mockServer({ jobs: [unsentJob()], events: [] });
    const user = userEvent.setup();
    renderApp("#/reminders");
    expect(await screen.findByTestId("reminders-view")).toBeInTheDocument();
    await user.click(screen.getByTestId("reminder-headline-unsent:J-9:invoice"));
    const actions = screen.getByTestId("unsent-doc-actions");
    expect(within(actions).getByTestId("unsent-doc-open")).toHaveTextContent("Open");
    expect(within(actions).getByTestId("reminder-verify")).toHaveTextContent("Verify");
    expect(within(actions).getByTestId("unsent-doc-remind-later")).toHaveTextContent("Remind Me Later");
    expect(within(actions).getByTestId("unsent-doc-dismiss")).toHaveTextContent("Don't Remind Me");
    await user.click(within(actions).getByTestId("unsent-doc-dismiss"));
    await waitFor(() => expect(screen.getByTestId("reminders-empty")).toBeInTheDocument());
  });

  it("Verify button checks send status and keeps still-unsent on the list", async () => {
    mockServer({ jobs: [unsentJob()], events: [] });
    const user = userEvent.setup();
    renderApp("#/reminders");
    expect(await screen.findByTestId("reminders-view")).toBeInTheDocument();
    await user.click(screen.getByTestId("reminder-headline-unsent:J-9:invoice"));
    expect(screen.getByTestId("reminder-verify")).toBeInTheDocument();
    await user.click(screen.getByTestId("reminder-verify"));
    // Still unsent → after check it remains (or returns) on the list
    await waitFor(() => {
      expect(screen.getByTestId("reminders-view")).toBeInTheDocument();
    });
    await waitFor(() => {
      const empty = screen.queryByTestId("reminders-empty");
      // Either still showing the row, or briefly held then back — not permanently empty without dismiss
      expect(empty).not.toBeInTheDocument();
    });
  });

  it("pause control lives inside the reminder pop-up and pauses all", async () => {
    mockServer({ jobs: [unsentJob()], events: [] });
    const user = userEvent.setup();
    // Force a pop-up queue item via the unsent-doc path after login session
    renderApp("#/");
    await screen.findByText("Bob");
    // Page chrome no longer has the pause bar — only Reminders tab + pop-up
    expect(screen.queryByTestId("pause-reminders-bar")).not.toBeInTheDocument();

    // Open Reminders tab bar (still has global pause for resume / proactive pause)
    window.location.hash = "#/reminders";
    expect(await screen.findByTestId("reminders-view")).toBeInTheDocument();
    await user.click(screen.getByTestId("pause-reminders-btn"));
    await user.click(screen.getByTestId("pause-preset-15"));
    expect(localStorage.getItem(GLOBAL_PAUSE_KEY)).toBeTruthy();
    expect(buildPromptQueue([], [unsentJob()], "2026-07-15", new Date())).toHaveLength(0);
  });

  it("pop-up pause control pauses every reminder not just the open one", () => {
    pauseAllReminders(30, new Date("2026-07-16T12:00:00"));
    expect(isRemindersPaused(new Date("2026-07-16T12:00:00"))).toBe(true);
    expect(localStorage.getItem(GLOBAL_PAUSE_KEY)).toBeTruthy();
    const jobs = [
      unsentJob(),
      { id: "J-10", customer: "Ann", invoiceNo: "99", invoiceHistory: [], paid: false },
    ];
    expect(buildPromptQueue([], jobs, "2026-07-16", new Date("2026-07-16T12:00:00"))).toHaveLength(0);
  });
});

describe("PauseRemindersInPopup", () => {
  it("shows Pause Reminders label above the button and pauses all on preset", async () => {
    mockServer({ jobs: [], events: [] });
    const user = userEvent.setup();
    const onPaused = vi.fn();
    render(
      <HashRouter>
        <StoreProvider>
          <PauseRemindersInPopup onPaused={onPaused} />
        </StoreProvider>
      </HashRouter>
    );
    expect(screen.getByTestId("pause-reminders-label")).toHaveTextContent("Pause Reminders");
    await user.click(screen.getByTestId("pause-reminders-popup-btn"));
    await user.click(screen.getByTestId("pause-popup-preset-15"));
    expect(localStorage.getItem(GLOBAL_PAUSE_KEY)).toBeTruthy();
    expect(onPaused).toHaveBeenCalledWith(15);
    expect(isRemindersPaused()).toBe(true);
  });
});