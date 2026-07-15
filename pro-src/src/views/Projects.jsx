// Joy Construction customer hub — customer card, job info, requisition billing.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../data/adapter.js";
import Sheet, { Fld } from "../components/Sheet.jsx";
import CustomerCard from "../components/CustomerCard.jsx";
import RequisitionDetail from "../components/requisition/RequisitionDetail.jsx";
import ChangeOrdersPanel from "../components/requisition/ChangeOrdersPanel.jsx";
import { useStore } from "../state/store.jsx";
import { isChangeOrderItem, itemEarned, itemPreviouslyEarned, overallPct, requisitionItems } from "../lib/requisitionCalc.js";
import {
  BAEZ_PROJECT_ID,
  ensureProjectDefaults,
  findBaezJob,
  findProject,
  fmtUsd,
  JOY_CONSTRUCTION_NAME,
  joyCustomerKey,
  normalizeProjects,
  projectCustomerContact,
  seedBaezProject,
  upsertProject,
} from "../lib/requisitionData.js";
import {
  activeRequisitions,
  applyCarriedPercentages,
  buildDraftG702,
  canHardDeleteRequisition,
  completionBreakdown,
  createRequisitionRecord,
  nextRequisitionNum,
  pctChangeStatus,
  previousPctByItemId,
  reconcileRequisitionFinancials,
  removeRequisition,
  requisitionBalance,
  requisitionDeleteMode,
  sovItemKey,
  certifiedPaidToDate,
  totalPaidToDate,
  unreconciledPayments,
} from "../lib/requisitionHelpers.js";
import { downloadRequisitionPdf } from "../lib/requisitionPdf.js";
import { downloadRequisitionExcel } from "../lib/requisitionExcel.js";
import { customerAmountSummary } from "../lib/customers.js";
import { parseSovCsv } from "../lib/sovParser.js";

function pctInput(val, onChange, status) {
  const cls =
    status === "changed"
      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
      : status === "unchanged"
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-red-50/60 text-red-600 border-red-100";
  const display = Number.isFinite(Number(val)) ? Number(val) : 0;
  return (
    <input
      type="number"
      min={0}
      max={100}
      step={1}
      className={`w-16 text-right border rounded px-1 py-0.5 text-sm ${cls}`}
      value={display}
      onFocus={(e) => e.target.select()}
      onClick={(e) => e.target.select()}
      onChange={(e) => onChange(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
      data-testid="sov-pct-input"
    />
  );
}

function JobInfoCard({ job, project, onAddJob }) {
  if (job) {
    return (
      <div className="card px-4 py-3 space-y-2" data-testid="requisition-job-card">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-extrabold text-slate-700 uppercase tracking-wide">Job</h2>
          <Link to={"/job/" + encodeURIComponent(job.id)} className="text-sm font-semibold text-brand">
            Open job →
          </Link>
        </div>
        <div className="font-bold text-slate-900">{job.title || project.name}</div>
        <div className="text-xs text-slate-500">{job.serviceAddress || job.address || project.address}</div>
        {job.customer ? <div className="text-sm text-slate-600">{job.customer}</div> : null}
      </div>
    );
  }
  return (
    <div className="card px-4 py-3 space-y-2" data-testid="requisition-job-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold text-slate-700 uppercase tracking-wide">Job</h2>
        <button type="button" className="text-sm font-semibold text-brand" onClick={onAddJob} data-testid="add-job-btn">
          Add a job
        </button>
      </div>
      <div className="font-bold text-slate-900">{project.name}</div>
      <div className="text-xs text-slate-500">{project.address}</div>
      <p className="text-xs text-slate-400">No linked job yet — tap Add a job to connect this project.</p>
    </div>
  );
}

function DriveAttachSheet({ project, onSave, onClose }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const links = project.driveLinks || [];

  const add = () => {
    const u = url.trim();
    if (!u) return;
    const next = {
      ...project,
      driveLinks: [...links, { label: label.trim() || "Google Drive file", url: u, addedAt: Date.now() }],
    };
    onSave(next);
    setLabel("");
    setUrl("");
  };

  return (
    <Sheet title="Attach Google Drive" onClose={onClose} testId="drive-attach-sheet">
      <p className="text-sm text-slate-500 mb-3">
        Paste a Google Drive folder or file link — bookmarks your SOV and requisition docs. Use Upload SOV for CSV import.
      </p>
      <Fld label="Label (optional)" value={label} onChange={setLabel} placeholder="SOV, Req 12, etc." />
      <Fld label="Google Drive link" value={url} onChange={setUrl} placeholder="https://drive.google.com/..." />
      <button type="button" className="btn w-full mt-2" onClick={add} disabled={!url.trim()} data-testid="drive-attach-save">
        Attach file
      </button>
      {links.length ? (
        <div className="mt-4 space-y-2" data-testid="drive-links-list">
          {links.map((l, i) => (
            <a
              key={l.url + i}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="block card px-3 py-2 text-sm text-brand font-semibold truncate"
            >
              📎 {l.label}
            </a>
          ))}
        </div>
      ) : null}
    </Sheet>
  );
}

function SovUpload({ onParsed, onReplace, projectName }) {
  const [err, setErr] = useState("");
  const [mode, setMode] = useState("replace");
  const onFile = (e) => {
    setErr("");
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseSovCsv(reader.result);
        if (!parsed.items.length) throw new Error("No line items found");
        if (mode === "replace") onReplace?.(parsed);
        else onParsed(parsed);
      } catch (ex) {
        setErr(ex.message || "Could not read file");
      }
    };
    reader.readAsText(file);
  };
  return (
    <div className="space-y-3" data-testid="sov-upload">
      <p className="text-sm text-slate-500">
        Schedule SOV CSV — line items, values, and sections. This is the working import path (Drive auto-pull coming next).
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className={`btn btn-sm flex-1 ${mode === "replace" ? "bg-brand text-white" : ""}`}
          onClick={() => setMode("replace")}
        >
          Update {projectName || "project"}
        </button>
        <button
          type="button"
          className={`btn btn-sm flex-1 ${mode === "new" ? "bg-brand text-white" : ""}`}
          onClick={() => setMode("new")}
        >
          New project
        </button>
      </div>
      <input type="file" accept=".csv,.txt" onChange={onFile} className="text-sm" />
      {err ? <p className="text-xs text-red-600">{err}</p> : null}
    </div>
  );
}

