// Per-scope QuickBooks sync — maps menu picks to command bus actions.
import { customerSyncPayload } from "./customerSync.js";
import { invoiceJobs } from "./customerDocLists.js";

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

  const pullOpenInvoices = async () => {
    if (!name && !qboId) {
      showToast("Link this customer to QuickBooks first");
      return false;
    }
    const key = qboId || name;
    await enqueue(
      "import_customer",
      "import-" + key,
      { name, qboId, scope, kind },
      "deterministic",
      "import_customer|" + key + "|" + kind + "|" + scope + "|" + Date.now()
    );
    try {
      await api.pullJobs?.({ maxWaitMs: 90000 });
    } catch {}
    await refreshJobs?.(true);
    return true;
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
    if (qboId) {
      enqueue(
        "update_customer",
        jobId,
        { id: qboId, ...customerSyncPayload(primary) },
        "deterministic",
        "update_customer|" + jobId + "|" + Date.now()
      );
      showToast("Syncing customer info to QuickBooks…");
    } else {
      enqueue(
        "customer_sync",
        jobId,
        customerSyncPayload(primary),
        "judgment",
        "customer_sync|" + jobId + "|" + Date.now()
      );
      showToast("Checking QuickBooks for this customer…");
    }
    return;
  }

  if (kind === "invoices") {
    showToast(
      scope === "open"
        ? "Pulling open invoices — each becomes its own job…"
        : "Pulling all invoices — each becomes its own job…"
    );
    await pullOpenInvoices();
    if (scope === "all") {
      const n = await pullPaymentsFor(invoiceJobs(jobs));
      if (n) showToast("Refreshing payment status on " + n + " invoice" + (n === 1 ? "" : "s") + "…");
    }
    return;
  }

  if (kind === "estimates") {
    showToast(scope === "open" ? "Refreshing open estimates…" : "Refreshing estimate history…");
    if (qboId || name) await pullOpenInvoices();
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
    await pullOpenInvoices();
    const n = await pullPaymentsFor(invoiceJobs(jobs));
    if (qboId) {
      enqueue(
        "update_customer",
        jobId,
        { id: qboId, ...customerSyncPayload(primary) },
        "deterministic",
        "update_customer|" + jobId + "|hist|" + Date.now()
      );
    }
    if (n) showToast("History sync queued — " + n + " invoice" + (n === 1 ? "" : "s") + " updating");
    return;
  }
}