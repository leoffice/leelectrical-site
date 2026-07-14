// Review agent-applied invoice edits — diff highlight + approve gate.
import React, { useCallback, useMemo, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import DescriptionField from "./DescriptionField.jsx";
import { useStore } from "../state/store.jsx";
import { fmt$ } from "../lib/format.js";
import { approveAgentDraftPatch, invoiceLineDiff } from "../lib/invoiceAgentDraft.js";
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

export default function InvoiceReviewSheet({ job, onClose }) {
  const { patchAndSave, appendInvoiceEditFeedback, showToast } = useStore();
  const draft = job.invoiceAgentDraft || {};
  const [lines, setLines] = useState(() => (draft.lines || []).map((ln) => ({ ...emptyLine(), ...ln })));
  const [saving, setSaving] = useState(false);

  const marks = useMemo(
    () => invoiceLineDiff(draft.baselineLines || job.invoiceLines || [], lines),
    [draft.baselineLines, job.invoiceLines, lines]
  );
  const total = useMemo(() => linesTotal(lines), [lines]);

  const changeLine = useCallback((i, patch) => {
    setLines((rows) => rows.map((ln, idx) => (idx === i ? { ...ln, ...patch } : ln)));
  }, []);

  const approve = async () => {
    const valid = lines.filter((ln) => (ln.itemName || "").trim());
    if (!valid.length) return showToast("Keep at least one line");
    setSaving(true);
    try {
      const patch = approveAgentDraftPatch(job, valid);
      await patchAndSave(job.id, patch);
      const delta = patch.invoiceAgentDraft?.learningDelta || [];
      if (delta.length) await appendInvoiceEditFeedback({ jobId: job.id, delta, sourceText: draft.sourceText });
      showToast("Invoice approved — use Save & sync when ready for QuickBooks");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title={"Review invoice " + (job.invoiceNo || "")} onClose={onClose} wide>
      <div
        className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 mb-3 text-sm text-red-800"
        data-testid="invoice-review-banner"
      >
        <p className="font-bold">Agent edits awaiting your review</p>
        {draft.sourceText ? <p className="text-xs mt-1 opacity-90">From chat: “{draft.sourceText}”</p> : null}
        <p className="text-[11px] mt-1 opacity-80">Highlighted fields are what the agent changed. Adjust if needed, then Approve.</p>
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
        <span className="text-sm font-bold text-slate-600">Total</span>
        <span className="text-lg font-extrabold text-slate-900" data-testid="review-total">
          {fmt$(total) || "$0"}
        </span>
      </div>

      <button
        type="button"
        className="btn-brand w-full"
        disabled={saving}
        onClick={approve}
        data-testid="invoice-approve"
      >
        Approve changes
      </button>
    </Sheet>
  );
}