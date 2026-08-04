// Permits — cross-job Con Edison + City/DOB open-case tracker.
//
// Surface: Deploy queue (titled New Case · Con Edison · address). Expand a row
// for Open / Job / Edit + green Deploy → Deploying… → completed rows leave the
// queue. Case progress sections + skills still to teach.
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
  readyToGoTodo,
  updatePaperworkTodoPatch,
  addPaperworkTodoPatch,
} from "../lib/agencyForms/index.js";
import { createCasePaperworkJob } from "../lib/agencyForms/createCaseExecution.js";
import {
  listPaperworkJobsServer,
  paperworkJobStatusLabel,
  paperworkJobStatusTone,
  ACTIVE_PAPERWORK_JOB_STATUSES,
  TERMINAL_PAPERWORK_JOB_STATUSES,
  dismissPaperworkJob,
  clearPaperworkJobsSlate,
} from "../lib/paperworkJobs.js";
import {
  buildDeployQueueItems,
  buildRecentCaseSuccesses,
  processCompletedProgressPatch,
  queueItemCanDeploy,
  queueItemIsDeploying,
  jobHasConedFormA,
  fleetRunIsSupersededSuccess,
  healCaseProgressPatch,
} from "../lib/permitsDeploy.js";
import { caseStepCompletePatch } from "../lib/caseNextSteps.js";
import PaperworkApprovalSheet from "../components/PaperworkApprovalSheet.jsx";
import ConedCreateCaseSheet from "../components/ConedCreateCaseSheet.jsx";
import AgencyApplicationSheet from "../components/AgencyApplicationSheet.jsx";
import ConedApplicationStartSheet from "../components/ConedApplicationStartSheet.jsx";

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

