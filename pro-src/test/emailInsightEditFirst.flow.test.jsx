// @vitest-environment jsdom
// Edit first on an inspection email card must open the appointment editor —
// never call dismiss() (that hid the card with no way back).
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { clearPromptWorkPause } from "../src/lib/followUpReminders.js";
import { __forceEmailInsightSurfaceForTest } from "../src/components/EmailInsightPrompts.jsx";
import { mockServer, renderApp } from "./helpers.jsx";

const JOB = {
  id: "qbo-est-201963",
  customer: "Goodness",
  businessName: "Goodness",
  title: "1337 President St",
  address: "1337 PRESIDENT ST, BROOKLYN, NY 11213",
  serviceAddress: "1337 PRESIDENT ST, BROOKLYN, NY 11213",
  email: "goodness@example.com",
  phone: "718-555-0100",
  paid: false,
  status: {},
};

const INSIGHT = {
  id: "ei-edit-first-test",
  status: "pending",
  outcome: "scheduled",
  appointmentType: "inspection",
  agency: "coned",
  jobId: "qbo-est-201963",
  dateTime: "2026-08-31T10:30",
  exactDateTime: "2026-08-31T10:30",
  endDateTime: "2026-08-31T11:30",
  address: "1337 PRESIDENT ST, BROOKLYN, NY 11213",
  lead: "From Con Edison: Final Inspection at 1337 PRESIDENT ST on Mon Aug 31, 2026 10:30 AM (MC-941580)",
  summary: "Final Inspection — Goodness",
  caseNumber: "MC-941580",
  source: {
    type: "email",
    from: "CPMS.noreply@coned.com",
    fromLabel: "Con Edison",
    subject: "Final Inspection Scheduled — MC-941580",
  },
  emailSnippet: "Your Final Inspection is scheduled for August 31, 2026 at 10:30 AM.",
  proposedActions: [
    { key: "calendar", label: "Add to calendar", enabled: true, defaultOn: true },
    { key: "remind_1d", label: "Reminder 1 day before", enabled: true, defaultOn: true },
    { key: "remind_1h", label: "Reminder 1 hour before", enabled: true, defaultOn: true },
    { key: "guest_email", label: "Invite customer by email", enabled: true, defaultOn: false },
  ],
};

beforeEach(() => {
  vi.setSystemTime(new Date("2026-08-26T10:00:00"));
  clearPromptWorkPause();
  __forceEmailInsightSurfaceForTest(true);
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
  window.location.hash = "#/";
  clearPromptWorkPause();
  __forceEmailInsightSurfaceForTest(false);
});

describe("email insight Edit first", () => {
  it("opens the appointment editor and restores Approve on close (does not vanish)", async () => {
    mockServer({
      jobs: [JSON.parse(JSON.stringify(JOB))],
      events: [],
      emailInsights: [JSON.parse(JSON.stringify(INSIGHT))],
    });
    renderApp("#/");

    await screen.findByTestId("email-insight-sheet");
    expect(screen.getByTestId("email-insight-edit")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("email-insight-edit"));

    await waitFor(() => {
      expect(screen.queryByTestId("email-insight-sheet")).not.toBeInTheDocument();
      expect(screen.getByTestId("appt-save")).toBeInTheDocument();
    });

    // Guest invite stays off unless Approve checked it (defaultOn:false).
    const notify = screen.getByTestId("notify-customer-toggle");
    expect(notify).not.toBeChecked();

    // Close editor → Approve card must come back (not stay hidden).
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await screen.findByTestId("email-insight-sheet");
    expect(screen.getByTestId("email-insight-approve")).toBeInTheDocument();
  }, 20000);
});
