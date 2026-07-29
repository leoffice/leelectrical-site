/**
 * Delayed welcome from Levi (admin/developer) after first open of the app.
 * ~20 minutes later (or on the next open after that), a one-time chat message
 * appears so new users know they can message for help and feedback.
 */
const FIRST_OPEN_KEY = "le-pro-first-open-at";
const WELCOME_SENT_KEY = "le-pro-admin-welcome-sent";
/** Delay before the welcome lands (ms). */
export const ADMIN_WELCOME_DELAY_MS = 20 * 60 * 1000;

export const ADMIN_WELCOME_TEXT =
  "Welcome to the app — this is Levi, the developer. If you have any questions, don't hesitate to message me here and I'll try to respond. We can implement changes as quickly as possible, and we're happy to hear feedback — positive or negative.";

function storageGet(key) {
  try {
    if (typeof localStorage === "undefined") return "";
    return String(localStorage.getItem(key) || "");
  } catch {
    return "";
  }
}

function storageSet(key, value) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Stamp first open once. Safe to call every session. */
export function ensureFirstOpenStamp(now = Date.now()) {
  const existing = Number(storageGet(FIRST_OPEN_KEY));
  if (Number.isFinite(existing) && existing > 0) return existing;
  storageSet(FIRST_OPEN_KEY, String(now));
  return now;
}

export function firstOpenAt() {
  const n = Number(storageGet(FIRST_OPEN_KEY));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function adminWelcomeAlreadySent() {
  return storageGet(WELCOME_SENT_KEY) === "1";
}

export function markAdminWelcomeSent() {
  storageSet(WELCOME_SENT_KEY, "1");
}

/**
 * True when the delayed welcome should be injected once.
 * @param {number} [now]
 */
export function shouldDeliverAdminWelcome(now = Date.now()) {
  if (adminWelcomeAlreadySent()) return false;
  const first = ensureFirstOpenStamp(now);
  return now - first >= ADMIN_WELCOME_DELAY_MS;
}

/** Stable id so polls don't double-count. */
export function adminWelcomeMessageId() {
  return "admin-welcome-levi-v1";
}

export function buildAdminWelcomeMessage(now = Date.now()) {
  return {
    id: adminWelcomeMessageId(),
    who: "admin",
    text: ADMIN_WELCOME_TEXT,
    status: "",
    ts: now,
    _local: true,
    _adminWelcome: true,
  };
}
