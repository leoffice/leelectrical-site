// Login card: remote agent changed an invoice/estimate — approve, edit, or deny.
// ✕ snoozes 15 minutes then the card comes back (Levi 2026-08-03).
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore, useStoreData } from "../state/store.jsx";
import {
  approveAgentDraftPatch,
  collectPendingDocReviews,
  denyAgentDraftPatch,
  DOC_CHANGE_SNOOZE_MINUTES,
} from "../lib/invoiceAgentDraft.js";
import { isSuggestionSnoozed, snoozeSuggestion } from "../lib/dismissSnooze.js";
import PromptSurface from "./PromptSurface.jsx";
import InvoiceReviewSheet from "./InvoiceReviewSheet.jsx";

const IS_TEST = typeof process !== "undefined" && process.env && process.env.NODE_ENV === "test";

function dueReviews(jobs) {
  return collectPendingDocReviews(jobs).filter((r) => !isSuggestionSnoozed(r.key));
}

export default function DocChangeApprovalPrompts() {
  const { jobs, loading } = useStoreData();
  const { patchAndSave, showToast } = useStore();
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(null); // { job, kind }
  const [busy, setBusy] = useState(false);

  // Re-check snoozes so a 15-min X comes back without reload.
  useEffect(() => {
    if (IS_TEST) return undefined;
    const iv = setInterval(() => setTick((n) => n + 1), 30_000);
    const onVis = () => {
      if (!document.hidden) setTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const pending = useMemo(() => dueReviews(jobs), [jobs, tick]);
  const current = pending[0] || null;

  if (loading && !(jobs || []).length) return null;

  if (editing) {
    return (
      <InvoiceReviewSheet
        job={editing.job}
        kind={editing.kind}
        onClose={() => {
          setEditing(null);
          setTick((n) => n + 1);
        }}
      />
    );
  }

  if (!current) return null;

  const { job, kind, summary, key, draft } = current;
  const title =
    kind === "estimate" ? "Estimate change needs your OK" : "Invoice change needs your OK";

  const snooze = (minutes = DOC_CHANGE_SNOOZE_MINUTES) => {
    snoozeSuggestion(key, minutes);
    setTick((n) => n + 1);
    showToast(`I'll ask again in ${minutes} min`);
  };

  // Snappy rule (Levi 2026-08-03): never hold Approve/Deny on network.
  // patchAndSave applies setJobs first, then persists in background.
  const approveAsProposed = () => {
    const lines = draft?.lines || [];
    if (!lines.length) {
      showToast("Nothing to approve — open Edit");
      return;
    }
    if (busy) return;
    setBusy(true);
    const patch = approveAgentDraftPatch(job, lines, kind);
    // Fire-and-forget network — card dismisses from local apply.
    void patchAndSave(job.id, patch).finally(() => setBusy(false));
    showToast(kind === "estimate" ? "Estimate change approved" : "Invoice change approved");
    setTick((n) => n + 1);
  };

  const deny = () => {
    if (busy) return;
    setBusy(true);
    const patch = denyAgentDraftPatch(job, kind);
    if (patch) void patchAndSave(job.id, patch).finally(() => setBusy(false));
    else setBusy(false);
    showToast("Denied — original kept");
    setTick((n) => n + 1);
  };

  const openJob = () => {
    if (job?.id) navigate("/job/" + encodeURIComponent(job.id));
  };

  return (
    <PromptSurface
      title={title}
      testId="doc-change-approval"
      urgent={!!summary.dangerous}
      onClose={() => snooze(DOC_CHANGE_SNOOZE_MINUTES)}
    >
      <div className="space-y-3" data-testid="doc-change-body">
        {summary.dangerous ? (
          <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            ⚠ Proposed total is $0 — original was {summary.beforeFmt}
          </p>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm space-y-1.5">
          <p data-testid="doc-change-customer">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 block">
              Customer
            </span>
            {summary.customer}
            {summary.person ? (
              <span className="text-slate-500 text-xs block">{summary.person}</span>
            ) : null}
          </p>
          {summary.address ? (
            <p data-testid="doc-change-address">
              <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 block">
                Job address
              </span>
              {summary.address}
            </p>
          ) : null}
          <p data-testid="doc-change-doc">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 block">
              Document
            </span>
            {summary.docLabel}
          </p>
          <p data-testid="doc-change-amounts">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 block">
              Amount
            </span>
            <span className="line-through text-slate-400 mr-1">{summary.beforeFmt}</span>
            <span className="font-extrabold text-red-700">→ {summary.afterFmt}</span>
          </p>
          {(summary.beforeDesc || summary.afterDesc) && (
            <p data-testid="doc-change-desc">
              <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 block">
                Description
              </span>
              <span className="text-slate-400 text-xs block">{summary.beforeDesc || "—"}</span>
              <span className="font-semibold text-xs block mt-0.5">→ {summary.afterDesc || "—"}</span>
            </p>
          )}
          {summary.sourceText ? (
            <p className="text-xs text-slate-500 pt-1 border-t border-slate-200">
              From {summary.agent}: “{summary.sourceText}”
            </p>
          ) : (
            <p className="text-xs text-slate-500 pt-1 border-t border-slate-200">
              Remote change by {summary.agent}
            </p>
          )}
        </div>

        <p className="text-[11px] text-slate-500">
          Live books stay at {summary.beforeFmt} until you approve. ✕ reminds you in {DOC_CHANGE_SNOOZE_MINUTES} min.
        </p>

        <button
          type="button"
          className="btn-brand w-full"
          disabled={busy}
          onClick={approveAsProposed}
          data-testid="doc-change-approve"
        >
          Approve
        </button>
        <button
          type="button"
          className="btn w-full bg-slate-100 text-slate-800"
          disabled={busy}
          onClick={() => setEditing({ job, kind })}
          data-testid="doc-change-edit"
        >
          Edit
        </button>
        <button
          type="button"
          className="btn w-full border border-red-200 text-red-700 bg-red-50"
          disabled={busy}
          onClick={deny}
          data-testid="doc-change-deny"
        >
          Deny
        </button>
        <button
          type="button"
          className="btn-ghost w-full !py-2 text-xs"
          onClick={openJob}
          data-testid="doc-change-open-job"
        >
          Open job
        </button>
      </div>
    </PromptSurface>
  );
}
