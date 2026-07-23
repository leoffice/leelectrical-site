// QuickBooks backend sync failures → short bullets for the in-app popup.
// Dismiss / retry / report-to-developers payloads live here (pure, testable).

export const QBO_SYNC_ISSUE_TYPES = new Set([
  "create_invoice",
  "update_invoice",
  "create_estimate",
  "update_estimate",
  "create_recurring_invoice",
  "create_customer",
  "update_customer",
  "customer_sync",
  "import_customer",
  "fetch_payments",
  "record_payment",
  "void_payment",
  "fetch_pdf",
  "send_invoice",
  "send_estimate",
  "refresh_local_db",
  "payment_link",
  "attach_to_invoice",
  "attach_to_estimate",
]);

const SEEN_KEY = "le-pro-qbo-sync-issue-seen";
const DISMISS_KEY = "le-pro-qbo-sync-issue-dismissed";
const MAX_BULLETS = 6;
const RECENT_MS = 48 * 60 * 60 * 1000;

const TYPE_LABELS = {
  create_invoice: "Creating invoice",
  update_invoice: "Updating invoice",
  create_estimate: "Creating estimate",
  update_estimate: "Updating estimate",
  create_recurring_invoice: "Creating recurring invoice",
  create_customer: "Creating customer",
  update_customer: "Updating customer",
  customer_sync: "Matching customer",
  import_customer: "Importing customer jobs",
  fetch_payments: "Pulling payments",
  record_payment: "Recording payment",
  void_payment: "Voiding payment",
  fetch_pdf: "Fetching PDF",
  send_invoice: "Sending invoice",
  send_estimate: "Sending estimate",
  refresh_local_db: "Updating office files",
  payment_link: "Payment link",
  attach_to_invoice: "Attaching to invoice",
  attach_to_estimate: "Attaching to estimate",
};

/** Short plain-language cause — no raw stack / JSON dumps. */
export function shortErrorBullet(err) {
  const s = String(err || "").trim();
  if (!s) return "Unknown QuickBooks error";
  const low = s.toLowerCase();
  if (low.includes("pdfb64") || low.includes("needs pdf")) return "PDF missing — open the document and send again";
  if (low.includes("no_customer") || low.includes("link this customer") || low.includes("missing customer"))
    return "Customer not linked to QuickBooks";
  if (low.includes("duplicate") || low.includes("6240") || low.includes("already exists"))
    return "Duplicate name in QuickBooks";
  if (low.includes("5010") || low.includes("stale object")) return "QuickBooks was busy (stale record)";
  if (low.includes("403") || low.includes("forbidden")) return "Server blocked a file upload";
  if (low.includes("404") || low.includes("not_found") || low.includes("no estimate") || low.includes("no invoice"))
    return "Document not found in QuickBooks";
  if (low.includes("payment site") || low.includes("paymentsite") || low.includes("not provisioned"))
    return "Payment page not set up";
  if (low.includes("timeout") || low.includes("timed out")) return "QuickBooks timed out";
  if (low.includes("auth") || low.includes("token") || low.includes("unauthorized") || low.includes("401"))
    return "QuickBooks login needs refresh";
  if (low.includes("rate") || low.includes("throttle") || low.includes("429")) return "QuickBooks rate limit";
  if (low.includes("network") || low.includes("econn") || low.includes("fetch failed")) return "Network error talking to QuickBooks";
  // First line, strip noise, cap length
  let line = s.split(/[\n\r]/)[0].replace(/^QBOError:\s*/i, "").replace(/^HTTP\s+\d+:\s*/i, "").trim();
  if (line.length > 90) line = line.slice(0, 87) + "…";
  return line || "Unknown QuickBooks error";
}

export function typeLabel(type) {
  const t = String(type || "").trim();
  return TYPE_LABELS[t] || t.replace(/_/g, " ") || "Sync action";
}

