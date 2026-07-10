// Recurring invoice schedule helpers — QuickBooks RecurringTransaction payload.
import { todayStr } from "./format.js";

export const RECUR_INTERVALS = [
  { id: "Weekly", label: "Weekly" },
  { id: "Monthly", label: "Monthly" },
];

export function defaultRecurringState(job) {
  const start = todayStr();
  const day = Math.min(28, Math.max(1, parseInt(String(start).slice(-2), 10) || 1));
  const cust = String(job?.customer || job?.businessName || "Customer").trim();
  return {
    enabled: false,
    interval: "Monthly",
    startDate: start,
    dayOfMonth: day,
    dayOfWeek: 1,
    name: cust ? cust.slice(0, 28) + " — monthly" : "Recurring invoice",
    maxOccurrences: "",
  };
}

/** Build recurring block for create_recurring_invoice command payload. */
export function buildRecurringPayload(state, { send }) {
  if (!state?.enabled) return null;
  const interval = state.interval === "Weekly" ? "Weekly" : "Monthly";
  const out = {
    enabled: true,
    interval,
    startDate: state.startDate || todayStr(),
    name: String(state.name || "").trim().slice(0, 31),
    numInterval: 1,
  };
  if (interval === "Monthly") {
    out.dayOfMonth = Math.min(31, Math.max(1, parseInt(state.dayOfMonth, 10) || 1));
  } else {
    out.dayOfWeek = Math.min(7, Math.max(1, parseInt(state.dayOfWeek, 10) || 1));
  }
  const max = parseInt(state.maxOccurrences, 10);
  if (max > 0) out.maxOccurrences = max;
  if (send) out.sendOnCreate = true;
  return out;
}

export function recurringIdempotencyKey(jobId, lines, state) {
  const sig = [
    state.interval,
    state.startDate,
    state.dayOfMonth || "",
    state.dayOfWeek || "",
    (lines || []).map((ln) => ln.itemName).join(","),
  ].join(":");
  return "create_recurring_invoice:" + jobId + ":" + sig.slice(0, 60);
}