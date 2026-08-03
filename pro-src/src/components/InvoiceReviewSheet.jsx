// Review agent-applied invoice / estimate edits — diff highlight + approve / deny gate.
import React, { useCallback, useMemo, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import DescriptionField from "./DescriptionField.jsx";
import { useStore } from "../state/store.jsx";
import { fmt$ } from "../lib/format.js";
import {
  approveAgentDraftPatch,
  buildDocChangeSummary,
  denyAgentDraftPatch,
  getDocAgentDraft,
  invoiceLineDiff,
} from "../lib/invoiceAgentDraft.js";
import { emptyLine, lineAmount, linesTotal } from "../lib/qboDoc.js";

function DiffLineRow({ line, index, marks, onChange, onRemove, canRemove }) {
  const m = marks[index] || {};
  const rowClass = m.added
    ? "bg-red-50 border-red-200"
    : m.changed
    ? "bg-red-50/70 border-red-200"
    : "border-slate-200";
  const fieldClass = (field) =>
    m.added || (m.changed && m.changed[field]) ? "ring-2 ring-red-300 bg-red-50" : "";

  return (
    <div className={`card px-3 py-3 mb-2 space-y-2 border ${rowClass}`} data-testid="review-line-row">
      {m.added ? (
        <p className="text-[10px] font-bold uppercase tracking-wide text-red-600">Agent added</p>
      ) : m.changed ? (
        <p className="text-[10px] font-bold uppercase tracking-wide text-red-600">Agent changed</p>
      ) : null}
      <Fld label={"Line " + (index + 1) + " — Product/Service"}>
        <input
          className={`input ${fieldClass("itemName")}`}
          value={line.itemName || ""}
          onChange={(e) => onChange(index, { itemName: e.target.value })}
          aria-label={"Product service line " + (index + 1)}
        />
      </Fld>
      <DescriptionField
        value={line.description || ""}
        onChange={(v) => onChange(index, { description: v })}
        testId={"review-line-desc-" + (index + 1)}
        ariaLabel={"Description line " + (index + 1)}
      />
      <div className="flex gap-2">
        <Fld label="Qty">
          <input
            className={`input ${fieldClass("qty")}`}
            inputMode="decimal"
            value={line.qty}
            onChange={(e) => onChange(index, { qty: e.target.value })}
            aria-label={"Quantity line " + (index + 1)}
          />
        </Fld>
        <Fld label="Rate">
          <input
            className={`input ${fieldClass("unitPrice")}`}
            inputMode="decimal"
            value={line.unitPrice}
            onChange={(e) => onChange(index, { unitPrice: e.target.value })}
            aria-label={"Rate line " + (index + 1)}
          />
        </Fld>
        <div className="shrink-0 pt-6 text-sm font-bold text-slate-700 w-20 text-right">{fmt$(lineAmount(line))}</div>
      </div>
      {canRemove ? (
        <button type="button" className="text-xs font-semibold text-red-500" onClick={() => onRemove(index)}>
          Remove line
        </button>
      ) : null}
    </div>
  );
}

export default function InvoiceReviewSheet({ job, onClose, kind: kindProp }) {
  const { patchAndSave, appendInvoiceEditFeedback, showToast } = useStore();
  const kind =
    kindProp === "estimate" || job?.estimateAgentDraft?.pendingReview
      ? "estimate"
      : "invoice";
  const draft = getDocAgentDraft(job, kind) || {};
  const [lines, setLines] = useState(() => (draft.lines || []).map((ln) => ({ ...emptyLine(), ...ln })));
  const [saving, setSaving] = useState(false);
  const summary = useMemo(() => buildDocChangeSummary(job, draft, kind), [job, draft, kind]);

  const marks = useMemo(
    () => invoiceLineDiff(draft.baselineLines || (kind === "estimate" ? job.estimateLines : job.invoiceLines) || [], lines),
    [draft.baselineLines, job.invoiceLines, job.estimateLines, lines, kind]
  );
  const total = useMemo(() => linesTotal(lines), [lines]);

  const changeLine = useCallback((i, patch) => {
    setLines((rows) => rows.map((ln, idx) => (idx === i ? { ...ln, ...patch } : ln)));
  }, []);

  const approve = async () => {
    const valid = lines.filter((ln) => (ln.itemName || "").trim() || (ln.description || "").trim());
    if (!valid.length) return showToast("Keep at least one line");
    setSaving(true);
    try {
      const patch = approveAgentDraftPatch(job, valid, kind);
      await patchAndSave(job.id, patch);
      const delta = patch[kind === "estimate" ? "estimateAgentDraft" : "invoiceAgentDraft"]?.learningDelta || [];
      if (delta.length && kind === "invoice") {
        await appendInvoiceEditFeedback({ jobId: job.id, delta, sourceText: draft.sourceText });
      }
      showToast(
        kind === "estimate"
          ? "Estimate approved — use Save & sync when ready for QuickBooks"
          : "Invoice approved — use Save & sync when ready for QuickBooks"
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const deny = async () => {
    setSaving(true);
    try {
      const patch = denyAgentDraftPatch(job, kind);
      if (patch) await patchAndSave(job.id, patch);
      showToast(kind === "estimate" ? "Estimate changes denied" : "Invoice changes denied");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const title =
    kind === "estimate"
      ? "Review estimate " + (job.estimateNo || "")
      : "Review invoice " + (job.invoiceNo || "");

  return (
    <Sheet title={title} onClose={onClose} wide>
      <div
        className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 mb-3 text-sm text-red-800"
        data-testid="invoice-review-banner"
      >
        <p className="font-bold">Agent edits awaiting your review</p>
        {draft.sourceText ? <p className="text-xs mt-1 opacity-90">From: “{draft.sourceText}”</p> : null}
        {draft.agent ? <p className="text-[11px] mt-0.5 opacity-70">By {draft.agent}</p> : null}
        <p className="text-[11px] mt-1 opacity-80">
          Live total stays {summary.beforeFmt} until you approve. Highlighted fields are what changed.
        </p>
        {summary.dangerous ? (
          <p className="text-xs mt-1 font-bold text-red-700" data-testid="review-dangerous-zero">
            ⚠ This would zero out a non-zero {kind}. Double-check before approving.
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 mb-3 text-xs text-slate-700 space-y-1" data-testid="review-condensed">
        <p>
          <span className="font-bold text-slate-500">Customer</span> {summary.customer}
          {summary.person ? ` · ${summary.person}` : ""}
        </p>
        {summary.address ? (
          <p>
            <span className="font-bold text-slate-500">Address</span> {summary.address}
          </p>
        ) : null}
        <p>
          <span className="font-bold text-slate-500">Total</span>{" "}
          <span className="line-through text-slate-400">{summary.beforeFmt}</span>
          {" → "}
          <span className="font-extrabold text-red-700">{fmt$(total) || summary.afterFmt}</span>
        </p>
        {summary.beforeDesc || summary.afterDesc ? (
          <p>
            <span className="font-bold text-slate-500">Lines</span>{" "}
            <span className="text-slate-400">{summary.beforeDesc || "—"}</span>
            {" → "}
            <span className="font-semibold">{summary.afterDesc || "—"}</span>
          </p>
        ) : null}
      </div>

      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Line items</p>
      {lines.map((ln, i) => (
        <DiffLineRow
          key={i}
          line={ln}
          index={i}
          marks={marks}
          onChange={changeLine}
          onRemove={(idx) => setLines((rows) => rows.filter((_, j) => j !== idx))}
          canRemove={lines.length > 1}
        />
      ))}
      <button
        type="button"
        className="btn-ghost w-full !py-2 mb-3"
        onClick={() => setLines((rows) => rows.concat([emptyLine()]))}
      >
        ＋ Add line
      </button>

      <div className="flex justify-between items-center px-1 mb-4">
        <span className="text-sm font-bold text-slate-600">Proposed total</span>
        <span className="text-lg font-extrabold text-slate-900" data-testid="review-total">
          {fmt$(total) || "$0"}
        </span>
      </div>

      <button
        type="button"
        className="btn-brand w-full mb-2"
        disabled={saving}
        onClick={approve}
        data-testid="invoice-approve"
      >
        Approve changes
      </button>
      <button
        type="button"
        className="btn w-full border border-red-200 text-red-700 bg-red-50"
        disabled={saving}
        onClick={deny}
        data-testid="invoice-deny"
      >
        Deny — keep original
      </button>
    </Sheet>
  );
}
