// Per-scope QuickBooks sync — maps menu picks to command bus actions.
import { customerSyncPayload, qboCustomerToJobPatch } from "./customerSync.js";
import { invoiceJobs } from "./customerDocLists.js";
import { waitForCommandDone } from "./commandWait.js";

/** Pull name/phone/email/billing from QuickBooks onto every job for this customer. */
export async function pullCustomerFromQbo({ qboId, name, jobs, jobId, api, patchAndSave, enqueue, showToast }) {
  const targets = (jobs || []).filter(Boolean);
  const primary = targets[0];
  const id = String(qboId || primary?.qboCustomerId || "").trim();
  const label = (name || primary?.businessName || primary?.customer || "").trim();

  if (!id && !label) {
    showToast("Link this customer to QuickBooks first");
    return false;
  }

  if (id && api?.getCustomer && patchAndSave) {
    showToast("Pulling customer info from QuickBooks…");
    const qb = await api.getCustomer(id);
    if (!qb) {
      showToast("Could not load customer from QuickBooks");
      return false;
    }
    const patch = { ...qboCustomerToJobPatch(qb), qboCustomerId: id };
    if (!targets.length) {
      showToast("Customer loaded from QuickBooks");
      return true;
    }
    for (const j of targets) {
      await patchAndSave(j.id, patch);
    }
    showToast("Customer info updated from QuickBooks");
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
    showToast("Checking QuickBooks for this customer…");
    return true;
  }

  showToast("Link this customer to QuickBooks first");
  return false;
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
      showToast("Link this customer to QuickBooks first");
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

  if (kind === "invoices") {
    showToast(
      scope === "open"
        ? "Pulling open invoices — each becomes its own job…"
        : "Pulling all invoices — each becomes its own job…"
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
    showToast("Pulling full customer history…");
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