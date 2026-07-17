// Shared login popup budget — reminders AND name-sort ("Same customer?") cards
// share one cap of five so Levi is never buried under endless cards.
// Levi 2026-07-17: five-reminder limit also includes sorting names.

export const PROMPT_QUEUE_CAP = 5;

export const OVERFLOW_REMINDER_MESSAGE =
  "There are more things to do. Please go to the reminders tab and choose the top five to give me the most pressing.";

const BUDGET_KEY = "lepro_popup_budget";

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readBudget(now = new Date()) {
  const day = todayKey(now);
  try {
    const raw = localStorage.getItem(BUDGET_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (v && v.day === day) {
      return {
        day,
        reminderClaimed: Math.max(0, Math.round(Number(v.reminderClaimed) || 0)),
        nameSortShown: Math.max(0, Math.round(Number(v.nameSortShown) || 0)),
        pairIds: Array.isArray(v.pairIds) ? v.pairIds.map(String) : [],
      };
    }
  } catch {
    /* ignore */
  }
  return { day, reminderClaimed: 0, nameSortShown: 0, pairIds: [] };
}

function writeBudget(budget) {
  try {
    localStorage.setItem(BUDGET_KEY, JSON.stringify(budget));
  } catch {
    /* ignore */
  }
}

/** How many reminder slots today's shared budget has reserved (≤5). */
export function reminderSlotsClaimed(now = new Date()) {
  return Math.min(PROMPT_QUEUE_CAP, readBudget(now).reminderClaimed);
}

/**
 * Reserve reminder slots for today (monotonic — only grows within the day).
 * Call whenever the login prompt queue is built; pass uncapped-or-capped real count.
 */
export function claimReminderSlots(count, now = new Date()) {
  const n = Math.min(PROMPT_QUEUE_CAP, Math.max(0, Math.round(Number(count) || 0)));
  const budget = readBudget(now);
  if (n <= budget.reminderClaimed) return budget.reminderClaimed;
  budget.reminderClaimed = n;
  writeBudget(budget);
  return budget.reminderClaimed;
}

/** How many name-sort cards already used today's shared budget. */
export function nameSortShownToday(now = new Date()) {
  return readBudget(now).nameSortShown;
}

/**
 * Slots left for name-sort popups under the shared five-card cap.
 * Reminder cards claim first for the day; name-sort fills only what is left.
 */
export function nameSortSlotsRemaining(now = new Date()) {
  const budget = readBudget(now);
  const remClaim = Math.min(PROMPT_QUEUE_CAP, budget.reminderClaimed);
  return Math.max(0, PROMPT_QUEUE_CAP - remClaim - budget.nameSortShown);
}

/** True when another "Same customer?" card may open today. */
export function canShowNameSortPrompt(now = new Date()) {
  return nameSortSlotsRemaining(now) > 0;
}

/**
 * Consume one name-sort slot for a pair (idempotent per pair per day).
 * Returns true if allowed (newly consumed or already counted for this pair).
 */
export function consumeNameSortSlot(pairId, now = new Date()) {
  const id = String(pairId || "").trim();
  const budget = readBudget(now);
  if (id && budget.pairIds.includes(id)) return true;
  if (nameSortSlotsRemaining(now) <= 0) return false;
  budget.nameSortShown += 1;
  if (id) budget.pairIds.push(id);
  writeBudget(budget);
  return true;
}

/** Test helper — clear today's shared popup budget. */
export function resetPopupBudget() {
  try {
    localStorage.removeItem(BUDGET_KEY);
  } catch {
    /* ignore */
  }
}

/** @deprecated use resetPopupBudget */
export function resetNameSortBudget() {
  resetPopupBudget();
}
