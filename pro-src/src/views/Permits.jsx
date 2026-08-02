// Permits — cross-job Con Edison + City/DOB open-case tracker.
//
// This is the visible surface for the permit module. It reads every job's
// permit data (persisted or derived in-memory from applied Con Ed emails) and
// lays it out as: an action-needed strip up top, then one section per agency.
//
// Gating: the route is only mounted when tenant_config.modules.permits is on
// (see tenantNav.js / App.jsx). The guard below is belt-and-suspenders.
//
// Module boundary: src/modules/permits (meter application + lock-in checklist).

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import { useTenantConfig } from "../state/tenant.jsx";
import { isModuleEnabled } from "../lib/tenantConfig.js";
import { buildPermitBoard, isActionNeeded } from "../lib/permitsBoard.js";
import { computePermitBackfill, applyPermitBackfill } from "../lib/permitBackfill.js";
import MeterApplicationField from "../modules/permits/MeterApplicationField.jsx";
import FunctionalitiesLockIn from "../modules/permits/FunctionalitiesLockIn.jsx";
import {
  getMeterApplication,
  jobPatchMeterApplication,
  meterApplicationLabel,
} from "../modules/permits/meterApplication.js";
import {
  listPaperworkTodos,
  paperworkTodoLabel,
  readyToGoTodo,
  updatePaperworkTodoPatch,
} from "../lib/agencyForms/index.js";
import {
  listPaperworkJobsServer,
  paperworkJobStatusLabel,
  paperworkJobStatusTone,
  ACTIVE_PAPERWORK_JOB_STATUSES,
} from "../lib/paperworkJobs.js";
import PaperworkApprovalSheet from "../components/PaperworkApprovalSheet.jsx";

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

