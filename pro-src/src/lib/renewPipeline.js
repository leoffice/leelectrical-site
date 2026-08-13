// renewPipeline — one readable pipeline state for the "Permits that Expired"
// bucket (Levi 2026-08-13): expiring → Notified → Opted in → Invoiced → Paid →
// Renew deployed → Completed (leaves the queue).
//
// Pure derivation from the job.permitRenew blob (see permitRenewal.js for the
// field vocabulary). The paid trigger is the in-app payment path
// (applyPaymentsPatch stamps paid + queueUpdatePermit + deployUpdate) —
// LEVI-DEFAULT #1: no webhook yet; that patch is the single clean hook.

export const RENEW_PIPE_STEPS = [
  "Notified",
  "Opted in",
  "Invoiced",
  "Paid",
  "Renew deployed",
  "Completed",
];

/**
 * @returns { idx, key, label, note } — idx is the CURRENT bead (-1 = pre-notify).
 */
export function renewPipelineState(pr = {}) {
  const p = pr || {};
  const deployStatus = String(p.deployStatus || "").toLowerCase();
  if (p.renewComplete || p.renewDeployedDone || deployStatus === "done" || deployStatus === "completed") {
    return {
      idx: 5,
      key: "completed",
      label: "Completed",
      note: "Renewed at DOB · copy sent · new expiration saved. Leaves the queue.",
    };
  }
  if (["deploying", "queued", "in_progress"].includes(deployStatus) || (p.deployStartedAt && deployStatus !== "failed")) {
    return {
      idx: 4,
      key: "renewing",
      label: "Renew deployed",
      note:
        deployStatus === "failed"
          ? "Deploy failed — try again."
          : "Israel/agent is renewing at DOB. Once confirmed we send the renewed copy and update the expiration date.",
    };
  }
  if (p.paid) {
    return {
      idx: 3,
      key: "paid",
      label: "Paid",
      note: "PAID — a Deploy-renewal task is live in Notifications to Deploy.",
    };
  }
  if (p.invoiceMaterialized) {
    return {
      idx: 2,
      key: "invoiced",
      label: "Invoiced",
      note: "Opted in · invoice live · awaiting payment. Paid → creates the Deploy-renewal task.",
    };
  }
  if (p.optedInAt || p.ctaTappedAt) {
    return {
      idx: 1,
      key: "optedin",
      label: "Opted in",
      note: "Customer chose to renew — invoice being prepared.",
    };
  }
  if (p.noticeSent || p.emailSentAt) {
    return {
      idx: 0,
      key: "notified",
      label: "Notified",
      note: "Renewal notice emailed (permit # + fee). Waiting for the customer to choose to renew.",
    };
  }
  return {
    idx: -1,
    key: "expiring",
    label: "Expiring",
    note: "In the expiring-permit DB — notice not sent yet.",
  };
}
