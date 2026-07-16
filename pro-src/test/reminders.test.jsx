// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";
import {
  GLOBAL_PAUSE_KEY,
  buildReminderList,
  buildPromptQueue,
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

  it("lists expandable reminders and supports Don't remind me", async () => {
    mockServer({ jobs: [unsentJob()], events: [] });
    const user = userEvent.setup();
    renderApp("#/reminders");
    expect(await screen.findByTestId("reminders-view")).toBeInTheDocument();
    await user.click(screen.getByTestId("reminder-headline-unsent:J-9:invoice"));
    await user.click(screen.getByTestId("reminder-dont-remind"));
    await waitFor(() => expect(screen.getByTestId("reminders-empty")).toBeInTheDocument());
  });

  it("pause bar on other tabs hides pop-up queue", async () => {
    mockServer({ jobs: [unsentJob()], events: [] });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Bob");
    await user.click(screen.getByTestId("pause-reminders-btn"));
    await user.click(screen.getByTestId("pause-preset-15"));
    expect(screen.queryByTestId("unsent-doc-open")).not.toBeInTheDocument();
  });
});