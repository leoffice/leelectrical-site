// Coordinates invoice/estimate send feedback so the confirm sheet and the global
// SendInvoiceWatcher never both toast the same send (the "Send failed" banner +
// "emailed to customer" success toast contradiction). The confirm sheet OWNS the
// commands it is actively awaiting; the watcher skips those. Also: await a queued
// send command to its terminal state, and auto-report a hard failure to the
// monitored Dispatch dev-task queue.

const _tracked = new Set();

/** Mark a command id as owned by an open confirm sheet (watcher stays quiet). */
export function markSendTracked(id) {
  if (id) _tracked.add(String(id));
}
export function isSendTracked(id) {
  return _tracked.has(String(id));
}
/** Release once the sheet has shown the outcome (kept simple: never auto-expires). */
export function releaseSendTracked(id) {
  _tracked.delete(String(id));
}

/**
 * Poll the command bus until `id` reaches a terminal status (done/failed) or the
 * timeout elapses. Returns { status: "done"|"failed"|"pending", error, cmd }.
 * A queued local send lands via office Gmail in ~10s; QBO sends are similar.
 */
export async function awaitCommandTerminal(api, id, { timeoutMs = 90000, intervalMs = 2000 } = {}) {
  const key = String(id || "");
  if (!key || typeof api?.listCommands !== "function") {
    return { status: "pending", error: "", cmd: null };
  }
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let list = [];
    try {
      list = await api.listCommands();
    } catch {
      /* transient — retry on the next tick */
    }
    const cmd = (list || []).find((c) => String(c?.id) === key);
    if (cmd && (cmd.status === "done" || cmd.status === "failed")) {
      return { status: cmd.status, error: String(cmd.error || ""), cmd };
    }
    if (Date.now() >= deadline) return { status: "pending", error: "", cmd: cmd || null };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// One report per failing invoice+recipient — a flapping send never spams Dispatch.
const _reported = new Set();

/** Reset dedupe state (tests). */
export function __resetSendReports() {
  _reported.clear();
}

/**
 * Auto-report a confirmed send failure to the monitored Dispatch queue (dev tasks),
 * so it can be triaged/fixed autonomously. Includes invoice #, recipients, time,
 * and the failure reason. Deduped per invoice+recipient.
 */
export async function reportSendFailure(addDevTask, { kind, no, email, reason, jobId, at } = {}) {
  if (typeof addDevTask !== "function") return false;
  const key = (kind || "invoice") + ":" + (no || jobId || "") + ":" + (email || "");
  if (_reported.has(key)) return false;
  _reported.add(key);
  const label = kind === "estimate" ? "Estimate" : "Invoice";
  const when = at || new Date().toISOString();
  try {
    const ok = await addDevTask({
      title: label + " send failed — #" + (no || "?"),
      desc:
        label +
        " #" +
        (no || "?") +
        " did NOT send to " +
        (email || "?") +
        " after automatic retries.\nReason: " +
        (reason || "unknown") +
        "\nTime: " +
        when +
        (jobId ? "\nJob: " + jobId : ""),
      priority: "high",
      category: "build",
      target: { page: "invoice-send", jobId: jobId || "", invoiceNo: no || "" },
    });
    if (ok === false) _reported.delete(key); // network error — allow a later retry
    return ok !== false;
  } catch {
    _reported.delete(key);
    return false;
  }
}