function RequisitionHistoryList({ project, onSelect, onDelete, busy }) {
  // Newest first — Req 13 → Req 1.
  const reqs = [...(project?.requisitions || [])].sort((a, b) => (b.num || 0) - (a.num || 0));
  const visible = reqs.filter((r) => r.status !== "void");
  if (!visible.length) {
    return <p className="text-sm text-slate-400 text-center py-8" data-testid="req-history-empty">No requisition history yet.</p>;
  }
  const certified = certifiedPaidToDate(project);
  const paidToDate = totalPaidToDate(project);
  const unreconciled = unreconciledPayments(project);
  return (
    <div className="space-y-2" data-testid="requisition-history">
      <div className="card px-4 py-3" data-testid="paid-to-date-summary">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Certified (G702)</span>
          <span className="tabular-nums font-semibold">{fmtUsd(certified)}</span>
        </div>
        {(project?.otherPayments || []).map((p) => (
          <div key={p.id} className="flex justify-between text-sm mt-1" data-testid={`other-payment-${p.id}`}>
            <span className="text-amber-700">
              {p.label || "Other payment"}
              {!p.reconciled ? (
                <span className="ml-1 text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
                  unreconciled
                </span>
              ) : null}
            </span>
            <span className="tabular-nums font-semibold text-amber-700">{fmtUsd(p.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between text-sm mt-1 pt-1 border-t border-slate-200">
          <span className="font-bold text-slate-800">Paid to date</span>
          <span className="tabular-nums font-extrabold" data-testid="paid-to-date-total">{fmtUsd(paidToDate)}</span>
        </div>
        {unreconciled.length ? (
          <p className="text-[11px] text-amber-600 mt-1">
            Includes {fmtUsd(unreconciled.reduce((s, p) => s + (Number(p.amount) || 0), 0))} received but not tied to a
            certified draw — the G702 certified figure is unchanged.
          </p>
        ) : null}
      </div>
      <p className="text-xs text-slate-500 text-center">{visible.length} requisitions in project history</p>
      {reqs.map((r) => {
        if (r.status === "void") return null;
        const delMode = requisitionDeleteMode(project, r);
        const statusLabel =
          r.status === "submitted" ? "Submitted" : r.status === "generated" ? "Generated" : r.status || "Saved";
        return (
          <div key={r.id} className="card px-4 py-3 text-sm" data-testid={`req-history-${r.num}`}>
            <div className="flex justify-between items-start gap-2">
              <button type="button" className="text-left flex-1 hover:opacity-80" onClick={() => onSelect(r.id)}>
                <span className="font-bold text-slate-900 block">
                  {r.applicationNumber || `REQ-${r.num}`}
                </span>
                <span className="text-xs text-slate-500 mt-1 block">
                  {r.periodTo || "—"} · {fmtUsd(r.currentPaymentDue)} due · {fmtUsd(requisitionBalance(r))} balance
                </span>
              </button>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    r.status === "submitted" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {statusLabel}
                </span>
                {delMode !== "none" ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-red-600"
                    disabled={busy}
                    onClick={() => onDelete?.(r)}
                    data-testid={`req-delete-${r.num}`}
                  >
                    {delMode === "delete" ? "Delete" : "Void"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function requisitionRichness(arr) {
  return (arr || []).reduce((s, r) => s + (r.itemsSnapshot?.length || 0) + (r.num ? 1 : 0), 0);
}

function mergeProjectItems(localItems, serverItems) {
  const pick = (localItems?.length || 0) >= (serverItems?.length || 0) ? localItems : serverItems;
  const other = pick === localItems ? serverItems : localItems;
  const otherByKey = Object.fromEntries((other || []).map((it) => [sovItemKey(it), it]));
  return (pick || []).map((it) => {
    const alt = otherByKey[sovItemKey(it)];
    const pct = Math.max(Number(it.completedPct) || 0, Number(alt?.completedPct) || 0);
    return pct > (Number(it.completedPct) || 0) ? { ...it, completedPct: pct } : it;
  });
}

function RequisitionWorkbench({ project, onSave, busy, showToast, onSaved }) {
  const carrySeed = useMemo(
    () => `${project?.id}:${project?.requisitions?.length}:${project?.requisitions?.at(-1)?.id || ""}`,
    [project?.id, project?.requisitions]
  );
  const [draft, setDraft] = useState(() => applyCarriedPercentages(project));
  const [periodTo, setPeriodTo] = useState(new Date().toISOString().slice(0, 10));
  const [reqNum, setReqNum] = useState(String(nextRequisitionNum(project)));
  const [appNum, setAppNum] = useState(`REQ-${nextRequisitionNum(project)}`);
  const [pendingReq, setPendingReq] = useState(null);
  // Manual "previously paid" (line 7). "" = use the auto cascade value.
  const [prevPaidInput, setPrevPaidInput] = useState("");
  const [prevPaidConfirmed, setPrevPaidConfirmed] = useState(false);
  // fill -> overview -> approve -> generate
  const [overview, setOverview] = useState(false);
  // Header fields auto-collapse to a compact summary once untouched for a beat.
  const [fieldsTouched, setFieldsTouched] = useState(false);
  const [fieldsCollapsed, setFieldsCollapsed] = useState(false);
  const dirty = JSON.stringify(draft.items) !== JSON.stringify(project.items);

  useEffect(() => setDraft(applyCarriedPercentages(project)), [carrySeed]);

  useEffect(() => {
    const n = nextRequisitionNum(project);
    setReqNum(String(n));
    setAppNum(`REQ-${n}`);
  }, [carrySeed]);

  useEffect(() => {
    if (dirty) setPendingReq(null);
  }, [dirty]);

  useEffect(() => {
    setPendingReq(null);
  }, [periodTo, reqNum, appNum]);

  const prevSnap = useMemo(() => previousPctByItemId(project), [project]);
  const hasPrev = Object.keys(prevSnap).length > 0;
  const prevOverride = prevPaidInput.trim() === "" ? undefined : prevPaidInput;
  const g702 = useMemo(
    () => buildDraftG702(draft, { periodTo, previousCertificates: prevOverride }),
    [draft, periodTo, prevOverride]
  );
  const previewG702 = pendingReq || g702;
  const completion = useMemo(() => completionBreakdown(draft.items), [draft.items]);

  // Consistency check: does the entered "previously paid" match what the prior
  // requisition certified (the auto value)?
  const prevMismatch =
    prevOverride != null &&
    Math.abs((Number(prevOverride) || 0) - (Number(g702.computedPreviousCertificates) || 0)) > 0.01;
  // Every SOV line already at 100% — the project is complete, so the next
  // requisition is the final/retainage draw (e.g. Baez Req 13); there's no % to
  // raise, so we allow generation without a fresh SOV change.
  const allComplete = useMemo(() => {
    const base = requisitionItems(draft.items);
    return base.length > 0 && base.every((it) => (Number(it.completedPct) || 0) >= 100);
  }, [draft.items]);
  // Generate gate: previously-paid confirmed AND (a SOV change was made OR the
  // project is already fully complete).
  const canGenerate = prevPaidConfirmed && (dirty || allComplete);

  // Auto-collapse the header fields after a short idle once untouched.
  useEffect(() => {
    if (fieldsTouched) {
      setFieldsCollapsed(false);
      return;
    }
    const t = setTimeout(() => setFieldsCollapsed(true), 4000);
    return () => clearTimeout(t);
  }, [fieldsTouched, periodTo, reqNum, appNum, prevPaidInput]);

  const setItemPct = (id, completedPct) => {
    setDraft((d) => ({
      ...d,
      items: d.items.map((it) => (it.id === id ? { ...it, completedPct } : it)),
    }));
  };

  const saveProgress = async () => {
    await onSave({ ...draft, updatedAt: Date.now() });
  };

  const buildPendingRecord = () => {
    const num = parseInt(reqNum, 10) || (draft.requisitions?.length || 0) + 1;
    return createRequisitionRecord(project, draft, {
      periodTo,
      num,
      applicationNumber: appNum.trim() || `REQ-${num}`,
      previousCertificates: prevOverride,
    });
  };

  // Consistency prompt — "Update the previous requisition" branch: pin the prior
  // requisition's certified total to the value Levi actually received, so the
  // whole ledger reconciles forward from the corrected number.
  const updatePreviousRequisition = async () => {
    const prev = activeRequisitions(project)[0];
    if (!prev || prevOverride == null) return;
    const elr = Math.round(Number(prevOverride) * 100) / 100;
    const patched = {
      ...prev,
      earnedLessRetainage: elr,
      g702: {
        ...(prev.g702 || {}),
        authoritative: true,
        source: "Adjusted from next requisition (Phase 3 consistency prompt)",
        earnedLessRetainage: elr,
      },
    };
    await onSave({
      ...draft,
      requisitions: (draft.requisitions || []).map((r) => (r.id === prev.id ? patched : r)),
    });
    setPrevPaidInput("");
    setPrevPaidConfirmed(true);
    showToast?.("Previous requisition updated — this requisition now reconciles");
  };

  const generatePreview = () => {
    const req = buildPendingRecord();
    setPendingReq(req);
    setOverview(false);
    downloadRequisitionPdf(project, req);
    showToast?.("Requisition generated — review the PDF, then save or regenerate");
  };

  const regeneratePreview = () => {
    const req = buildPendingRecord();
    setPendingReq(req);
    downloadRequisitionPdf(project, req);
    showToast?.("Requisition regenerated");
  };

  const savePending = async () => {
    if (!pendingReq) return;
    const next = applyCarriedPercentages({
      ...draft,
      requisitions: [...(draft.requisitions || []), pendingReq],
    });
    await onSave(next);
    setPendingReq(null);
    showToast?.("Requisition saved — open it from the card above for files and email");
    onSaved?.(pendingReq.id);
  };

  const sections = useMemo(() => {
    const groups = [];
    let cur = { name: "General", items: [] };
    for (const it of draft.items || []) {
      if (isChangeOrderItem(it)) continue;
      if (it.section && it.section !== cur.name) {
        if (cur.items.length) groups.push(cur);
        cur = { name: it.section, items: [] };
      }
      cur.items.push(it);
    }
    if (cur.items.length) groups.push(cur);
    return groups;
  }, [draft.items]);

  return (
    <div className="space-y-4" data-testid="requisition-panel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold text-slate-700 uppercase tracking-wide">New Requisition</h2>
        <span className="text-xs text-slate-500">
          {fmtUsd(draft.contractSum)} · {overallPct(requisitionItems(draft.items))}% · {draft.retainagePct}% retainage
        </span>
      </div>

      <p className="text-xs text-slate-500">
        <span className="inline-block w-3 h-3 bg-red-100 border border-red-200 rounded mr-1 align-middle" />
        Red = same as last submitted ·
        <span className="inline-block w-3 h-3 bg-emerald-100 border border-emerald-300 rounded mx-1 align-middle" />
        Green = you changed it
      </p>

      {dirty ? (
        <button type="button" className="btn w-full" onClick={saveProgress} disabled={busy}>
          Save progress %
        </button>
      ) : null}

      <div className="card px-4 py-3 space-y-2 text-sm" data-testid="requisition-preview-live">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <span className="text-slate-500">Original contract done</span>
          <span className="text-right font-semibold">{fmtUsd(completion.baseCompleted)}</span>

          <span className="text-slate-500">Total completed &amp; stored to date</span>
          <span className="text-right font-semibold">{fmtUsd(previewG702.totalCompleted)}</span>
          <span className="text-slate-500 font-semibold">Total earned, less retainage</span>
          <span className="text-right font-bold">{fmtUsd(previewG702.earnedLessRetainage)}</span>
          <span className="text-slate-500">Less previous certified for payment</span>
          <span className="text-right">{fmtUsd(previewG702.previousCertificates)}</span>
          <span className="text-slate-500 font-bold">Current payment due</span>
          <span className="text-right font-extrabold text-brand">{fmtUsd(previewG702.currentPaymentDue)}</span>
        </div>
      </div>

      {fieldsCollapsed && !fieldsTouched ? (
        <button
          type="button"
          className="w-full text-left text-xs text-slate-500 border rounded px-3 py-2 bg-slate-50 flex items-center justify-between"
          onClick={() => {
            setFieldsTouched(true);
            setFieldsCollapsed(false);
          }}
          data-testid="req-fields-collapsed"
        >
          <span>
            <b>{appNum}</b> · {periodTo} · Prev paid {fmtUsd(previewG702.previousCertificates)}
          </span>
          <span className="text-brand font-semibold">Edit ▾</span>
        </button>
      ) : (
        <div className="space-y-2" data-testid="req-fields">
          <div className="flex gap-2 items-end flex-wrap" onFocusCapture={() => setFieldsTouched(true)}>
            <label className="text-sm">
              Period to
              <input type="date" className="block border rounded px-2 py-1 mt-1" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
            </label>
            <label className="text-sm">
              Req #
              <input
                type="number"
                className="block border rounded px-2 py-1 mt-1 w-16"
                value={reqNum}
                onChange={(e) => {
                  setReqNum(e.target.value);
                  if (!appNum.startsWith("REQ-") || appNum === `REQ-${reqNum}`) setAppNum(`REQ-${e.target.value}`);
                }}
                data-testid="req-num-input"
              />
            </label>
            <label className="text-sm flex-1 min-w-[120px]">
              Application #
              <input
                className="block border rounded px-2 py-1 mt-1 w-full"
                value={appNum}
                onChange={(e) => setAppNum(e.target.value)}
                data-testid="app-num-input"
              />
            </label>
          </div>

          <div className="rounded border border-slate-200 p-2 bg-slate-50/60">
            <label className="text-sm block">
              Previously paid (previous certificates)
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  step="0.01"
                  className="block border rounded px-2 py-1 w-40 tabular-nums"
                  value={prevPaidInput}
                  placeholder={String(g702.computedPreviousCertificates ?? 0)}
                  onChange={(e) => {
                    setFieldsTouched(true);
                    setPrevPaidInput(e.target.value);
                    setPrevPaidConfirmed(false);
                  }}
                  data-testid="prev-paid-input"
                />
                <label className="text-xs flex items-center gap-1 text-slate-600">
                  <input
                    type="checkbox"
                    checked={prevPaidConfirmed}
                    onChange={(e) => setPrevPaidConfirmed(e.target.checked)}
                    data-testid="prev-paid-confirm"
                  />
                  Confirmed
                </label>
              </div>
            </label>
            <p className="text-[11px] text-slate-500 mt-1">
              Auto (from prior req): {fmtUsd(g702.computedPreviousCertificates)}. Leave blank to use it, or enter the amount actually received.
            </p>
            {prevMismatch ? (
              <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs" data-testid="prev-paid-mismatch">
                <p className="font-semibold text-amber-800">
                  Entered {fmtUsd(Number(prevOverride))} ≠ prior requisition’s {fmtUsd(g702.computedPreviousCertificates)}.
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    className="btn flex-1 text-xs !py-1 bg-brand text-white"
                    onClick={updatePreviousRequisition}
                    disabled={busy}
                    data-testid="update-prev-req"
                  >
                    Update the previous requisition
                  </button>
                  <button
                    type="button"
                    className="btn flex-1 text-xs !py-1"
                    onClick={() => setPrevPaidConfirmed(true)}
                    data-testid="keep-this-req"
                  >
                    Change this one (keep entered)
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {pendingReq ? (
        <div className="space-y-2" data-testid="requisition-approval">
          <p className="text-xs text-emerald-700 font-semibold text-center">
            {pendingReq.applicationNumber} ready — review the PDF, then save or regenerate
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn flex-1 bg-brand text-white"
              onClick={savePending}
              disabled={busy}
              data-testid="save-requisition"
            >
              Save requisition
            </button>
            <button
              type="button"
              className="btn flex-1"
              onClick={regeneratePreview}
              disabled={busy}
              data-testid="regenerate-requisition"
            >
              Regenerate requisition
            </button>
          </div>
          <button
            type="button"
            className="btn w-full"
            onClick={() => downloadRequisitionExcel(project, pendingReq)}
            disabled={busy}
            data-testid="download-req-excel-draft"
          >
            Download Excel (.xls)
          </button>
        </div>
      ) : overview ? (
        <div className="space-y-2 rounded border border-brand/30 bg-brand/5 p-3" data-testid="requisition-overview">
          <p className="text-xs font-extrabold text-brand uppercase tracking-wide">Overview — approve to generate</p>
          <dl className="text-sm space-y-1">
            {[
              ["Total completed", previewG702.totalCompleted],
              ["Retainage", previewG702.totalRetainage],
              ["Earned less retainage", previewG702.earnedLessRetainage],
              ["Previously paid", previewG702.previousCertificates],
              ["Current payment due", previewG702.currentPaymentDue],
              ["Balance to finish", previewG702.balanceToFinish],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt className="text-slate-600">{k}</dt>
                <dd className="tabular-nums font-semibold">{fmtUsd(v)}</dd>
              </div>
            ))}
          </dl>
          <div className="flex gap-2 pt-1">
            <button type="button" className="btn flex-1" onClick={() => setOverview(false)} data-testid="overview-back">
              ← Back to edit
            </button>
            <button
              type="button"
              className="btn flex-1 bg-brand text-white"
              onClick={generatePreview}
              disabled={busy}
              data-testid="approve-generate"
            >
              Approve & generate
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="btn w-full bg-brand text-white disabled:opacity-40"
            onClick={() => setOverview(true)}
            disabled={busy || !canGenerate}
            data-testid="generate-requisition"
          >
            Review &amp; approve →
          </button>
          {!canGenerate ? (
            <p className="text-[11px] text-slate-500 text-center mt-1" data-testid="generate-gate-hint">
              {!prevPaidConfirmed
                ? "Confirm “Previously paid” to generate."
                : "Raise at least one line’s % to generate the next draw."}
            </p>
          ) : null}
        </>
      )}

      <div className="space-y-3">
        {sections.map((sec) => (
          <div key={sec.name} className="card overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 font-bold text-sm border-b">{sec.name}</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b">
                  <th className="text-left px-3 py-2">Item</th>
                  <th className="text-right px-2 py-2">Schedule value</th>
                  <th className="text-right px-2 py-2">From previous application</th>
                  <th className="text-right px-2 py-2">Total comp completed</th>
                  <th className="text-right px-2 py-2">% G/C</th>
                </tr>
              </thead>
              <tbody>
                {sec.items.map((it) => {
                  const status = pctChangeStatus(it.completedPct, prevSnap[it.id], hasPrev);
                  const prevPct = prevSnap[it.id] ?? 0;
                  return (
                    <tr key={it.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2">{it.description}</td>
                      <td className="text-right px-2 py-2 tabular-nums">{fmtUsd(it.value)}</td>
                      <td className="text-right px-2 py-2 tabular-nums">{fmtUsd(itemPreviouslyEarned(it, prevPct))}</td>
                      <td className="text-right px-2 py-2 tabular-nums">{fmtUsd(itemEarned(it))}</td>
                      <td className="text-right px-2 py-2">
                        {pctInput(it.completedPct, (v) => setItemPct(it.id, v), status)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Projects() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { jobs, setNewJob, showToast } = useStore();
  const [projects, setProjects] = useState({ list: [] });
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [booted, setBooted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Default landing = Create New Requisition; History is a deliberate tab.
  const [hubTab, setHubTab] = useState("work");
  const [selectedReqId, setSelectedReqId] = useState(null);

  // Normalize stored requisition financials on every read so the G702 identity
  // (line 6 = line 7 + line 8) and cumulative "previously paid" are always
  // rebuilt from the SOV snapshot chain — self-heals any legacy/imported data.
  const reconcileProjects = (norm) => ({
    list: (norm?.list || []).map((p) => (p?.requisitions?.length ? reconcileRequisitionFinancials(p) : p)),
  });

  const load = useCallback(async () => {
    const raw = await api.getProjects?.().catch(() => ({ list: [] }));
    setProjects(reconcileProjects(normalizeProjects(raw)));
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const mergeWithServerProjects = (local, serverRaw) => {
    const server = normalizeProjects(serverRaw);
    const localList = local?.list || [];
    const serverList = server?.list || [];
    const merged = serverList.map((serverP) => {
      const localP = localList.find((p) => p.id === serverP.id);
      if (!localP) return serverP;
      const localReqs = localP.requisitions || [];
      const serverReqs = serverP.requisitions || [];
      const requisitions =
        requisitionRichness(serverReqs) > requisitionRichness(localReqs)
          ? serverReqs
          : requisitionRichness(localReqs) > requisitionRichness(serverReqs)
          ? localReqs
          : serverReqs.length >= localReqs.length
          ? serverReqs
          : localReqs;
      const items = mergeProjectItems(localP.items, serverP.items);
      return { ...serverP, ...localP, items, requisitions };
    });
    for (const localP of localList) {
      if (!merged.find((p) => p.id === localP.id)) merged.push(localP);
    }
    return { list: merged };
  };

  const persist = async (next) => {
    setBusy(true);
    try {
      const normalized = normalizeProjects(next);
      const latest = await api.getProjects?.().catch(() => ({ list: [] }));
      const merged = reconcileProjects(mergeWithServerProjects(normalized, latest));
      await api.saveProjects?.(merged);
      setProjects(merged);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!loaded || booted) return;
    const list = projects?.list || [];
    if (!list.length) {
      (async () => {
        const seeded = seedBaezProject();
        const next = upsertProject(projects, seeded);
        await persist(next);
        setBooted(true);
        if (!projectId) navigate("/projects/" + BAEZ_PROJECT_ID, { replace: true });
      })();
      return;
    }
    setBooted(true);
    if (!projectId && findProject(projects, BAEZ_PROJECT_ID)) {
      navigate("/projects/" + BAEZ_PROJECT_ID, { replace: true });
    } else if (projectId && !findProject(projects, projectId) && findProject(projects, BAEZ_PROJECT_ID)) {
      navigate("/projects/" + BAEZ_PROJECT_ID, { replace: true });
    }
  }, [projects, booted, loaded, projectId, navigate]);

  const rawProject = findProject(projects, projectId || BAEZ_PROJECT_ID);
  const project = rawProject ? ensureProjectDefaults(rawProject) : null;
  const linkedJob = useMemo(() => {
    if (!project) return null;
    if (project.jobId) return (jobs || []).find((j) => j.id === project.jobId) || null;
    return findBaezJob(jobs);
  }, [project, jobs]);

  const contact = useMemo(() => (project ? projectCustomerContact(project, linkedJob) : null), [project, linkedJob]);
  const summary = useMemo(
    () => (linkedJob ? customerAmountSummary([linkedJob]) : { due: 0, invoiced: 0, paid: 0, openInvoices: 0, jobCount: 0 }),
    [linkedJob]
  );

  const selectedReq = useMemo(
    () => (project?.requisitions || []).find((r) => r.id === selectedReqId) || null,
    [project, selectedReqId]
  );

  const onEnableRequisitions = async () => {
    if (!project) return;
    await persist(upsertProject(projects, { ...project, requisitionEnabled: true }));
    showToast?.("Requisition system enabled for " + project.name);
  };

  const onAddJob = () => {
    setNewJob?.({
      step: "form",
      prefill: {
        customer: JOY_CONSTRUCTION_NAME,
        businessName: project?.gc || JOY_CONSTRUCTION_NAME,
        title: project?.name || "Baez Place",
        serviceAddress: project?.address || "",
        address: project?.address || "",
      },
    });
  };

  const onSaveProject = async (p) => {
    const patch = { ...p };
    if (linkedJob && !patch.jobId) patch.jobId = linkedJob.id;
    const next = upsertProject(projects, patch);
    await persist(next);
  };

  const onUpdateRequisition = async (updatedReq) => {
    if (!project) return;
    const requisitions = (project.requisitions || []).map((r) => (r.id === updatedReq.id ? updatedReq : r));
    await onSaveProject({ ...project, requisitions });
  };

  const onDeleteRequisition = async (req) => {
    if (!project || !req) return;
    const mode = requisitionDeleteMode(project, req);
    const label = mode === "delete" ? "Delete" : "Void";
    const extra =
      mode === "blocked"
        ? "Later requisitions depend on this one — it will be voided, not removed."
        : "";
    if (!window.confirm(`${label} ${req.applicationNumber || `REQ-${req.num}`}? ${extra}`.trim())) return;
    const next = removeRequisition(project, req.id, { forceVoid: mode === "blocked" });
    await onSaveProject(next);
    if (selectedReqId === req.id) setSelectedReqId(null);
    showToast?.(mode === "delete" ? "Requisition deleted" : "Requisition voided");
  };

  const onNewFromSov = async (parsed) => {
    const id = "proj-" + Date.now();
    const fresh = ensureProjectDefaults({
      id,
      name: parsed.name || "New Project",
      address: "",
      contractor: "Martin Dorkin",
      gc: project?.gc || "",
      customerKey: joyCustomerKey(),
      contractSum: parsed.contractSum,
      retainagePct: 10,
      changeOrders: 0,
      changeOrderList: [],
      items: parsed.items,
      requisitions: [],
      requisitionEnabled: true,
      driveLinks: [],
      jobId: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const next = upsertProject(projects, fresh);
    await persist(next);
    setSheet(null);
    navigate("/projects/" + id);
  };

  const onReplaceSov = async (parsed) => {
    if (!project) return;
    const next = {
      ...project,
      contractSum: parsed.contractSum,
      items: parsed.items.map((it, i) => ({
        ...it,
        completedPct: project.items?.find((x) => x.description === it.description)?.completedPct ?? it.completedPct ?? 0,
        id: project.items?.[i]?.id || it.id,
      })),
      updatedAt: Date.now(),
    };
    await onSaveProject(next);
    setSheet(null);
    showToast?.("SOV updated from CSV");
  };

  if (!project) {
    return (
      <div className="card px-6 py-12 text-center text-slate-400 text-sm" data-testid="projects-loading">
        Loading Joy Construction…
      </div>
    );
  }

  const custKey = project.customerKey || joyCustomerKey();
  const projectList = (projects?.list || []).filter((p) => (p.customerKey || joyCustomerKey()) === custKey);

  return (
    <div className="space-y-4 pb-8" data-testid="joy-requisition-hub">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-slate-900">{JOY_CONSTRUCTION_NAME}</h1>
        <Link to={"/customer/" + encodeURIComponent(custKey)} className="text-sm font-semibold text-brand shrink-0" data-testid="joy-customer-link">
          Customer →
        </Link>
      </div>

      <CustomerCard contact={contact} summary={summary} mapAddress={project.address} primaryJob={linkedJob} showSummary={!!linkedJob} />

      {projectList.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1" data-testid="joy-project-tabs">
          {projectList.map((p) => (
            <Link
              key={p.id}
              to={"/projects/" + p.id}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold border ${
                p.id === project.id ? "bg-brand text-white border-brand" : "bg-white text-slate-600 border-slate-200"
              }`}
            >
              {p.name}
            </Link>
          ))}
        </div>
      ) : null}

      <JobInfoCard job={linkedJob} project={project} onAddJob={onAddJob} />

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm" onClick={onAddJob} data-testid="hub-add-job">
          Add a job
        </button>
        {!project.requisitionEnabled ? (
          <button type="button" className="btn btn-sm bg-brand text-white" onClick={onEnableRequisitions} disabled={busy} data-testid="enable-requisition">
            Enable requisitions
          </button>
        ) : (
          <span className="text-xs font-semibold text-emerald-700 self-center px-2" data-testid="requisition-enabled-badge">
            Requisitions on
          </span>
        )}
        <button type="button" className="btn btn-sm" onClick={() => setSheet({ kind: "drive" })} data-testid="attach-drive">
          Attach Google Drive
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setSheet({ kind: "sov" })} data-testid="upload-sov">
          Upload SOV
        </button>
      </div>

      {(project.driveLinks || []).length ? (
        <div className="flex flex-wrap gap-2" data-testid="drive-links-chips">
          {(project.driveLinks || []).map((l, i) => (
            <a key={l.url + i} href={l.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand bg-slate-50 border border-slate-200 rounded-full px-3 py-1">
              📎 {l.label}
            </a>
          ))}
        </div>
      ) : null}

      {project.requisitionEnabled ? (
        selectedReq ? (
          <RequisitionDetail
            project={project}
            requisition={selectedReq}
            contact={contact}
            jobs={jobs}
            onUpdate={onUpdateRequisition}
            onDelete={() => onDeleteRequisition(selectedReq)}
            canDelete={canHardDeleteRequisition(project, selectedReq)}
            deleteBlocked={requisitionDeleteMode(project, selectedReq) === "blocked"}
            onClose={() => setSelectedReqId(null)}
            busy={busy}
            showToast={showToast}
          />
        ) : (
          <>
            <div className="flex gap-1 overflow-x-auto pb-1" data-testid="hub-tabs">
              {[
                { id: "work", label: "Create New Requisition" },
                { id: "history", label: "Requisition History" },
                { id: "changes", label: "Change Orders" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold border ${
                    hubTab === t.id ? "bg-brand text-white border-brand" : "bg-white text-slate-600 border-slate-200"
                  }`}
                  onClick={() => {
                    if (t.id === "history") load();
                    setHubTab(t.id);
                  }}
                  data-testid={`hub-tab-${t.id}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {hubTab === "work" ? (
              <RequisitionWorkbench
                project={project}
                onSave={onSaveProject}
                busy={busy}
                showToast={showToast}
                onSaved={(id) => setSelectedReqId(id)}
              />
            ) : null}
            {hubTab === "history" ? (
              <RequisitionHistoryList
                project={project}
                onSelect={setSelectedReqId}
                onDelete={onDeleteRequisition}
                busy={busy}
              />
            ) : null}
            {hubTab === "changes" ? <ChangeOrdersPanel project={project} onSave={onSaveProject} busy={busy} /> : null}
          </>
        )
      ) : (
        <div className="card px-4 py-6 text-center text-sm text-slate-500" data-testid="requisition-disabled">
          Tap Enable requisitions to unlock SOV progress billing for this project.
        </div>
      )}

      {sheet?.kind === "drive" ? <DriveAttachSheet project={project} onSave={onSaveProject} onClose={() => setSheet(null)} /> : null}
      {sheet?.kind === "sov" ? (
        <Sheet title="Upload SOV (CSV)" onClose={() => setSheet(null)}>
          <SovUpload onParsed={onNewFromSov} onReplace={onReplaceSov} projectName={project.name} />
        </Sheet>
      ) : null}
    </div>
  );
}