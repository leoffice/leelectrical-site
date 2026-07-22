// When create_estimate / create_invoice completes or fails, patch job + notify.
import { useEffect, useRef } from "react";
import { useStoreData } from "../state/store.jsx";
import {
  loadDocConfirmSeen,
  parseDocCommandResult,
  persistDocConfirmSeen,
  shouldShowDocConfirm,
} from "../lib/docConfirm.js";
import { DOC_SYNC_COMMAND_TYPES, docSyncFailurePatch } from "../lib/docSync.js";
import { briefTitlePatch } from "../lib/changeOrder.js";
import { todayStr } from "../lib/format.js";
import { qboStubJobIds } from "../lib/invoiceDedup.js";

const DOC_FAIL_SEEN_KEY = "le-pro-doc-fail-seen";

function loadDocFailSeen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(DOC_FAIL_SEEN_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function persistDocFailSeen(seen) {
  try {
    localStorage.setItem(DOC_FAIL_SEEN_KEY, JSON.stringify([...seen].slice(-300)));
  } catch {}
}

function docFailToastMessage(c) {
  const label =
    c.type === "create_estimate" || c.type === "update_estimate"
      ? "Estimate"
      : c.type === "create_invoice" || c.type === "update_invoice"
      ? "Invoice"
      : "Document";
  const err = String(c.error || "");
  if (err.includes("no_customer")) return label + " sync failed — link this customer to QuickBooks first";
  return label + " sync failed — check Activity on the job and tap Retry";
}

export default function DocConfirmWatcher() {
  const { commands, jobs, showDocConfirm, showToast, refreshCommands, patchAndSave, effectiveJob } =
    useStoreData();
  const seen = useRef(loadDocConfirmSeen());
  const failSeen = useRef(loadDocFailSeen());

  useEffect(() => {
    const iv = setInterval(() => refreshCommands(), 3000);
    return () => clearInterval(iv);
  }, [refreshCommands]);

  useEffect(() => {
    for (const c of commands || []) {
      if (!c?.id) continue;
      if (c.type !== "create_estimate" && c.type !== "create_invoice") continue;
      if (c.status !== "done") continue;

      const kind = c.type === "create_estimate" ? "estimate" : "invoice";
      const parsed = parseDocCommandResult(c.result, kind);
      const no = parsed.estimateNo || parsed.invoiceNo;
      if (!no || !c.jobId) continue;

      const job = effectiveJob(c.jobId) || {};
      if (!shouldShowDocConfirm({ commandId: c.id, kind, no, job }, seen.current)) {
        seen.current.add(c.id);
        persistDocConfirmSeen(seen.current);
        continue;
      }

      seen.current.add(c.id);
      persistDocConfirmSeen(seen.current);
      const patch = {
        amount: parsed.amount || job.amount,
        status:
          kind === "estimate"
            ? { Estimate: { s: "done", d: todayStr() } }
            : { Invoiced: { s: "done", d: todayStr() } },
      };
      if (kind === "estimate") {
        patch.estimateNo = no;
        patch._estimateConfirmed = true;
      } else {
        patch.invoiceNo = no;
        patch._invoiceConfirmed = true;
      }
      Object.assign(patch, briefTitlePatch({ ...job, ...patch }, kind));
      patchAndSave(c.jobId, patch).catch(() => {});

      if (kind === "invoice") {
        for (const stubId of qboStubJobIds(jobs, no, c.jobId)) {
          patchAndSave(stubId, { _deleted: true }).catch(() => {});
        }
      }

      showDocConfirm({
        kind,
        no,
        amount: parsed.amount || job.amount,
        customer: job.customer || job.businessName || "",
      });
    }

    for (const c of commands || []) {
      if (!c?.id || failSeen.current.has(c.id)) continue;
      if (!DOC_SYNC_COMMAND_TYPES.includes(c.type) || c.status !== "failed") continue;
      failSeen.current.add(c.id);
      persistDocFailSeen(failSeen.current);
      if (c.jobId) {
        const kind = c.type.includes("estimate") ? "estimate" : "invoice";
        const job = effectiveJob(c.jobId) || {};
        const hasDoc =
          kind === "estimate"
            ? !!(job.estimateNo || job._estimateConfirmed)
            : !!(job.invoiceNo || job._invoiceConfirmed);
        if (!hasDoc) patchAndSave(c.jobId, docSyncFailurePatch(c.type)).catch(() => {});
      }
      showToast(docFailToastMessage(c));
    }
  }, [commands, effectiveJob, patchAndSave, showDocConfirm, showToast]);

  return null;
}