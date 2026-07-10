// Long-press: connect invoice ↔ estimate at the same service address.
import React, { useMemo, useState } from "react";
import Sheet from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";
import { connectDocsPatch, sameAddressDocsForConnect } from "../lib/changeOrder.js";
import { fmt$ } from "../lib/format.js";
import { openBalance, invoiceTotal } from "../lib/customers.js";

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
      ? "Connect invoice to estimate"
      : "Connect estimate to invoice";

  const emptyNote =
    pressedKind === "invoice"
      ? "No other estimates at this service address."
      : "No other invoices at this service address.";

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
    const patches = connectDocsPatch(job, selected, { sameJobInfo });
    await Promise.all(Object.entries(patches).map(([id, patch]) => patchAndSave(id, patch)));
    showToast(sameJobInfo ? "Connected — showing on same job information" : "Documents connected");
    onClose();
  };

  return (
    <Sheet title={title} onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">
        Same service address only. Hold was on{" "}
        {pressedKind === "invoice" ? "invoice #" + (job.invoiceNo || "—") : "estimate #" + (job.estimateNo || "—")}.
      </p>

      {candidates.length ? (
        <div className="space-y-2 mb-4" data-testid="connect-doc-list">
          {candidates.map((j) => {
            const on = picked.has(j.id);
            const label =
              j.estimateNo && !j.invoiceNo
                ? "Estimate #" + j.estimateNo
                : "Invoice #" + (j.invoiceNo || "—");
            const amt = j.invoiceNo ? fmt$(openBalance(j) || invoiceTotal(j)) : fmt$(invoiceTotal(j) || j.amount);
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
              >
                <span className="block">{label}</span>
                {j.title ? <span className="block text-xs font-normal text-slate-500 truncate">{j.title}</span> : null}
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