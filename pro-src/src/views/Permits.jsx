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
  processCompletedProgressPatch,
  queueItemCanDeploy,
  queueItemIsDeploying,
} from "../lib/permitsDeploy.js";
import PaperworkApprovalSheet from "../components/PaperworkApprovalSheet.jsx";
import ConedCreateCaseSheet from "../components/ConedCreateCaseSheet.jsx";

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
}) {
  const status = item.status || "";
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
        </button>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
              item.source === "fleet"
                ? paperworkJobStatusTone(status)
                : isDeploying
                  ? "bg-amber-100 text-amber-900"
                  : status === "queued" || status === "deploy_queued"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-600"
            }`}
          >
            {isDeploying && item.source !== "fleet"
              ? "Deploying…"
              : item.source === "fleet"
                ? paperworkJobStatusLabel(status)
                : status === "deploy_queued"
                  ? "Ready"
                  : status || "pending"}
          </span>
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
          {reviewBits.length ? (
            <ul className="text-[12px] text-slate-700 space-y-0.5">
              {reviewBits.map((b) => (
                <li key={b}>· {b}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-slate-500">No application details yet — Edit to fill.</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1 items-center">
            {canEdit ? (
              <button
                type="button"
                className="pill bg-white border border-slate-200 text-slate-700 text-xs font-semibold"
                data-testid="permits-queue-open"
                onClick={() => onOpen(item)}
              >
                Open
              </button>
            ) : null}
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
            {canEdit ? (
              <button
                type="button"
                className="pill bg-white border border-slate-200 text-slate-700 text-xs font-semibold"
                data-testid="permits-queue-save"
                onClick={() => onEdit(item)}
              >
                Save
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
  const { jobs, emailInsights, patchAndSave, showToast, enqueue } = useStore();
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
  const [editJob, setEditJob] = useState(null);

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
        const anyActive = list.some((j) => ACTIVE_PAPERWORK_JOB_STATUSES.has(j.status));
        if (anyActive) setQueueOpen(true);
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

  const clearableCount = useMemo(
    () => caseRuns.filter((r) => TERMINAL_PAPERWORK_JOB_STATUSES.has(r.status)).length,
    [caseRuns]
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
      const queued =
        value === "new_meter" || value === "new_application"
          ? " — added to Deploy queue" +
            (patch.paperwork?.coned?.meterDeploy?.attached
              ? " (attached to case " + patch.paperwork.coned.meterDeploy.caseNumber + ")"
              : "")
          : "";
      showToast(
        "Meter application saved — " +
          (patch.paperwork?.coned?.meterApplication?.label || meterApplicationLabel(value) || value) +
          queued
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

  /** Green Deploy on a queue row — fire skill; button shows Deploying… */
  const deployQueueItem = async (item) => {
    if (!item?.id || deployingIds[item.id]) return;
    if (item.source === "fleet" && item.status === "awaiting_approval") {
      setApprovalJob(item.run);
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
          showToast("Deploying… fills up to Review for your confirm");
          await refreshRuns();
        } else {
          showToast(
            r.error === "questionnaire_incomplete"
              ? "Fill the application first — tap Edit"
              : "Couldn't deploy: " + (r.error || "try again")
          );
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

      {/* DEPLOY QUEUE — expand → Open / Job / Edit / Save + green Deploy */}
      {queueItems.length ? (
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
                  {queueItems.length} item{queueItems.length === 1 ? "" : "s"} · expand → Deploy
                  when ready
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
                  />
                ))}
              </div>
            </>
          ) : null}
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
    </div>
  );
}
