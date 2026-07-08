// When create_estimate / create_invoice completes, patch job + show 5s confirmation.
import { useEffect, useRef } from "react";
import { useStore } from "../state/store.jsx";
import {
  loadDocConfirmSeen,
  parseDocCommandResult,
  persistDocConfirmSeen,
  shouldShowDocConfirm,
} from "../lib/docConfirm.js";
import { todayStr } from "../lib/format.js";

export default function DocConfirmWatcher() {
  const { commands, patchAndSave, effectiveJob, showDocConfirm, refreshCommands } = useStore();
  const seen = useRef(loadDocConfirmSeen());

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
      patchAndSave(c.jobId, patch).catch(() => {});

      showDocConfirm({
        kind,
        no,
        amount: parsed.amount || job.amount,
        customer: job.customer || job.businessName || "",
      });
    }
  }, [commands, effectiveJob, patchAndSave, showDocConfirm]);

  return null;
}