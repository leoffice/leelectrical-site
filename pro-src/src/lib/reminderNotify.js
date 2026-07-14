// Browser notifications for due appointment reminders (tab open, may be hidden).

export function askReminderNotifyPermission() {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    const p = Notification.requestPermission(() => {});
    if (p && p.catch) p.catch(() => {});
  } catch {
    /* unsupported */
  }
}

export function isTabHidden() {
  return typeof document !== "undefined" && !!document.hidden;
}

/** Ping Levi when a reminder is due and the app tab is in the background. */
export function notifyReminderDue({ title, body, eventId }) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!isTabHidden()) return;
    const n = new Notification(title || "Reminder", {
      body: String(body || "").slice(0, 160),
      tag: "le-pro-reminder-" + String(eventId || "due"),
    });
    n.onclick = () => {
      try {
        window.focus();
        n.close();
      } catch {
        /* ignore */
      }
    };
  } catch {
    /* unsupported */
  }
}