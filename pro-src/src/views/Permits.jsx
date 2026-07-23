// Permits — cross-job Con Edison + City/DOB open-case tracker.
//
// This is the visible surface for the permit module. It reads every job's
// permit data (persisted or derived in-memory from applied Con Ed emails) and
// lays it out as: an action-needed strip up top, then one section per agency.
//
// Gating: the route is only mounted when tenant_config.modules.permits is on
// (see tenantNav.js / App.jsx). The guard below is belt-and-suspenders.

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import { useTenantConfig } from "../state/tenant.jsx";
import { isModuleEnabled } from "../lib/tenantConfig.js";
import { buildPermitBoard, isActionNeeded } from "../lib/permitsBoard.js";
import { computeConedBackfill, applyConedBackfill } from "../lib/permitBackfill.js";

/** Health/bucket → pill tone, mirroring the JobDetail Con Ed chip. */
function stageTone(row) {
  if (row.health === "blocked-by-us") return "bg-red-100 text-red-800";
  if (row.health === "at-risk") return "bg-amber-100 text-amber-900";
  if (row.stageBucket === "Passed" || row.stageBucket === "Terminal") return "bg-emerald-100 text-emerald-800";
  if (row.stageBucket === "Scheduled") return "bg-brand-soft text-brand";
  return "bg-violet-100 text-violet-900";
}

function fmtWhen(iso) {
  if (!iso) return "";
  const s = String(iso);
  if (s.includes("T")) return s.replace("T", " ").slice(0, 16);
  return s.slice(0, 10);
}

function CaseRow({ row, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(row.jobId)}
      data-testid="permit-case-row"
      className="card w-full text-left px-4 py-3 flex items-start gap-3"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <b className="truncate">{row.jobName}</b>
          {row.caseNumber ? (
            <span className="text-[11px] font-semibold text-slate-500 shrink-0">{row.caseNumber}</span>
          ) : null}
        </div>
        {row.address ? <div className="text-xs text-slate-500 truncate">{row.address}</div> : null}
        {row.nextAction ? (
          <div className={`text-xs mt-0.5 ${isActionNeeded(row) ? "text-red-700 font-medium" : "text-slate-500"}`}>
            {row.nextAction}
            {row.nextActionDate && !row.nextAction.includes(fmtWhen(row.nextActionDate))
              ? ` · ${fmtWhen(row.nextActionDate)}`
              : ""}
          </div>
        ) : null}
      </div>
      <span className={`pill shrink-0 ${stageTone(row)}`}>{row.stageLabel}</span>
    </button>
  );
}

export default function Permits() {
  const { jobs, emailInsights, patchAndSave, showToast } = useStore();
  const config = useTenantConfig();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const board = useMemo(
    () => buildPermitBoard({ jobs, insights: emailInsights, config }),
    [jobs, emailInsights, config]
  );

  // How many jobs would gain/refresh a persisted Con Ed record if synced.
  const backfillPlan = useMemo(
    () => computeConedBackfill({ jobs, insights: emailInsights }),
    [jobs, emailInsights]
  );

  if (!isModuleEnabled(config, "permits")) return null;

  const open = (jobId) => jobId && nav(`/job/${jobId}`);

  const runBackfill = async () => {
    setBusy(true);
    try {
      const res = await applyConedBackfill({ jobs, insights: emailInsights, patchJob: patchAndSave });
      showToast(res.changed ? `Synced ${res.changed} Con Ed case${res.changed === 1 ? "" : "s"} to jobs` : "Already up to date");
    } catch {
      showToast("Sync failed — try again");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const { counts, actionNeeded, sections } = board;
  const hasAny = counts.total > 0;

  return (
    <div className="pb-24">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
          Permits · {counts.total} open case{counts.total === 1 ? "" : "s"}
        </h2>
        {backfillPlan.length ? (
          <button
            type="button"
            className="text-[11px] font-semibold text-brand underline underline-offset-2 shrink-0"
            data-testid="permit-backfill-btn"
            onClick={() => setConfirming(true)}
          >
            Sync {backfillPlan.length} to jobs
          </button>
        ) : null}
      </div>

      {/* Count chips */}
      {hasAny ? (
        <div className="flex flex-wrap gap-2 mb-3 px-1 text-[11px]">
          {counts.actionNeeded ? (
            <span className="pill bg-red-100 text-red-800">⚠ {counts.actionNeeded} need action</span>
          ) : null}
          {counts.scheduled ? (
            <span className="pill bg-brand-soft text-brand">📅 {counts.scheduled} scheduled</span>
          ) : null}
          {counts.open ? <span className="pill bg-violet-100 text-violet-900">{counts.open} open</span> : null}
          {counts.passed ? <span className="pill bg-emerald-100 text-emerald-800">✓ {counts.passed} passed</span> : null}
        </div>
      ) : null}

      {/* Action-needed strip */}
      {actionNeeded.length ? (
        <div className="mb-4" data-testid="permit-action-strip">
          <div className="text-[11px] font-extrabold text-red-700 uppercase tracking-wider mb-1.5 px-1">
            Action needed ({actionNeeded.length})
          </div>
          <div className="space-y-2">
            {actionNeeded.map((row) => (
              <CaseRow key={`an:${row.key}`} row={row} onOpen={open} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Per-agency sections */}
      {sections.map((sec) => (
        <div key={sec.agency} className="mb-4" data-testid={`permit-section-${sec.agency}`}>
          <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5 px-1">
            {sec.label} ({sec.cases.length})
          </div>
          {sec.cases.length ? (
            <div className="space-y-2">
              {sec.cases.map((row) => (
                <CaseRow key={row.key} row={row} onOpen={open} />
              ))}
              {sec.agency === "dob" && sec.cases.some((c) => c.interim) ? (
                <div className="text-[11px] text-slate-400 px-1">
                  City / DOB cases are read-only for now — full stage tracking ships in the next update.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="card px-4 py-6 text-center text-sm text-slate-400">
              No open {sec.label} cases.
            </div>
          )}
        </div>
      ))}

      {!hasAny && !sections.length ? (
        <div className="card px-4 py-10 text-center text-sm text-slate-400">
          <span className="block text-3xl mb-2">📄</span>
          No permit cases yet.
          <br />
          Con Edison &amp; City emails appear here as they arrive.
        </div>
      ) : null}

      {/* Backfill confirm */}
      {confirming ? (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setConfirming(false)}>
          <div className="card w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
            <div className="font-bold mb-1">Sync Con Ed cases to jobs?</div>
            <p className="text-sm text-slate-600 mb-3">
              Writes {backfillPlan.length} Con Edison case{backfillPlan.length === 1 ? "" : "s"} onto their jobs so the
              stage also shows on each job&apos;s Paperwork. This just saves what&apos;s already shown here.
            </p>
            <div className="flex gap-2 justify-end">
              <button className="btn bg-slate-100 text-slate-600" onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </button>
              <button className="btn bg-brand text-white" onClick={runBackfill} disabled={busy}>
                {busy ? "Syncing…" : `Sync ${backfillPlan.length}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
