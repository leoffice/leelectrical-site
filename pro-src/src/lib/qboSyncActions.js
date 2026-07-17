// Per-scope sync — maps menu picks to command bus actions.
// Prefer office files (le_local_db) for speed; live QuickBooks only on miss.
import { customerSyncPayload, qboCustomerToJobPatch } from "./customerSync.js";
import { invoiceJobs } from "./customerDocLists.js";
import { waitForCommandDone } from "./commandWait.js";

function parseCmdResult(cmd) {
  const raw = cmd?.result;
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function importResultToast(res, showToast) {
  if (!res || typeof res !== "object") {
    showToast("Sync finished");
    return;
  }
  const n = Number(res.imported || 0);
  const src = String(res.source || "");
  if (src === "local" || !src) {
    if (n > 0) showToast("Updated " + n + " job" + (n === 1 ? "" : "s") + " from office files");
    else showToast("Already up to date from office files");
    return;
  }
  if (src === "qbo_fallback") {
    if (n > 0) showToast("Updated " + n + " job" + (n === 1 ? "" : "s") + " from QuickBooks (not in office files)");
    else showToast("Checked QuickBooks — nothing new to import");
    return;
  }
  if (n > 0) showToast("Imported " + n + " job" + (n === 1 ? "" : "s"));
  else showToast("Sync finished — nothing new");
}

/** Pull name/phone/email/billing from office customer index onto every job. */
export async function pullCustomerFromQbo({ qboId, name, jobs, jobId, api, patchAndSave, enqueue, showToast }) {
  const targets = (jobs || []).filter(Boolean);
  const primary = targets[0];
  const id = String(qboId || primary?.qboCustomerId || "").trim();
  const label = (name || primary?.businessName || primary?.customer || "").trim();

  if (!id && !label) {
    showToast("Link this customer first");
    return false;
  }

  if (id && api?.getCustomer && patchAndSave) {
    showToast("Pulling customer info…");
    const qb = await api.getCustomer(id);
    if (!qb) {
      showToast("Could not load customer — try Update office files");
      return false;
    }
    const patch = { ...qboCustomerToJobPatch(qb), qboCustomerId: id };
    if (!targets.length) {
      showToast("Customer info loaded");
      return true;
    }
    for (const j of targets) {
      await patchAndSave(j.id, patch);
    }
    showToast("Customer info updated");
    return true;
  }

  if (!id && primary && enqueue) {
    enqueue(
      "customer_sync",
      jobId || primary.id,
      customerSyncPayload(primary),
      "judgment",
      "customer_sync|" + (jobId || primary.id) + "|" + Date.now()
    );
    showToast("Checking for this customer…");
    return true;
  }

  showToast("Link this customer first");
  return false;
}

/** Refresh office customer/invoice files from QuickBooks on the host (backend). */
export async function refreshOfficeFiles({ enqueue, showToast, api }) {
  if (!enqueue) {
    showToast("Sync not available");
    return false;
  }
  const idk = "refresh_local_db|" + Date.now();
  showToast("Updating office files in the background…");
  await enqueue("refresh_local_db", "refresh-local-db", {}, "deterministic", idk);
  const testMode = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.MODE === "test";
  const wait = await waitForCommandDone(api, idk, {
    maxMs: testMode ? 80 : 600000,
    intervalMs: testMode ? 15 : 3000,
  });
  if (wait.timeout) {
    showToast("Still updating office files — check back in a few minutes");
    return false;
  }
  if (!wait.ok) {
    showToast(String(wait.cmd?.error || "Could not update office files"));
    return false;
  }
  showToast("Office files updated — imports will be fast again");
  return true;
}

/**
 * Run a scoped QB sync for a customer context.
 * @param {'customer'|'invoices'|'estimates'|'payments'|'history'} kind
 * @param {'all'|'open'} scope
 */
export async function runQboSync({
  kind,
  scope = "open",
  job,
  customerJobs,
  enqueue,
  showToast,
  refreshJobs,
  api,
  patchAndSave,
}) {
  const jobs = customerJobs || (job ? [job] : []);
  const primary = job || jobs[0];
  if (!primary) {
    showToast("No job to sync from");
    return;
  }
  const qboId = String(primary.qboCustomerId || "").trim();
  const name = (primary.businessName || primary.customer || "").trim();
  const jobId = primary.id;

  const pullOpenInvoices = async (invoiceKind = "invoices") => {
    if (!name && !qboId) {
      showToast("Link this customer first");
      return false;
    }
    const key = qboId || name;
    const idk = "import_customer|" + key + "|" + invoiceKind + "|" + scope + "|" + Date.now();
    await enqueue(
      "import_customer",
      "import-" + key,
      { name, qboId, scope, kind: invoiceKind },
      "deterministic",
      idk
    );
    const testMode = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.MODE === "test";
    const wait = await waitForCommandDone(api, idk, { maxMs: testMode ? 80 : 120000, intervalMs: testMode ? 15 : 2000 });
    if (wait.timeout) showToast("Still importing — check back in a moment");
    else if (!wait.ok) showToast(String(wait.cmd?.error || "Import failed"));
    else importResultToast(parseCmdResult(wait.cmd), showToast);
    await refreshJobs?.(true);
    return wait.ok;
  };

  const pullPaymentsFor = async (list) => {
    const invJobs = list.filter((j) => j.invoiceNo);
    if (!invJobs.length) return 0;
    let n = 0;
    for (const j of invJobs) {
      await enqueue(
        "fetch_payments",
        j.id,
        { invoiceNo: j.invoiceNo },
        "deterministic",
        "fetch_payments:" + j.invoiceNo + ":" + Date.now()
      );
      n += 1;
    }
    return n;
  };

  if (kind === "customer") {
    await pullCustomerFromQbo({
      qboId,
      name,
      jobs,
      jobId,
      api,
      patchAndSave,
      enqueue,
      showToast,
    });
    return;
  }

  if (kind === "refresh_files") {
    await refreshOfficeFiles({ enqueue, showToast, api });
    return;
  }

  if (kind === "invoices") {
    showToast(
      scope === "open"
        ? "Pulling open invoices from office files…"
        : "Pulling all invoices from office files…"
    );
    await pullOpenInvoices("invoices");
    if (scope === "all") {
      const n = await pullPaymentsFor(invoiceJobs(jobs));
      if (n) showToast("Refreshing payment status on " + n + " invoice" + (n === 1 ? "" : "s") + "…");
    }
    return;
  }

  if (kind === "estimates") {
    showToast(scope === "open" ? "Refreshing open estimates…" : "Refreshing estimate history…");
    if (qboId || name) await pullOpenInvoices("estimates");
    else await refreshJobs?.(true);
    showToast("Estimates on file updated — create new ones in the estimate tab");
    return;
  }

  if (kind === "payments") {
    const list = scope === "open" ? invoiceJobs(jobs, { openOnly: true }) : invoiceJobs(jobs);
    const n = await pullPaymentsFor(list);
    showToast(n ? "Pulling payments for " + n + " invoice" + (n === 1 ? "" : "s") + "…" : "No invoices to pull payments for");
    return;
  }

  if (kind === "history") {
    showToast("Pulling full customer history from office files…");
    await pullOpenInvoices("history");
    await pullCustomerFromQbo({
      qboId,
      name,
      jobs,
      jobId,
      api,
      patchAndSave,
      enqueue,
      showToast,
    });
    const n = await pullPaymentsFor(invoiceJobs(jobs));
    if (n) showToast("History sync queued — " + n + " invoice" + (n === 1 ? "" : "s") + " updating");
    return;
  }
}