function CaseRow({ row, job, onOpen, onMeterApplication }) {
  const [expanded, setExpanded] = useState(false);
  const isConed = row.agency === "coned";
  const meter = job ? getMeterApplication(job) : null;

  return (
    <div
      className="card overflow-hidden"
      data-testid="permit-case-row"
      data-agency={row.agency || ""}
      data-job-id={row.jobId || ""}
    >
      <button
        type="button"
        onClick={() => {
          if (isConed) setExpanded((v) => !v);
          else onOpen(row.jobId);
        }}
        className="w-full text-left px-4 py-3 flex items-start gap-3"
        data-testid="permit-row-toggle"
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
          {meter?.label ? (
            <div className="text-[11px] text-brand font-semibold mt-0.5" data-testid="meter-app-chip">
              Meter app: {meter.label}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`pill ${stageTone(row)}`}>{row.stageLabel}</span>
          {isConed ? (
            <span className="text-slate-400 text-xs">{expanded ? "▾" : "▸"}</span>
          ) : null}
        </div>
      </button>

      {expanded && isConed ? (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
          {row.jobId ? (
            <button
              type="button"
              className="pill bg-brand-soft text-brand font-semibold text-xs"
              onClick={() => onOpen(row.jobId)}
              data-testid="permit-open-job"
            >
              Open job →
            </button>
          ) : null}
          {job && onMeterApplication ? (
            <MeterApplicationField
              job={job}
              onSelect={(value) => onMeterApplication(row.jobId, value)}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function Permits() {
  const { jobs, emailInsights, patchAndSave, showToast, enqueue } = useStore();
  const config = useTenantConfig();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Browser-agent case runs (paperwork-jobs bridge): the lifecycle Levi
  // verifies here — queued -> running -> awaiting approval -> submitted.
  const [caseRuns, setCaseRuns] = useState([]);
  const [approvalJob, setApprovalJob] = useState(null);
  useEffect(() => {
    let alive = true;
    let timer = null;
    const tick = async () => {
      const r = await listPaperworkJobsServer({ limit: 20 });
      if (!alive) return;
      if (r.ok) {
        setCaseRuns(r.jobs || []);
        const anyActive = (r.jobs || []).some((j) =>
          ACTIVE_PAPERWORK_JOB_STATUSES.has(j.status)
        );
        timer = setTimeout(tick, anyActive ? 20000 : 60000);
      } else {
        timer = setTimeout(tick, 60000);
      }
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const board = useMemo(
    () => buildPermitBoard({ jobs, insights: emailInsights, config }),
    [jobs, emailInsights, config]
  );

  // How many jobs would gain/refresh a persisted permit record if synced.
  const backfillPlan = useMemo(
    () => computePermitBackfill({ jobs, insights: emailInsights }),
    [jobs, emailInsights]
  );

  const jobsById = useMemo(() => {
    const m = new Map();
    for (const j of jobs || []) {
      if (j?.id) m.set(j.id, j);
    }
    return m;
  }, [jobs]);

  if (!isModuleEnabled(config, "permits")) return null;

  const open = (jobId) => jobId && nav(`/job/${jobId}`);

  const handleMeterApplication = async (jobId, value) => {
    if (!jobId || !value) return;
    const job = jobsById.get(jobId);
    if (!job) {
      showToast("Job not found for this case");
      return;
    }
    try {
      const patch = jobPatchMeterApplication(job, value);
      await patchAndSave(jobId, patch);
      showToast(
        "Meter application saved — " +
          (patch.paperwork?.coned?.meterApplication?.label || meterApplicationLabel(value) || value)
      );
    } catch {
      showToast("Couldn't save meter application");
    }
  };

  const runBackfill = async () => {
    setBusy(true);
    try {
      const res = await applyPermitBackfill({ jobs, insights: emailInsights, patchJob: patchAndSave });
      showToast(res.changed ? `Synced ${res.changed} permit case${res.changed === 1 ? "" : "s"} to jobs` : "Already up to date");
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
    <div className="pb-24" data-testid="permits-tab">
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

      {/* CASE RUNS (browser agent) — lifecycle + the red-line approval. */}
      {caseRuns.length ? (
        <div
          className="card overflow-hidden mb-4 border border-slate-200"
          data-testid="permits-case-runs"
        >
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
            <h2 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide">
              Case runs
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Submit a Case → browser agent → your approval → submitted
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {caseRuns.map((run) => {
              const runJob = jobsById.get(run.jobId);
              return (
                <div
                  key={run.id}
                  className="px-3.5 py-2.5 flex items-center gap-2"
                  data-testid="permits-case-run-row"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-slate-800 truncate">
                      {run.payload?.requestType
                        ? String(run.payload.requestType).replace(/_/g, " ")
                        : "Create case"}
                      {run.caseNumber ? ` · ${run.caseNumber}` : ""}
                    </div>
                    <button
                      type="button"
                      className="text-[11px] text-brand underline underline-offset-2"
                      onClick={() => open(run.jobId)}
                    >
                      {runJob?.customer || runJob?.customerName || run.jobId}
                      {runJob?.serviceAddress || runJob?.address
                        ? " · " + (runJob.serviceAddress || runJob.address)
                        : ""}
                    </button>
                    {run.error ? (
                      <div className="text-[11px] text-red-600">{run.error}</div>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold shrink-0 ${paperworkJobStatusTone(
                      run.status
                    )}`}
                  >
                    {paperworkJobStatusLabel(run.status)}
                  </span>
                  {run.status === "awaiting_approval" ? (
                    <button
                      type="button"
                      className="btn bg-red-600 text-white !py-1.5 !px-2.5 text-xs font-extrabold shrink-0 animate-pulse"
                      onClick={() => setApprovalJob(run)}
                      data-testid="permits-case-review"
                    >
                      Review &amp; approve
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* PAPERWORK TO-DO LIST (Levi) — the prominent thing on this tab.
          Items are created when applications complete (and by future flows);
          Ready to go fires the matching skill once access is unlocked. */}
      {(() => {
        const rows = (jobs || [])
          .flatMap((j) =>
            listPaperworkTodos(j).map((t) => ({ job: j, todo: t }))
          )
          .sort((a, b) =>
            String(b.todo.createdAt || "").localeCompare(String(a.todo.createdAt || ""))
          );
        if (!rows.length) return null;
        return (
          <div
            className="card overflow-hidden mb-4 border border-violet-200"
            data-testid="permits-todo-list"
          >
            <div className="px-4 py-3 border-b border-violet-100 bg-violet-50/70">
              <h2 className="font-extrabold text-sm text-violet-900 uppercase tracking-wide">
                Paperwork to-do list
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Tap Ready to go when Energy Services / DOB access is unlocked
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {rows.map(({ job, todo }) => (
                <div
                  key={job.id + ":" + todo.id}
                  className="px-3.5 py-2.5 flex items-center gap-2"
                  data-testid="permits-todo-row"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-slate-800 truncate">
                      {todo.title || paperworkTodoLabel(todo.kind)}
                      {todo.meterLabel ? ` · ${todo.meterLabel}` : ""}
                    </div>
                    <button
                      type="button"
                      className="text-[11px] text-brand underline underline-offset-2"
                      onClick={() => open(job.id)}
                    >
                      {job.customer || job.customerName || "Job"}
                      {job.serviceAddress || job.address
                        ? " · " + (job.serviceAddress || job.address)
                        : ""}
                    </button>
                    {todo.error ? (
                      <div className="text-[11px] text-red-600">{todo.error}</div>
                    ) : null}
                  </div>
                  {todo.status === "queued" ? (
                    <span className="pill bg-emerald-100 text-emerald-800 shrink-0">
                      queued
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn bg-violet-700 text-white !py-1.5 !px-2.5 text-xs font-bold shrink-0"
                      data-testid="permits-todo-ready"
                      onClick={async () => {
                        const r = await readyToGoTodo({
                          job,
                          todo,
                          enqueue,
                          onSave: (p) => patchAndSave(job.id, p),
                        });
                        showToast(
                          r.queued
                            ? "Queued — stops at review for your confirm"
                            : "Not fired: " + (r.error || "unknown")
                        );
                      }}
                    >
                      Ready to go
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-ghost !py-0.5 !px-1.5 text-slate-400 shrink-0"
                    aria-label={`Remove to-do ${todo.title || todo.kind}`}
                    onClick={() => {
                      const p = updatePaperworkTodoPatch(job, todo.id, "removed");
                      if (p) patchAndSave(job.id, p);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Skill list — collapsible, collapsed by default (Levi: waste of space) */}
      <div className="mb-4">
        <FunctionalitiesLockIn />
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
              <CaseRow
                key={`an:${row.key}`}
                row={row}
                job={jobsById.get(row.jobId)}
                onOpen={open}
                onMeterApplication={handleMeterApplication}
              />
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
                <CaseRow
                  key={row.key}
                  row={row}
                  job={jobsById.get(row.jobId)}
                  onOpen={open}
                  onMeterApplication={handleMeterApplication}
                />
              ))}
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
            <div className="font-bold mb-1">Sync permit cases to jobs?</div>
            <p className="text-sm text-slate-600 mb-3">
              Writes {backfillPlan.length} permit case{backfillPlan.length === 1 ? "" : "s"} onto their jobs so the
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
      {approvalJob ? (
        <PaperworkApprovalSheet
          pwJob={approvalJob}
          onClose={() => setApprovalJob(null)}
          onDecided={(updated) => {
            setApprovalJob(null);
            setCaseRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
          }}
        />
      ) : null}
    </div>
  );
}
