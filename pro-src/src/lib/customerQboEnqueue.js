// Enqueue the right QuickBooks customer command for a job (create vs update).
import { customerSyncPayload } from "./customerSync.js";

/**
 * Queue create or update in QuickBooks for a job row.
 * @returns {"create_customer"|"update_customer"}
 */
export function enqueueCustomerQboSync(enqueue, jobId, job, qboCustomerId) {
  const payload = customerSyncPayload(job);
  const qid = String(qboCustomerId || job.qboCustomerId || "").trim();
  if (qid) {
    enqueue(
      "update_customer",
      jobId,
      { id: qid, ...payload },
      "deterministic",
      "update_customer|" + jobId + "|" + Date.now()
    );
    return "update_customer";
  }
  enqueue(
    "create_customer",
    jobId,
    payload,
    "deterministic",
    "create_customer|" + jobId + "|" + Date.now()
  );
  return "create_customer";
}