function CaseStepChips({ steps = [], onStepTap }) {
  if (!steps.length) return null;
  return (
    <ul className="mt-1.5 space-y-1" data-testid="permit-case-steps">
      {steps.map((st) => {
        const due = st.status === "due";
        const blocked = st.status === "blocked";
        const done = st.status === "done";
        const tappable = due && typeof onStepTap === "function";
        const body = (
          <>
            <span className="shrink-0 mt-px" aria-hidden>
              {done ? "✓" : due ? "→" : blocked ? "○" : "·"}
            </span>
            <span className="min-w-0 text-left">
              <span>{st.title}</span>
              {!st.required ? (
                <span className="ml-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  optional
                </span>
              ) : null}
              {tappable ? (
                <span className="ml-1 text-[10px] font-bold text-brand">Tap →</span>
              ) : null}
              {st.note ? (
                <span className="block text-[10px] font-normal text-slate-500">{st.note}</span>
              ) : null}
            </span>
          </>
        );
        const cls =
          "flex items-start gap-1.5 text-[11px] leading-snug w-full " +
          (done
            ? "text-emerald-700"
            : due
              ? "text-red-800 font-semibold"
              : blocked
                ? "text-slate-400"
                : "text-slate-600") +
          (tappable ? " rounded-md -mx-1 px-1 py-0.5 hover:bg-red-50 active:bg-red-100" : "");
        return (
          <li
            key={st.id}
            className="list-none"
            data-testid="permit-case-step"
            data-step-id={st.id}
            data-step-status={st.status}
            data-required={st.required ? "1" : "0"}
          >
            {tappable ? (
              <button
                type="button"
                className={cls}
                onClick={(e) => {
                  e.stopPropagation();
                  onStepTap(st);
                }}
                data-testid="permit-step-run"
              >
                {body}
              </button>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CaseRow({ row, job, onOpen, onMeterApplication, onStepAction }) {
  const [expanded, setExpanded] = useState(false);
  const isConed = row.agency === "coned";
  const meter = job ? getMeterApplication(job) : null;
  const dueNow = Array.isArray(row.dueNow) ? row.dueNow : [];
  const caseSteps = Array.isArray(row.caseSteps) ? row.caseSteps : [];
  // Collapsed: only due-now chips; expanded: full flow with gates
  const showSteps = expanded ? caseSteps : dueNow;
  const handleStep = (st) => {
    if (onStepAction) onStepAction(st, row, job);
  };

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
          {showSteps.length ? <CaseStepChips steps={showSteps} onStepTap={handleStep} /> : null}
          {meter?.label ? (
            <div className="text-[11px] text-brand font-semibold mt-0.5" data-testid="meter-app-chip">
              Meter app: {meter.label}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`pill ${stageTone(row)}`}>{row.stageLabel}</span>
          {dueNow.length ? (
            <span
              className="text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full"
              data-testid="permit-due-count"
            >
              {dueNow.length} due
            </span>
          ) : null}
          {isConed ? (
            <span className="text-slate-400 text-xs">{expanded ? "▾" : "▸"}</span>
          ) : null}
        </div>
      </button>

      {expanded && isConed ? (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
          {row.recommended?.status === "due" ? (
            <button
              type="button"
              className="w-full btn bg-brand text-white font-extrabold text-sm !py-3"
              onClick={() => handleStep(row.recommended)}
              data-testid="permit-run-next"
            >
              Do next: {row.recommended.title}
            </button>
          ) : null}
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

/** One Deploy queue row — expand for Open / Job / Edit + green Deploy. */
function DeployQueueRow({
  item,
  expanded,
  deploying,
  onToggle,
  onRemove,
  onOpen,
  onEdit,
  onReview,
  onOpenJob,
  onDeploy,
  onFixMissing,
}) {
  const status = item.status || "";
  const missing = item.missing || item.readiness?.missing || [];
  const hardMissing = missing.filter((m) =>
    ["service_address", "form_a", "form_a_or_case", "case_number", "case_or_address"].includes(
      m.id
    )
  );
  const softMissing = missing.filter((m) => !hardMissing.includes(m));
  const terminal =
    TERMINAL_PAPERWORK_JOB_STATUSES.has(status) ||
    status === "done" ||
    status === "failed" ||
    status === "rejected";
  const draft = item.draft || item.job?.paperwork?.coned?.createCase;
  const answers = draft?.answers || item.run?.payload?.answers || {};
  const reviewBits = [
    answers.ownerFirst || answers.ownerLast
      ? `Owner: ${[answers.ownerFirst, answers.ownerLast].filter(Boolean).join(" ")}`
      : "",
    answers.bin ? `BIN ${answers.bin}` : "",
    item.requestShort || "",
    item.serviceAddress || "",
  ].filter(Boolean);
  const canEdit =
    (item.source === "fleet" && item.run?.type === "create_case") ||
    item.source === "draft" ||
    item.kind === "New Case";
  const isDeploying = deploying || queueItemIsDeploying(item);
  const canDeploy = !isDeploying && queueItemCanDeploy(item);
  const needsReview = item.source === "fleet" && status === "awaiting_approval";
  const needsInfo = hardMissing.length > 0 || status === "need_info";

  let statusLabel = status || "pending";
  let statusTone = "bg-slate-100 text-slate-600";
  if (isDeploying && item.source !== "fleet") {
    statusLabel = "Deploying…";
    statusTone = "bg-amber-100 text-amber-900";
  } else if (needsInfo) {
    statusLabel = "Need info";
    statusTone = "bg-amber-100 text-amber-900 border border-amber-200";
  } else if (item.source === "fleet") {
    statusLabel = paperworkJobStatusLabel(status);
    statusTone = paperworkJobStatusTone(status);
  } else if (status === "deploy_queued" || status === "queued") {
    statusLabel = "Ready";
    statusTone = "bg-emerald-100 text-emerald-800";
  } else if (status === "pending" || status === "draft") {
    statusLabel = softMissing.length ? "Almost ready" : "Ready";
    statusTone = softMissing.length
      ? "bg-amber-50 text-amber-800 border border-amber-100"
      : "bg-emerald-100 text-emerald-800";
  }

  return (
    <div
      className="border-b border-slate-100 last:border-0"
      data-testid="permits-queue-row"
      data-source={item.source || ""}
      data-status={status}
    >
      <div className="px-3.5 py-2.5 flex items-start gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => item.expandable !== false && onToggle(item.id)}
          data-testid="permits-queue-toggle"
        >
          <div className="text-[13px] font-extrabold text-slate-900 leading-snug">
            {item.title}
          </div>
          {item.subtitle ? (
            <div className="text-[11px] text-slate-500 mt-0.5">{item.subtitle}</div>
          ) : null}
          {needsInfo && !expanded ? (
            <div
              className="text-[11px] text-amber-800 font-semibold mt-1"
              data-testid="permits-queue-missing-hint"
            >
              Missing: {hardMissing.map((m) => m.label).join(", ") || "details"}
            </div>
          ) : null}
        </button>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusTone}`}>
            {statusLabel}
          </span>
          {/* Sticky primary action on collapsed row (Levi UI audit) */}
          {!expanded ? (
            isDeploying ? (
              <span className="text-[11px] font-bold text-amber-800">Deploying…</span>
            ) : canDeploy ? (
              <button
                type="button"
                className="btn bg-emerald-700 text-white !py-1 !px-2.5 text-[11px] font-extrabold"
                data-testid="permits-queue-deploy-sticky"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeploy(item);
                }}
              >
                Deploy
              </button>
            ) : needsInfo ? (
              <button
                type="button"
                className="btn bg-amber-600 text-white !py-1 !px-2.5 text-[11px] font-extrabold"
                data-testid="permits-queue-fix-sticky"
                onClick={(e) => {
                  e.stopPropagation();
                  onFixMissing?.(
                    item,
                    hardMissing[0] || missing[0] || { fix: "create_application" }
                  );
                }}
              >
                Fix
              </button>
            ) : needsReview ? (
              <button
                type="button"
                className="btn bg-red-600 text-white !py-1 !px-2 text-[11px] font-extrabold"
                onClick={(e) => {
                  e.stopPropagation();
                  onReview(item.run);
                }}
              >
                Review
              </button>
            ) : null
          ) : null}
          {item.expandable !== false ? (
            <span className="text-slate-400 text-xs">{expanded ? "▾" : "▸"}</span>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div
          className="px-3.5 pb-3 space-y-2 bg-slate-50/70 border-t border-slate-100"
          data-testid="permits-queue-details"
        >
          {missing.length ? (
            <div
              className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2"
              data-testid="permits-queue-missing"
            >
              <div className="text-[11px] font-extrabold text-amber-900 uppercase tracking-wide mb-1">
                Missing to Deploy
              </div>
              <ul className="text-[12px] text-amber-950 space-y-1.5">
                {missing.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-2">
                    <span>· {m.label}</span>
                    {onFixMissing ? (
                      <button
                        type="button"
                        className="shrink-0 text-[11px] font-bold text-brand underline underline-offset-2"
                        data-testid={`permits-fix-${m.id}`}
                        onClick={() => onFixMissing(item, m)}
                      >
                        {m.fix === "job"
                          ? "Open job"
                          : m.fix === "create_application"
                            ? "Create application"
                            : "Fill details"}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : reviewBits.length ? (
            <ul className="text-[12px] text-slate-700 space-y-0.5">
              {reviewBits.map((b) => (
                <li key={b}>· {b}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-slate-500">No application details yet — Edit to fill.</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1 items-center">
            {item.jobId ? (
              <button
                type="button"
                className="pill bg-white border border-slate-200 text-slate-700 text-xs font-semibold"
                data-testid="permits-queue-job"
                onClick={() => onOpenJob(item.jobId)}
              >
                Job
              </button>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                className="pill bg-brand-soft text-brand text-xs font-bold"
                data-testid="permits-queue-edit"
                onClick={() => onEdit(item)}
              >
                Edit
              </button>
            ) : null}
            {needsReview ? (
              <button
                type="button"
                className="btn bg-red-600 text-white !py-1.5 !px-2.5 text-xs font-extrabold animate-pulse"
                onClick={() => onReview(item.run)}
                data-testid="permits-case-review"
              >
                Review &amp; approve
              </button>
            ) : null}
            {isDeploying ? (
              <button
                type="button"
                className="btn bg-emerald-600/80 text-white !py-1.5 !px-3 text-xs font-extrabold"
                disabled
                data-testid="permits-queue-deploy"
                aria-busy="true"
              >
                Deploying…
              </button>
            ) : canDeploy ? (
              <button
                type="button"
                className="btn bg-emerald-700 text-white !py-1.5 !px-3 text-xs font-extrabold"
                data-testid="permits-queue-deploy"
                onClick={() => onDeploy(item)}
              >
                Deploy
              </button>
            ) : needsInfo ? (
              <button
                type="button"
                className="btn bg-amber-600 text-white !py-1.5 !px-3 text-xs font-extrabold"
                data-testid="permits-queue-fix"
                onClick={() =>
                  onFixMissing?.(item, hardMissing[0] || missing[0] || { fix: "edit_application" })
                }
              >
                Fix missing
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="px-3.5 pb-2.5 flex justify-end">
        <button
          type="button"
          className="text-[11px] font-bold text-red-700 underline underline-offset-2"
          aria-label="Remove from queue"
          data-testid="permits-queue-remove"
          onClick={() => onRemove(item)}
        >
          {terminal || item.source !== "fleet" ? "Remove" : "Remove from queue"}
        </button>
      </div>
    </div>
  );
}

export default function Permits() {
  const { jobs, emailInsights, events, patchAndSave, showToast, enqueue } = useStore();
  const config = useTenantConfig();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [caseRuns, setCaseRuns] = useState([]);
  const [approvalJob, setApprovalJob] = useState(null);
  const [queueOpen, setQueueOpen] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [expandedIds, setExpandedIds] = useState({});
  const [deployingIds, setDeployingIds] = useState({});
  /** When Deploy is tapped without Form A — choose fill or email (Levi 2026-08-03). */
  const [needAppPrompt, setNeedAppPrompt] = useState(null); // { job, item }
  const [agencyAppJob, setAgencyAppJob] = useState(null);
  const [conedStartJob, setConedStartJob] = useState(null);
  const [editJob, setEditJob] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const healedRef = React.useRef(new Set());

  const refreshRuns = async () => {
    const r = await listPaperworkJobsServer({ limit: 30 });
    if (r.ok) setCaseRuns(r.jobs || []);
    return r;
  };

  useEffect(() => {
    let alive = true;
    let timer = null;
    const tick = async () => {
      const r = await listPaperworkJobsServer({ limit: 30 });
      if (!alive) return;
      if (r.ok) {
        const list = r.jobs || [];
        setCaseRuns(list);
        setLastSyncedAt(new Date().toISOString());
        const anyActive = list.some((j) => ACTIVE_PAPERWORK_JOB_STATUSES.has(j.status));
        if (anyActive) setQueueOpen(true);
        const byId = new Map((jobs || []).filter((x) => x?.id).map((x) => [x.id, x]));
        // Auto clean-slate: dismiss superseded fails so banner noise drops (P0)
        const superseded = list.filter(
          (j) =>
            (j.status === "failed" || j.status === "rejected") &&
            fleetRunIsSupersededSuccess(j, byId.get(j.jobId), list)
        );
        for (const j of superseded.slice(0, 8)) {
          try {
            await dismissPaperworkJob(j.id);
          } catch {
            /* ignore */
          }
        }
        if (superseded.length) {
          const r2 = await listPaperworkJobsServer({ limit: 30 });
          if (alive && r2.ok) setCaseRuns(r2.jobs || []);
        }
        // Auto-page Israel on real fails only (not superseded)
        const failed = list.filter(
          (j) =>
            j.status === "failed" &&
            j.error &&
            !fleetRunIsSupersededSuccess(j, byId.get(j.jobId), list)
        );
        if (failed.length && enqueue) {
          const { reportPaperworkFailOnce, fieldsFromPaperworkJob } = await import(
            "../lib/paperworkFailReport.js"
          );
          for (const j of failed.slice(0, 5)) {
            const fields = fieldsFromPaperworkJob(j, byId.get(j.jobId));
            void reportPaperworkFailOnce(
              { ...fields, phase: "permits_poll", error: fields.error || j.error },
              enqueue
            );
          }
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enqueue, jobs]);

  // Heal open-case steps when appointments / email / DOB evidence prove done
  useEffect(() => {
    if (!patchAndSave || !jobs?.length) return;
    let cancelled = false;
    (async () => {
      for (const job of jobs.slice(0, 40)) {
        if (!job?.id || healedRef.current.has(job.id)) continue;
        const patch = healCaseProgressPatch(job, {
          events: events || [],
          insights: emailInsights || [],
        });
        if (!patch) continue;
        healedRef.current.add(job.id);
        if (cancelled) return;
        try {
          await patchAndSave(job.id, patch);
        } catch {
          healedRef.current.delete(job.id);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobs, events, emailInsights, patchAndSave]);

  const board = useMemo(
    () => buildPermitBoard({ jobs, insights: emailInsights, config }),
    [jobs, emailInsights, config]
  );

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

  const queueItems = useMemo(
    () => buildDeployQueueItems({ jobs, caseRuns }),
    [jobs, caseRuns]
  );

  const recentSuccesses = useMemo(
    () => buildRecentCaseSuccesses({ jobs, caseRuns, limit: 4 }),
    [jobs, caseRuns]
  );

  const clearableCount = useMemo(
    () =>
      caseRuns.filter(
        (r) =>
          TERMINAL_PAPERWORK_JOB_STATUSES.has(r.status) &&
          !fleetRunIsSupersededSuccess(
            r,
            (jobs || []).find((j) => j.id === r.jobId),
            caseRuns
          )
      ).length,
    [caseRuns, jobs]
  );

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
      const md = patch.paperwork?.coned?.meterDeploy;
      let queued = "";
      if (value === "new_meter" || value === "new_application") {
        if (md?.status === "deploy_queued") {
          queued =
            " — added to Deploy queue" +
            (md.attached ? " (attached to case " + md.caseNumber + ")" : "");
        } else {
          queued =
            " — not in Deploy queue yet (need case / Form A / address first)";
        }
      }
      showToast(
        "Meter application saved — " +
          (patch.paperwork?.coned?.meterApplication?.label || meterApplicationLabel(value) || value) +
          queued
      );
    } catch {
      showToast("Couldn't save meter application");
    }
  };

  /** Tap a due next-step → execute the action for that case type. */
  const handleStepAction = async (step, row, job) => {
    if (!step || !job?.id) {
      if (row?.jobId) open(row.jobId);
      return;
    }
    const action = step.action || step.id;
    try {
      if (action === "meter_application" || step.id === "add_plp_account" || step.id === "new_meter") {
        // Expand row path: set meter app for PLP when that's the step
        if (step.id === "add_plp_account") {
          const patch = jobPatchMeterApplication(job, "new_meter");
          const withPlp = {
            ...patch,
            paperwork: {
              ...(patch.paperwork || {}),
              coned: {
                ...(patch.paperwork?.coned || {}),
                meterApplication: {
                  ...(patch.paperwork?.coned?.meterApplication || {}),
                  title: "PLP",
                  label: "PLP",
                },
                needsPlpAccount: true,
                needsAdditionalAccount: true,
                additionalAccountLabel: "PLP",
              },
            },
          };
          await patchAndSave(job.id, withPlp);
          showToast("PLP meter application queued — open Deploy when ready");
          return;
        }
        await handleMeterApplication(job.id, "new_meter");
        return;
      }
      if (action === "email_inquiry_followup" || step.id === "inquiry_customer_followup") {
        const inq = job.paperwork?.coned?.inquiry || {};
        const inqId = inq.id || inq.inquiryId || "";
        const email = job.email || "";
        const name = job.customer || job.personName || "there";
        const addr = job.serviceAddress || job.address || "";
        const subject = inqId
          ? `Follow-up on Con Edison inquiry ${inqId}${addr ? " — " + addr : ""}`
          : `Follow-up on your Con Edison inquiry${addr ? " — " + addr : ""}`;
        const body =
          `Hi ${name},\n\n` +
          `We reviewed the Con Edison inquiry results for ${addr || "your project"}${inqId ? ` (${inqId})` : ""}.\n\n` +
          `Please complete any items Con Ed asked for on your side, then reply to this email when you're done so we can continue.\n\n` +
          `If anything is unclear, reply here and we'll walk you through it.\n\n` +
          `Thank you,\nLE Electrical`;
        // Open system mail if we have an address; always mark step ready to complete after open
        if (email && typeof window !== "undefined") {
          const href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
          window.location.href = href;
        }
        const donePatch = caseStepCompletePatch("inquiry_customer_followup", {
          id: inqId || undefined,
          inquiryId: inqId || undefined,
        });
        if (donePatch) await patchAndSave(job.id, donePatch);
        showToast(
          email
            ? "Opened email to customer — marked follow-up sent"
            : "No email on job — marked follow-up; add email and resend if needed"
        );
        return;
      }
      if (action === "close_case" || step.id === "close_case") {
        const donePatch = caseStepCompletePatch("close_case");
        // Also stamp closed on permit record if present
        let permits = Array.isArray(job.permits) ? job.permits.map((p) => ({ ...p })) : [];
        permits = permits.map((p) => {
          if (String(p?.agency || "").toLowerCase() !== "coned") return p;
          return {
            ...p,
            currentStage: "closed",
            stageLabel: "Closed",
            stageBucket: "Terminal",
            health: "ok",
            nextAction: "Closed",
          };
        });
        await patchAndSave(job.id, {
          ...donePatch,
          permits,
        });
        showToast("Case closed — last inspection passed");
        return;
      }
      if (action === "electrical_permit" || step.id === "electrical_permit") {
        open(job.id);
        showToast("Open job → Paperwork → file electrical permit (L1 / EL)");
        return;
      }
      if (action === "email_deposit_reminder" || step.id === "deposit_customer_followup") {
        const email = job.email || "";
        const name = job.customer || job.personName || "there";
        const addr = job.serviceAddress || job.address || "";
        const subject = `Con Edison deposit — ${addr || "your account"}`;
        const body =
          `Hi ${name},\n\n` +
          `Con Edison is asking for the service deposit for ${addr || "your project"}. ` +
          `Please pay it in their portal when you can, then email us confirmation so we can request inspection.\n\n` +
          `Thank you,\nLE Electrical`;
        if (email && typeof window !== "undefined") {
          window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        }
        const donePatch = caseStepCompletePatch("deposit_customer_followup");
        if (donePatch) await patchAndSave(job.id, donePatch);
        showToast("Deposit reminder opened — marked sent");
        return;
      }
      if (
        action === "request_inspection" ||
        action === "skill_learn" ||
        step.id === "request_inspection_after_service"
      ) {
        showToast("Request inspection skill not learned yet — teach portal steps first");
        return;
      }
      if (action === "final_checklist" || action === "coned_todos" || action === "submit_inquiry") {
        open(job.id);
        showToast("Open the job / Project Center to finish: " + (step.title || action));
        return;
      }
      open(job.id);
    } catch {
      showToast("Couldn't run that step — try again");
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

  const runClearSlate = async () => {
    setClearing(true);
    try {
      const r = await clearPaperworkJobsSlate();
      if (r.ok) {
        setCaseRuns((prev) =>
          prev.filter((j) => !TERMINAL_PAPERWORK_JOB_STATUSES.has(j.status))
        );
        showToast(
          r.cleared
            ? `Clean slate — removed ${r.cleared} finished/failed run${r.cleared === 1 ? "" : "s"}`
            : "Already clean"
        );
      } else {
        showToast("Couldn't clear: " + (r.error || "try again"));
      }
    } finally {
      setClearing(false);
    }
  };

  const removeQueueItem = async (item) => {
    if (item.source === "fleet" && item.run?.id) {
      const r = await dismissPaperworkJob(item.run.id);
      if (r.ok) {
        setCaseRuns((prev) => prev.filter((j) => j.id !== item.run.id));
        showToast("Removed from queue");
      } else {
        showToast("Couldn't remove: " + (r.error || "try again"));
      }
      return;
    }
    if (item.source === "todo" && item.todo && item.jobId) {
      const p = updatePaperworkTodoPatch(item.job, item.todo.id, "removed");
      if (p) await patchAndSave(item.jobId, p);
      showToast("Removed from queue");
      return;
    }
    if (item.source === "draft" && item.jobId) {
      await patchAndSave(item.jobId, {
        paperwork: {
          coned: {
            createCase: {
              ...(item.draft || {}),
              status: "removed",
              removedAt: new Date().toISOString(),
            },
          },
        },
      });
      showToast("Removed draft from queue");
      return;
    }
    if (item.source === "meter" && item.jobId) {
      await patchAndSave(item.jobId, {
        paperwork: {
          coned: {
            meterDeploy: { status: "removed", removedAt: new Date().toISOString() },
          },
        },
      });
      // also remove matching todo if any
      const todos = listPaperworkTodos(item.job);
      const meterTodo = todos.find((t) => t.kind === "new_meter" || t.source === "meter_application");
      if (meterTodo) {
        const p = updatePaperworkTodoPatch(item.job, meterTodo.id, "removed");
        if (p) await patchAndSave(item.jobId, p);
      }
      showToast("Removed from queue");
      return;
    }
    showToast("Nothing to remove");
  };

  const onEditQueueItem = (item) => {
    const job = jobsById.get(item.jobId) || item.job;
    if (!job) {
      showToast("Job not found");
      return;
    }
    setEditJob(job);
  };

  /** Deep-link from Missing to Deploy → fill Form A / open job / edit. */
  const fixMissingOnItem = (item, blocker) => {
    const fix = blocker?.fix || "edit_application";
    if (fix === "job" && item?.jobId) {
      open(item.jobId);
      return;
    }
    const job = jobsById.get(item?.jobId) || item?.job;
    if (fix === "create_application" && job) {
      setConedStartJob(job);
      return;
    }
    // edit_application / default
    if (job) {
      if (item?.kind === "New Case" || item?.source === "draft" || item?.source === "fleet") {
        setEditJob(job);
      } else {
        setConedStartJob(job);
      }
    } else if (item?.jobId) {
      open(item.jobId);
    }
  };

  /** Green Deploy on a queue row — fire skill; button shows Deploying… */
  const deployQueueItem = async (item) => {
    if (!item?.id || deployingIds[item.id]) return;
    if (item.source === "fleet" && item.status === "awaiting_approval") {
      setApprovalJob(item.run);
      return;
    }
    const hardMissing = (item.missing || item.readiness?.missing || []).filter((m) =>
      ["service_address", "form_a", "form_a_or_case", "case_number", "case_or_address"].includes(
        m.id
      )
    );
    if (hardMissing.length) {
      showToast("Missing: " + hardMissing.map((m) => m.label).join(", "));
      setExpandedIds((m) => ({ ...m, [item.id]: true }));
      return;
    }
    setDeployingIds((m) => ({ ...m, [item.id]: true }));
    setQueueOpen(true);
    try {
      const job = jobsById.get(item.jobId) || item.job;
      if (!job && item.source !== "fleet") {
        showToast("Job not found");
        return;
      }

      if (item.source === "draft" || (item.kind === "New Case" && item.draft)) {
        const answers =
          item.draft?.answers ||
          job?.paperwork?.coned?.createCase?.answers ||
          {};
        const r = await createCasePaperworkJob({
          answers,
          job,
          onSave: (p) => patchAndSave(item.jobId, p),
        });
        if (r.ok) {
          // Submit case → already queued fleet job; queue shows Deploying… until done
          showToast("Deploying… fills up to Review for your confirm");
          setDeployingIds((m) => ({ ...m, [item.id]: true }));
          await refreshRuns();
          // Clear local deploying flag once fleet list owns the row
          setTimeout(() => {
            setDeployingIds((m) => {
              const next = { ...m };
              delete next[item.id];
              return next;
            });
          }, 1500);
        } else {
          const errMsg = r.error || "try again";
          showToast(
            errMsg === "questionnaire_incomplete"
              ? "Fill the application first — tap Edit"
              : "Couldn't deploy: " + errMsg
          );
          if (errMsg !== "questionnaire_incomplete") {
            const { reportPaperworkFailOnce } = await import("../lib/paperworkFailReport.js");
            void reportPaperworkFailOnce(
              {
                kind: "create_case",
                error: errMsg,
                jobId: item.jobId || job?.id || "",
                paperworkJobId: r.paperworkJobId || "",
                address: item.serviceAddress || job?.serviceAddress || "",
                phase: "permits_deploy",
              },
              enqueue
            ).then((rep) => {
              if (rep?.queued) showToast("Developers notified — they'll fix this");
            });
          }
        }
        return;
      }

      if (item.source === "todo" && item.todo) {
        const r = await readyToGoTodo({
          job,
          todo: item.todo,
          enqueue,
          onSave: (p) => patchAndSave(item.jobId, p),
        });
        showToast(
          r.queued
            ? "Deploying… stops at review for your confirm"
            : "Not deployed: " + (r.error || "unknown")
        );
        await refreshRuns();
        return;
      }

      if (item.source === "meter") {
        // Gate: PLP / new meter Deploy needs a completed Form A on the job first.
        if (!jobHasConedFormA(job)) {
          setNeedAppPrompt({ job, item });
          showToast("No application on this job yet — create one first");
          return;
        }
        const todos = listPaperworkTodos(job);
        let todo = todos.find(
          (t) => t.kind === "new_meter" || t.source === "meter_application"
        );
        if (!todo) {
          const { patch, todo: t } = addPaperworkTodoPatch(job, {
            kind: "new_meter",
            meterLabel: "New Meter",
            title: item.title,
            source: "meter_application",
          });
          if (patch) await patchAndSave(item.jobId, patch);
          todo = t;
        }
        if (todo) {
          const r = await readyToGoTodo({
            job: jobsById.get(item.jobId) || job,
            todo,
            enqueue,
            onSave: (p) => patchAndSave(item.jobId, p),
          });
          showToast(
            r.queued
              ? "Deploying new meter…"
              : "Not deployed: " + (r.error || "unknown")
          );
        } else {
          showToast("Couldn't queue meter deploy");
        }
        await refreshRuns();
        return;
      }

      if (item.source === "fleet") {
        await refreshRuns();
        return;
      }

      showToast("Nothing to deploy on this row");
    } finally {
      setDeployingIds((m) => {
        const next = { ...m };
        delete next[item.id];
        return next;
      });
    }
  };

  const onCreateCaseSaved = async (patch, jobId) => {
    await patchAndSave(jobId, patch);
    // When submit queues a case, advance job progress for next steps
    const exec = patch?.paperwork?.coned?.createCase?.execution;
    if (exec?.status === "queued" || patch?.paperwork?.coned?.createCase?.status === "ready_to_fill") {
      const job = jobsById.get(jobId);
      if (job) {
        const { patch: prog } = processCompletedProgressPatch(job, {
          kind: "create_case",
          permitStage: "application_filed",
        });
        // Only apply progress bits that don't clobber createCase we just wrote
        if (prog?.status) {
          await patchAndSave(jobId, { status: prog.status });
        }
        if (prog?.paperwork?.todos) {
          await patchAndSave(jobId, { paperwork: { todos: prog.paperwork.todos } });
        }
      }
    }
    setTimeout(() => refreshRuns(), 600);
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

      {/* DEPLOY QUEUE — sticky Deploy/Fix · Ready only with Form A for meters */}
      <div
        className="card overflow-hidden mb-4 border border-slate-200"
        data-testid="permits-deploy-queue"
      >
        <button
          type="button"
          className="w-full px-4 py-3 border-b border-slate-100 bg-slate-50/80 text-left"
          onClick={() => setQueueOpen((o) => !o)}
          aria-expanded={queueOpen}
          data-testid="permits-queue-toggle-all"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide">
                Deploy queue
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {queueItems.length
                  ? `${queueItems.length} item${queueItems.length === 1 ? "" : "s"} · Deploy when Ready`
                  : "Nothing to deploy"}
                {queueItems.some((i) => (i.missing || []).length)
                  ? " · amber = fill missing first"
                  : ""}
                {lastSyncedAt ? (
                  <span className="text-slate-400">
                    {" "}
                    · synced {fmtWhen(lastSyncedAt) || "just now"}
                  </span>
                ) : null}
              </p>
            </div>
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="pill bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                {queueItems.length}
              </span>
              <span
                className={`text-slate-400 transition-transform ${queueOpen ? "rotate-90" : ""}`}
              >
                ›
              </span>
            </span>
          </div>
        </button>
        {queueOpen ? (
          <>
            {clearableCount ? (
              <div className="px-3.5 py-2 border-b border-slate-100 flex items-center justify-between gap-2 bg-white">
                <span className="text-[11px] text-slate-500">
                  {clearableCount} finished/failed practice run
                  {clearableCount === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  className="text-[11px] font-bold text-red-700 underline underline-offset-2"
                  data-testid="permits-case-clear-slate"
                  disabled={clearing}
                  onClick={runClearSlate}
                >
                  {clearing ? "Clearing…" : "Clean slate"}
                </button>
              </div>
            ) : null}
            {queueItems.length ? (
              <div>
                {queueItems.map((item) => (
                  <DeployQueueRow
                    key={item.id}
                    item={item}
                    expanded={!!expandedIds[item.id]}
                    deploying={!!deployingIds[item.id]}
                    onToggle={(id) =>
                      setExpandedIds((m) => ({ ...m, [id]: !m[id] }))
                    }
                    onRemove={removeQueueItem}
                    onOpen={onEditQueueItem}
                    onEdit={onEditQueueItem}
                    onReview={setApprovalJob}
                    onOpenJob={open}
                    onDeploy={deployQueueItem}
                    onFixMissing={fixMissingOnItem}
                  />
                ))}
              </div>
            ) : (
              <div
                className="px-4 py-8 text-center text-sm text-slate-500"
                data-testid="permits-queue-empty"
              >
                <span className="block text-2xl mb-1">✓</span>
                Nothing to deploy — open cases are below.
                <br />
                <span className="text-xs text-slate-400">
                  New Meter only shows Ready when Form A is saved.
                </span>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Success strip — live cases already submitted */}
      {recentSuccesses.length ? (
        <div className="mb-4" data-testid="permits-success-strip">
          <div className="text-[11px] font-extrabold text-emerald-800 uppercase tracking-wider mb-1.5 px-1">
            Cases on record
          </div>
          <div className="space-y-2">
            {recentSuccesses.map((row) => (
              <button
                key={row.id}
                type="button"
                className="card w-full text-left px-3.5 py-2.5 border border-emerald-100 bg-emerald-50/40"
                onClick={() => row.jobId && open(row.jobId)}
              >
                <div className="text-[13px] font-extrabold text-slate-900">{row.title}</div>
                <div className="text-[11px] text-emerald-900 font-semibold mt-0.5">
                  Case {row.caseNumber} submitted
                </div>
                {row.nextHint ? (
                  <div className="text-[11px] text-slate-500 mt-0.5">{row.nextHint}</div>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Skill list — remaining only; learned removed (Levi clean slate) */}
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
                onStepAction={handleStepAction}
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
                  onStepAction={handleStepAction}
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

      {!hasAny && !sections.length && !queueItems.length ? (
        <div className="card px-4 py-10 text-center text-sm text-slate-400">
          <span className="block text-3xl mb-2">📄</span>
          No permit cases yet.
          <br />
          Start a case from a job&apos;s Paperwork — it lands in the Deploy queue here.
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
          onDecided={async (updated) => {
            setApprovalJob(null);
            setCaseRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            // On approved/submitted path, refresh next-step readiness
            if (updated.status === "approved" || updated.status === "submitted" || updated.status === "done") {
              const job = jobsById.get(updated.jobId);
              if (job) {
                const { patch: prog } = processCompletedProgressPatch(job, {
                  kind: updated.type || "create_case",
                  permitStage: "application_filed",
                });
                if (prog) await patchAndSave(job.id, prog);
              }
            }
          }}
        />
      ) : null}

      {editJob ? (
        <ConedCreateCaseSheet
          job={jobsById.get(editJob.id) || editJob}
          onClose={() => setEditJob(null)}
          onSave={async (patch) => {
            await onCreateCaseSaved(patch, editJob.id);
            showToast("Application saved");
          }}
        />
      ) : null}

      {/* PLP / new meter Deploy without Form A — create application first (Levi 2026-08-03) */}
      {needAppPrompt ? (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
          data-testid="permits-need-form-a"
          onClick={() => setNeedAppPrompt(null)}
        >
          <div
            className="card w-full max-w-sm p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-extrabold text-slate-900 text-base">Need an application first</div>
            <p className="text-sm text-slate-600 leading-snug">
              Deploy for a PLP / new meter needs a completed Con Edison application (Form A) on this job.
              Choose how to create it:
            </p>
            <button
              type="button"
              className="btn bg-brand text-white w-full font-bold"
              data-testid="permits-need-form-a-fill"
              onClick={() => {
                const j = needAppPrompt.job;
                setNeedAppPrompt(null);
                setConedStartJob(j);
              }}
            >
              Fill application myself
            </button>
            <button
              type="button"
              className="btn bg-slate-800 text-white w-full font-bold"
              data-testid="permits-need-form-a-email"
              onClick={() => {
                const j = needAppPrompt.job;
                setNeedAppPrompt(null);
                setConedStartJob(j);
              }}
            >
              Email application to customer
            </button>
            <button
              type="button"
              className="btn-ghost w-full text-sm"
              onClick={() => setNeedAppPrompt(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {conedStartJob ? (
        <ConedApplicationStartSheet
          job={jobsById.get(conedStartJob.id) || conedStartJob}
          onClose={() => setConedStartJob(null)}
          onFill={() => {
            const j = jobsById.get(conedStartJob.id) || conedStartJob;
            setConedStartJob(null);
            setAgencyAppJob(j);
          }}
          onSave={async (patch) => {
            if (patch && conedStartJob?.id) {
              await patchAndSave(conedStartJob.id, patch);
            }
          }}
        />
      ) : null}

      {agencyAppJob ? (
        <AgencyApplicationSheet
          job={jobsById.get(agencyAppJob.id) || agencyAppJob}
          onClose={() => setAgencyAppJob(null)}
          onSave={async (patch) => {
            if (patch && agencyAppJob?.id) {
              await patchAndSave(agencyAppJob.id, patch);
              showToast("Application saved — complete Form A, then Deploy again");
            }
          }}
        />
      ) : null}
    </div>
  );
}
