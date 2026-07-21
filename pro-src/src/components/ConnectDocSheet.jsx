// Long-press / menu: connect invoice ↔ estimate or invoice ↔ permit at the same service address.
import React, { useMemo, useState } from "react";
import Sheet from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";
import {
  connectCandidateKind,
  connectDocsPatch,
  jobHasPermitPaperwork,
  sameAddressDocsForConnect,
} from "../lib/changeOrder.js";
import { fmt$ } from "../lib/format.js";
import { openBalance, invoiceTotal } from "../lib/customers.js";

function candidateLabel(j) {
  const kind = connectCandidateKind(j);
  if (kind === "estimate") return "Estimate #" + (j.estimateNo || "—");
  if (kind === "permit") {
    const bits = [];
    if (j.invoiceNo) bits.push("Inv #" + j.invoiceNo);
    if (j.estimateNo) bits.push("Est #" + j.estimateNo);
    const head = bits.length ? bits.join(" · ") : j.title || "Permit job";
    return "Permit · " + head;
  }
  if (j.invoiceNo) return "Invoice #" + j.invoiceNo;
  return j.title || "Job";
}

export default function ConnectDocSheet({ job, pressedKind, onClose }) {
  const { jobs, patchAndSave, showToast } = useStore();
  const [picked, setPicked] = useState(() => new Set());
  const [sameJobInfo, setSameJobInfo] = useState(false);

  const candidates = useMemo(
    () => sameAddressDocsForConnect(jobs, job, pressedKind),
    [jobs, job, pressedKind]
  );

  const title =
    pressedKind === "invoice"
      ? "Connect invoice to estimate or permit"
      : pressedKind === "permit"
        ? "Connect permit to invoice"
        : "Connect estimate to invoice";

  const emptyNote =
    pressedKind === "invoice"
      ? "No other estimates or permit jobs at this service address."
      : pressedKind === "permit"
        ? "No other invoices at this service address."
        : "No other invoices at this service address.";

  const holdLabel =
    pressedKind === "invoice"
      ? "invoice #" + (job.invoiceNo || "—")
      : pressedKind === "permit"
        ? "permit on " + (job.title || job.invoiceNo || "this job")
        : "estimate #" + (job.estimateNo || "—");

  const toggle = (id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    const selected = candidates.filter((j) => picked.has(j.id));
    if (!selected.length) {
      showToast("Pick at least one to connect");
      return;
    }
    const patches = connectDocsPatch(job, selected, {
      sameJobInfo,
      linkKind: pressedKind === "permit" ? "permit" : "",
    });
    await Promise.all(Object.entries(patches).map(([id, patch]) => patchAndSave(id, patch)));
    const linkedPermit = selected.some((j) => jobHasPermitPaperwork(j));
    const linkedEst = selected.some((j) => j.estimateNo && !j.invoiceNo);
    let msg = sameJobInfo ? "Connected — showing on same job information" : "Documents connected";
    if (linkedPermit && linkedEst) msg = "Linked estimate + permit";
    else if (linkedPermit) msg = "Linked permit to invoice";
    else if (linkedEst || pressedKind === "estimate") msg = sameJobInfo ? msg : "Linked estimate and invoice";
    showToast(msg);
    onClose();
  };

  return (
    <Sheet title={title} onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">
        Same service address only. Connecting from {holdLabel}.
      </p>

      {candidates.length ? (
        <div className="space-y-2 mb-4" data-testid="connect-doc-list">
          {candidates.map((j) => {
            const on = picked.has(j.id);
            const label = candidateLabel(j);
            const kind = connectCandidateKind(j);
            const amt = j.invoiceNo
              ? fmt$(openBalance(j) || invoiceTotal(j))
              : fmt$(invoiceTotal(j) || j.amount);
            return (
              <button
                key={j.id}
                type="button"
                className={
                  "w-full text-left rounded-xl border px-3 py-2.5 text-sm font-semibold " +
                  (on ? "border-brand bg-brand-soft text-brand" : "border-slate-200 bg-white text-slate-800")
                }
                onClick={() => toggle(j.id)}
                data-testid={"connect-pick-" + j.id}
                data-connect-kind={kind}
              >
                <span className="block">{label}</span>
                {j.title && kind !== "permit" ? (
                  <span className="block text-xs font-normal text-slate-500 truncate">{j.title}</span>
                ) : null}
                {kind === "permit" && j.title ? (
                  <span className="block text-xs font-normal text-slate-500 truncate">{j.title}</span>
                ) : null}
                {amt ? <span className="block text-xs font-normal tabular-nums mt-0.5">{amt}</span> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-400 text-center py-4">{emptyNote}</p>
      )}

      <label className="flex items-center gap-2 text-sm text-slate-700 mb-4 px-0.5">
        <input
          type="checkbox"
          checked={sameJobInfo}
          onChange={(e) => setSameJobInfo(e.target.checked)}
          data-testid="connect-same-job-info"
        />
        Show all on the same job information card
      </label>

      <button
        type="button"
        className="btn-brand w-full"
        disabled={!picked.size}
        onClick={save}
        data-testid="connect-doc-save"
      >
        Connect selected
      </button>
    </Sheet>
  );
}
