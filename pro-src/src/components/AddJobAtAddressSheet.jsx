// Add a job at this service address — optional toggle to make it a change order (CO).
import React, { useState } from "react";
import Sheet from "./Sheet.jsx";
import Toggle from "./Toggle.jsx";
import {
  canAddChangeOrder,
  changeOrderDocLabel,
  changeOrderJobPatch,
  nextChangeOrderSeq,
} from "../lib/changeOrder.js";
import { cloneJobAtAddressPatch } from "../lib/customerHierarchy.js";

export default function AddJobAtAddressSheet({
  sourceJob,
  jobs = [],
  onCreate,
  onClose,
  busy = false,
}) {
  const [asChangeOrder, setAsChangeOrder] = useState(false);
  const [coKind, setCoKind] = useState("invoice");

  const allowCo = sourceJob ? canAddChangeOrder(jobs, sourceJob) : false;
  const previewSeq = sourceJob ? nextChangeOrderSeq(jobs, sourceJob, coKind) : 1;
  const previewLabel =
    sourceJob && asChangeOrder ? changeOrderDocLabel(sourceJob, coKind, previewSeq) : "";

  const submit = () => {
    if (!sourceJob || busy) return;
    if (asChangeOrder) {
      if (!allowCo) return;
      onCreate?.(changeOrderJobPatch(sourceJob, coKind, jobs), { changeOrder: true, kind: coKind });
      return;
    }
    onCreate?.(cloneJobAtAddressPatch(sourceJob), { changeOrder: false });
  };

  return (
    <Sheet title="Add job at this address" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">
        Same customer and service address
        {sourceJob?.invoiceNo
          ? " as invoice #" + sourceJob.invoiceNo
          : sourceJob?.title
          ? " as " + sourceJob.title
          : ""}
        .
      </p>

      <div
        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-3 py-3 mb-3"
        data-testid="add-job-co-toggle-row"
      >
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900">Change order (CO)</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {asChangeOrder
              ? previewLabel
                ? "Invoice number will be " + previewLabel
                : "Tagged as a change order at this address"
              : "Turn on to bill extra work under the original invoice number"}
          </div>
        </div>
        <Toggle
          on={asChangeOrder}
          onChange={(on) => {
            if (on && !allowCo) return;
            setAsChangeOrder(!!on);
          }}
          label="Change order"
          small
        />
      </div>

      {asChangeOrder && !allowCo ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-3">
          Finish the open change order first — save, email, and confirm in QuickBooks.
        </p>
      ) : null}

      {asChangeOrder && allowCo ? (
        <div className="flex gap-2 mb-3" data-testid="add-job-co-kind">
          <button
            type="button"
            className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
              coKind === "invoice"
                ? "border-brand/40 bg-brand-soft text-brand"
                : "border-slate-200 text-slate-600"
            }`}
            onClick={() => setCoKind("invoice")}
            data-testid="add-job-co-kind-invoice"
          >
            CO invoice
          </button>
          <button
            type="button"
            className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
              coKind === "estimate"
                ? "border-brand/40 bg-brand-soft text-brand"
                : "border-slate-200 text-slate-600"
            }`}
            onClick={() => setCoKind("estimate")}
            data-testid="add-job-co-kind-estimate"
          >
            CO estimate
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className="btn-brand w-full disabled:opacity-50"
        disabled={busy || (asChangeOrder && !allowCo)}
        onClick={submit}
        data-testid="add-job-at-address-confirm"
      >
        {asChangeOrder
          ? coKind === "estimate"
            ? "Create change order estimate"
            : "Create change order invoice"
          : "Create job"}
      </button>
    </Sheet>
  );
}
