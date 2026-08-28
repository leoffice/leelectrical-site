// Read-only UI reactivity probe — synthetic scale data + pass/fail budgets.
// Never mutates live data: callers use mockServer / fixtures only.
import { CAL_SEARCH_PAGE } from "../components/CalendarSearchSheet.jsx";
import { searchCalendarEvents } from "./calendarLink.js";

/** Soft commit budget (ms) for opening a paged calendar picker in jsdom. */
export const CAL_OPEN_BUDGET_MS = 250;

/** Soft budget for typing one character into a deferred calendar search. */
export const CAL_TYPE_BUDGET_MS = 100;

/**
 * Build N calendar events spread across the current search window.
 * Pure / local — safe for tests; does not touch network or live KV.
 */
export function buildProbeCalendarEvents(count = 500, now = new Date()) {
  const year = now.getFullYear();
  const out = [];
  for (let i = 0; i < count; i++) {
    const month = (i % 12) + 1;
    const day = (i % 27) + 1;
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    out.push({
      id: `probe-ev-${i}`,
      summary: i % 7 === 0 ? `Probe visit ${i} — Acme` : `Site check ${i}`,
      start: `${year}-${mm}-${dd}T10:00`,
      location: `${100 + (i % 200)} Probe Ave`,
      description: i % 5 === 0 ? `customer Probe Co ${i}` : `notes ${i}`,
    });
  }
  return out;
}

/**
 * Build N lightweight jobs for read-only list / seed probes.
 */
export function buildProbeJobs(count = 200) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: `probe-J-${i}`,
      customer: i % 3 === 0 ? "Probe Co" : `Customer ${i}`,
      businessName: i % 3 === 0 ? "Probe Co" : `Customer ${i}`,
      title: `Job ${i}`,
      serviceAddress: `${100 + (i % 200)} Probe Ave`,
      address: `${100 + (i % 200)} Probe Ave`,
      paid: false,
      status: {},
      calEventId: i % 11 === 0 ? `probe-ev-${i}` : "",
    });
  }
  return out;
}

/**
 * Assert calendar search UI never paints more than one page of rows.
 * Returns { matchCount, paintedCap, pageSize }.
 */
export function calendarPaintCap(events, query = "") {
  const matches = searchCalendarEvents(events, query);
  return {
    matchCount: matches.length,
    paintedCap: Math.min(matches.length, CAL_SEARCH_PAGE),
    pageSize: CAL_SEARCH_PAGE,
  };
}

/**
 * Run a sync fn and return elapsed ms (performance.now when available).
 */
export function measureMs(fn) {
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? () => performance.now()
      : () => Date.now();
  const t0 = now();
  const result = fn();
  const ms = now() - t0;
  return { ms, result };
}

/** Probe checklist labels — surfaces that historically paused the UI. */
export const LAG_PROBE_TARGETS = [
  "Add a job → Choose from calendar (CalendarSearchSheet)",
  "Link from calendar (PickAppointmentSheet)",
  "Add a customer → Choose from calendar",
  "Estimate generator → From calendar",
  "Today tab appointment search results",
  "New job / Add customer form address seeds over all jobs+events",
  "Create job from appointment (CreateJobFromEventSheet suggestions)",
  "New job form → Create job (must close + navigate without awaiting QBO)",
  "Add customer Save & sync (must navigate to job, QBO in background)",
  "CustomerSearch / live QBO match while typing",
  "Save & Email / payment-link sheet (must close before network)",
];

/** Soft budget (ms) for collecting local address seeds at probe scale. */
export const ADDRESS_SEED_BUDGET_MS = 40;
