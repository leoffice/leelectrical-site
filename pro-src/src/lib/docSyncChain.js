// Defer QuickBooks estimate/invoice sync until the customer exists in QBO.
const STORAGE_KEY = "le-pro-pending-doc-sync";

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeAll(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

/** Hold doc commands until create_customer finishes for this job. */
export function stashPendingDocSync(jobId, bundle) {
  if (!jobId || !bundle) return;
  const map = readAll();
  map[String(jobId)] = { ...bundle, stashedAt: Date.now() };
  writeAll(map);
}

/**
 * Remove and return a stashed doc sync bundle for a job.
 *
 * @deprecated DATA LOSS — this consumes the bundle before the caller knows
 * whether the flush succeeded. If the flush then failed, the queued invoice /
 * estimate was gone for good (Mordechai Nemni, 2026-08-10: an invoice was
 * built and "sent", the bundle was taken, the flush did not queue, and no
 * invoice ever existed anywhere). Use peekPendingDocSync + clearPendingDocSync
 * so the bundle survives a failure and can be retried.
 */
export function takePendingDocSync(jobId) {
  if (!jobId) return null;
  const map = readAll();
  const key = String(jobId);
  const bundle = map[key] || null;
  if (bundle) {
    delete map[key];
    writeAll(map);
  }
  return bundle;
}

/** Read a stashed bundle WITHOUT consuming it. */
export function peekPendingDocSync(jobId) {
  if (!jobId) return null;
  return readAll()[String(jobId)] || null;
}

/** Drop a stashed bundle — only after its commands are safely queued. */
export function clearPendingDocSync(jobId) {
  if (!jobId) return;
  const map = readAll();
  const key = String(jobId);
  if (!(key in map)) return;
  delete map[key];
  writeAll(map);
}

/** Record a failed flush so the bundle is retried instead of silently lost. */
export function markPendingDocSyncFailure(jobId, error) {
  if (!jobId) return;
  const map = readAll();
  const key = String(jobId);
  const cur = map[key];
  if (!cur) return;
  map[key] = {
    ...cur,
    flushAttempts: Number(cur.flushAttempts || 0) + 1,
    lastFlushError: String(error || "flush_did_not_queue").slice(0, 200),
    lastFlushAt: Date.now(),
  };
  writeAll(map);
}

/** Every job id still holding an unflushed doc bundle. */
export function pendingDocSyncJobIds() {
  return Object.keys(readAll());
}

export function hasPendingDocSync(jobId) {
  if (!jobId) return false;
  return Boolean(readAll()[String(jobId)]);
}

/**
 * Run stashed estimate/invoice commands after the customer is linked.
 * @returns {Promise<boolean>} true when commands were queued
 */
export async function flushPendingDocSync({ enqueue, logSend, jobId, job, bundle }) {
  if (!jobId || !bundle || !enqueue) return false;
  const qid = String(job?.qboCustomerId || "").trim();
  if (!qid) return false;

  const { commands = [], attachments = [], send, kind } = bundle;

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    const payload = { ...cmd.payload, qboCustomerId: qid };
    await enqueue(cmd.type, jobId, payload, "judgment", cmd.idk);
  }

  for (const att of attachments) {
    const attachType = kind === "estimate" ? "attach_to_estimate" : "attach_to_invoice";
    await enqueue(
      attachType,
      jobId,
      {
        estimateNo: job.estimateNo || "",
        invoiceNo: job.invoiceNo || "",
        name: att.name,
        url: att.url || "",
        pendingDoc: true,
      },
      "deterministic",
      "att:" + kind + ":" + jobId + ":" + att.name
    );
  }

  if (send && job.email) {
    const noKey = kind === "estimate" ? "estimateNo" : "invoiceNo";
    const no = job[noKey];
    if (no) {
      await enqueue(
        "send_" + kind,
        jobId,
        { email: job.email, [noKey]: no },
        "deterministic",
        "send_" + kind + ":" + no
      );
      if (logSend) {
        logSend(jobId, (kind === "estimate" ? "Estimate" : "Invoice") + " send queued after create", job.email);
      }
    }
  }

  return true;
}