export function isQboSyncCommand(cmd) {
  if (!cmd || !cmd.type) return false;
  return QBO_SYNC_ISSUE_TYPES.has(String(cmd.type));
}

export function isRecentFailedQboCommand(cmd, now = Date.now()) {
  if (!isQboSyncCommand(cmd)) return false;
  if (String(cmd.status || "") !== "failed") return false;
  const ts = Number(cmd.updatedAt || cmd.createdAt || cmd.escalatedAt || 0) || 0;
  if (ts && now - ts > RECENT_MS) return false;
  return true;
}

/**
 * Build unique short bullets from failed QBO commands.
 * @returns {{ bullets: string[], commandIds: string[], commands: object[] }}
 */
export function collectQboSyncIssues(commands, { now = Date.now(), dismissedIds = new Set(), max = MAX_BULLETS } = {}) {
  const failed = (commands || []).filter(
    (c) => c?.id && isRecentFailedQboCommand(c, now) && !dismissedIds.has(String(c.id))
  );
  // Newest first
  failed.sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));

  const seenBullet = new Set();
  const bullets = [];
  const commandIds = [];
  const kept = [];

  for (const c of failed) {
    const label = typeLabel(c.type);
    const cause = shortErrorBullet(c.error);
    const doc =
      c.payload?.invoiceNo || c.payload?.estimateNo
        ? " #" + String(c.payload.invoiceNo || c.payload.estimateNo)
        : "";
    const jobBit = c.jobId && String(c.jobId).startsWith("qbo-") ? " · " + String(c.jobId).replace(/^qbo-/, "job ") : "";
    let bullet = label + doc + " — " + cause + jobBit;
    if (bullet.length > 120) bullet = bullet.slice(0, 117) + "…";
    // Dedupe identical bullets (same type + cause)
    const key = label + "|" + cause;
    if (seenBullet.has(key)) {
      commandIds.push(String(c.id));
      kept.push(c);
      continue;
    }
    if (bullets.length >= max) {
      commandIds.push(String(c.id));
      kept.push(c);
      continue;
    }
    seenBullet.add(key);
    bullets.push(bullet);
    commandIds.push(String(c.id));
    kept.push(c);
  }

  if (failed.length > bullets.length && bullets.length === max) {
    // Cap reached but more failures exist
    const extra = failed.length - max;
    if (extra > 0 && !bullets[bullets.length - 1]?.includes("more")) {
      /* keep bullets clean — extra count shown in UI separately */
    }
  }

  return {
    bullets,
    commandIds: [...new Set(commandIds)],
    commands: kept,
    totalFailed: failed.length,
  };
}

export function loadDismissedIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  } catch {
    return new Set();
  }
}

export function persistDismissedIds(ids) {
  try {
    const arr = [...ids].slice(-200);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

export function dismissIssueIds(ids, existing = loadDismissedIds()) {
  const next = new Set(existing);
  for (const id of ids || []) next.add(String(id));
  persistDismissedIds(next);
  return next;
}

export function loadReportedIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  } catch {
    return new Set();
  }
}

export function persistReportedIds(ids) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    /* ignore */
  }
}

export function markReportedIds(ids, existing = loadReportedIds()) {
  const next = new Set(existing);
  for (const id of ids || []) next.add(String(id));
  persistReportedIds(next);
  return next;
}

/** Payload for command bus type report_qbo_sync_issue */
export function buildReportPayload({ bullets, commandIds, totalFailed, reportedAt = Date.now() } = {}) {
  return {
    bullets: (bullets || []).slice(0, MAX_BULLETS),
    commandIds: (commandIds || []).map(String),
    totalFailed: Number(totalFailed) || (commandIds || []).length,
    reportedAt,
    source: "le-pro",
    tag: "Levi app troubleshooting",
  };
}

export const QBO_SYNC_ISSUE_TITLE = "QuickBooks backend is having issues synchronizing";
export const QBO_SYNC_ISSUE_TAG = "Levi app troubleshooting";
