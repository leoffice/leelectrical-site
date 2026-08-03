// Permits — cross-job Con Edison + City/DOB open-case tracker.
//
// Surface: green Deploy (choose what → customer → fill → queue), Deploy queue
// (titled New Case · Con Edison · address, expand to edit, remove always),
// case progress sections, skills still to teach.
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
  DEPLOY_KINDS,
  DEPLOY_KIND_OPTIONS,
  buildDeployQueueItems,
  formatDeployTitle,
  processCompletedProgressPatch,
  requestTypeShortLabel,
} from "../lib/permitsDeploy.js";
import {
  REQUEST_TYPES as CC_REQUEST_TYPES,
  seedCreateCaseAnswers,
} from "../lib/agencyForms/createCaseQuestionnaire.js";
import PaperworkApprovalSheet from "../components/PaperworkApprovalSheet.jsx";
import ConedCreateCaseSheet from "../components/ConedCreateCaseSheet.jsx";
import LetterQuestionnaireSheet from "../components/LetterQuestionnaireSheet.jsx";
import { upsertJobLetterDraft } from "../lib/letterDraft.js";
import Sheet, { Opt } from "../components/Sheet.jsx";
import { customerJobGroups } from "../lib/calendarLink.js";
import { CustomerAvatar } from "../components/JobCard.jsx";

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

/** Step 1 of Deploy — pick WHAT to deploy. */
function DeployKindPicker({ onPick, onClose }) {
  return (
    <Sheet title="Deploy — what are you deploying?" onClose={onClose} testId="permits-deploy-kind">
      <p className="text-sm text-slate-500 mb-3" data-testid="permits-deploy-kind-note">
        Choose the work type. Then pick the customer and fill or queue it.
      </p>
      <div className="space-y-2">
        {DEPLOY_KIND_OPTIONS.map((opt) => (
          <Opt
            key={opt.id}
            icon={opt.id === DEPLOY_KINDS.ELECTRICAL_PERMIT ? "🏛" : "⚡"}
            title={opt.title}
            note={`${opt.agency} · ${opt.subtitle}`}
            onClick={() => onPick(opt)}
            data-testid={`permits-deploy-kind-${opt.id}`}
          />
        ))}
      </div>
    </Sheet>
  );
}

/** New Case branch — Additional Load vs No Additional Load. */
function DeployRequestTypePicker({ onPick, onClose }) {
  return (
    <Sheet title="New Case — load type" onClose={onClose} testId="permits-deploy-request-type">
      <p className="text-sm text-slate-500 mb-3">
        Con Edison case for the service address.
      </p>
      <div className="space-y-2">
        <Opt
          icon="➕"
          title="Additional Load"
          note="Add load to existing service — full questionnaire"
          onClick={() => onPick(CC_REQUEST_TYPES.ADD_LOAD)}
          data-testid="permits-deploy-rt-add-load"
        />
        <Opt
          icon="🔧"
          title="No Additional Load"
          note="Work on customer equipment — short path (most common)"
          onClick={() => onPick(CC_REQUEST_TYPES.NO_ADD_LOAD)}
          data-testid="permits-deploy-rt-no-add-load"
        />
      </div>
    </Sheet>
  );
}

/** Pick customer → job for Deploy (rules seed from job; no hand-typing field names). */
function DeployJobPicker({ jobs, onPick, onClose, title = "Deploy — pick customer", note }) {
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState({});
  const groups = useMemo(() => customerJobGroups(jobs), [jobs]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return groups;
    return groups.filter(([key, list]) => {
      const name = String(list[0]?.customer || list[0]?.customerName || key || "").toLowerCase();
      const hitJob = list.some((j) => {
        const blob = [
          j.customer,
          j.customerName,
          j.title,
          j.serviceAddress,
          j.address,
          j.estimateNo,
          j.invoiceNo,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(needle);
      });
      return name.includes(needle) || hitJob;
    });
  }, [groups, q]);

  return (
    <Sheet title={title} onClose={onClose} testId="permits-deploy-picker">
      <p className="text-sm text-slate-500 mb-3" data-testid="permits-deploy-rules-note">
        {note ||
          "Choose a customer. We pull name, address, building info, and estimate scope — then you fill the application and Deploy queues it."}
      </p>
      <input
        type="search"
        className="w-full mb-3 px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
        placeholder="Search customer, address, estimate…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        data-testid="permits-deploy-search"
        autoFocus
      />
      {filtered.length ? (
        <div className="space-y-2">
          {filtered.map(([key, list]) => {
            const name = list[0].customer || list[0].customerName || "(no customer)";
            const open = !!expanded[key] || !!q.trim();
            return (
              <div key={key} className="card overflow-hidden" data-testid="permits-deploy-customer">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  onClick={() => setExpanded((o) => ({ ...o, [key]: !o[key] }))}
                >
                  <CustomerAvatar name={name} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-slate-900 truncate">{name}</span>
                    <span className="block text-xs text-slate-500">
                      {list.length} job{list.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>
                    ▾
                  </span>
                </button>
                {open ? (
                  <div className="px-3 pb-3 space-y-1.5 bg-slate-50/60 border-t border-slate-100 pt-3">
                    {list.map((j) => (
                      <Opt
                        key={j.id}
                        icon="📄"
                        title={j.title || j.serviceAddress || j.address || "Job"}
                        note={
                          [
                            j.serviceAddress || j.address,
                            j.estimateNo ? `Est ${j.estimateNo}` : "",
                            j.invoiceNo ? `Inv ${j.invoiceNo}` : "",
                          ]
                            .filter(Boolean)
                            .join(" · ") || j.id
                        }
                        onClick={() => onPick(j)}
                        data-testid="permits-deploy-job"
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-slate-400 text-center py-8">No matching customers.</div>
      )}
    </Sheet>
  );
}

/** One Deploy queue row — tap expands application details; remove always on. */
function DeployQueueRow({
  item,
  expanded,
  onToggle,
  onRemove,
  onEdit,
  onReview,
  onOpenJob,
  onReadyTodo,
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
                : status === "queued" || status === "deploy_queued"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-600"
            }`}
          >
            {item.source === "fleet"
              ? paperworkJobStatusLabel(status)
              : status === "deploy_queued"
                ? "Deploy queue"
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
            <p className="text-[12px] text-slate-500">No application details yet — edit to fill.</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {item.jobId ? (
              <button
                type="button"
                className="pill bg-white border border-slate-200 text-slate-700 text-xs font-semibold"
                onClick={() => onOpenJob(item.jobId)}
              >
                Open job
              </button>
            ) : null}
            {(item.source === "fleet" && item.run?.type === "create_case") ||
            item.source === "draft" ||
            item.kind === "New Case" ? (
              <button
                type="button"
                className="pill bg-brand-soft text-brand text-xs font-bold"
                data-testid="permits-queue-edit"
                onClick={() => onEdit(item)}
              >
                Edit &amp; save
              </button>
            ) : null}
            {item.source === "fleet" && status === "awaiting_approval" ? (
              <button
                type="button"
                className="btn bg-red-600 text-white !py-1.5 !px-2.5 text-xs font-extrabold animate-pulse"
                onClick={() => onReview(item.run)}
                data-testid="permits-case-review"
              >
                Review &amp; approve
              </button>
            ) : null}
            {item.source === "todo" && item.todo?.status !== "queued" ? (
              <button
                type="button"
                className="btn bg-violet-700 text-white !py-1.5 !px-2.5 text-xs font-bold"
                data-testid="permits-todo-ready"
                onClick={() => onReadyTodo(item)}
              >
                Ready to go
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

  // Deploy wizard: kind → (request type) → job → sheet
  const [pickingKind, setPickingKind] = useState(false);
  const [pickingRequestType, setPickingRequestType] = useState(false);
  const [pickingJob, setPickingJob] = useState(false);
  const [deployKind, setDeployKind] = useState(null);
  const [deployRequestType, setDeployRequestType] = useState(null);
  const [deployJob, setDeployJob] = useState(null);
  const [letterJob, setLetterJob] = useState(null);
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

  const startDeployFromKind = (opt) => {
    setDeployKind(opt.id);
    setPickingKind(false);
    if (opt.id === DEPLOY_KINDS.NEW_CASE) {
      setPickingRequestType(true);
      return;
    }
    setPickingJob(true);
  };

  const afterJobPicked = async (j) => {
    setPickingJob(false);
    const kind = deployKind;
    if (kind === DEPLOY_KINDS.NEW_CASE) {
      // Seed request type onto a draft so the sheet opens on the right branch
      const rt = deployRequestType || CC_REQUEST_TYPES.NO_ADD_LOAD;
      const seeded = seedCreateCaseAnswers(j, j?.paperwork?.coned?.createCase, {});
      seeded.requestType = rt;
      await patchAndSave(j.id, {
        paperwork: {
          coned: {
            enabled: true,
            createCase: {
              status: "draft",
              answers: seeded,
              stepIndex: 0,
              updatedAt: Date.now(),
            },
          },
        },
      });
      setDeployJob(j);
      return;
    }
    if (kind === DEPLOY_KINDS.LOAD_LETTER) {
      setLetterJob(j);
      return;
    }
    if (kind === DEPLOY_KINDS.NEW_METER) {
      await handleMeterApplication(j.id, "new_meter");
      setQueueOpen(true);
      showToast("New meter is in the Deploy queue");
      return;
    }
    if (kind === DEPLOY_KINDS.ELECTRICAL_PERMIT) {
      const { patch, added } = addPaperworkTodoPatch(j, {
        kind: "file_electrical_permit",
        title: formatDeployTitle({
          kind: "Electrical Permit",
          agency: "DOB",
          serviceAddress: j.serviceAddress || j.address || "",
        }),
        note: "DOB login + permit details — skill when Submitted",
        source: "deploy_chooser",
      });
      if (patch) await patchAndSave(j.id, patch);
      setQueueOpen(true);
      showToast(added ? "Electrical Permit queued for Deploy" : "Already on the queue");
      return;
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

  const jobPickerTitle =
    deployKind === DEPLOY_KINDS.LOAD_LETTER
      ? "Load Letter — pick customer"
      : deployKind === DEPLOY_KINDS.NEW_METER
        ? "New Meter — pick customer"
        : deployKind === DEPLOY_KINDS.ELECTRICAL_PERMIT
          ? "Electrical Permit — pick customer"
          : deployKind === DEPLOY_KINDS.NEW_CASE
            ? `New Case · ${requestTypeShortLabel(deployRequestType)} — pick customer`
            : "Deploy — pick customer";

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

      {/* DEPLOY — green top button → choose what → customer → fill/queue */}
      <div className="card overflow-hidden mb-4 border border-emerald-200" data-testid="permits-deploy-card">
        <div className="px-4 py-3 bg-emerald-50/70">
          <h2 className="font-extrabold text-sm text-emerald-900 uppercase tracking-wide">
            Deploy
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Choose what you&apos;re deploying (New Case, Load Letter, New Meter, Electrical Permit),
            pick the customer, fill, then it lands in the queue below.
          </p>
          <button
            type="button"
            className="btn bg-emerald-700 text-white w-full mt-3 font-extrabold"
            data-testid="permits-deploy-btn"
            onClick={() => {
              setDeployKind(null);
              setDeployRequestType(null);
              setPickingKind(true);
            }}
          >
            Deploy
          </button>
        </div>
      </div>

      {/* DEPLOY QUEUE — titled rows, expand/edit, remove always */}
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
                  {queueItems.length} item{queueItems.length === 1 ? "" : "s"} · tap a row to{" "}
                  {queueOpen ? "edit or collapse" : "expand"}
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
                    onToggle={(id) =>
                      setExpandedIds((m) => ({ ...m, [id]: !m[id] }))
                    }
                    onRemove={removeQueueItem}
                    onEdit={onEditQueueItem}
                    onReview={setApprovalJob}
                    onOpenJob={open}
                    onReadyTodo={async (it) => {
                      const r = await readyToGoTodo({
                        job: it.job,
                        todo: it.todo,
                        enqueue,
                        onSave: (p) => patchAndSave(it.jobId, p),
                      });
                      showToast(
                        r.queued
                          ? "Queued — stops at review for your confirm"
                          : "Not fired: " + (r.error || "unknown")
                      );
                    }}
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
          Tap Deploy to start a New Case, Load Letter, or New Meter.
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

      {pickingKind ? (
        <DeployKindPicker
          onClose={() => setPickingKind(false)}
          onPick={startDeployFromKind}
        />
      ) : null}

      {pickingRequestType ? (
        <DeployRequestTypePicker
          onClose={() => {
            setPickingRequestType(false);
            setDeployKind(null);
          }}
          onPick={(rt) => {
            setDeployRequestType(rt);
            setPickingRequestType(false);
            setPickingJob(true);
          }}
        />
      ) : null}

      {pickingJob ? (
        <DeployJobPicker
          jobs={jobs}
          title={jobPickerTitle}
          onClose={() => {
            setPickingJob(false);
            setDeployKind(null);
            setDeployRequestType(null);
          }}
          onPick={afterJobPicked}
        />
      ) : null}

      {deployJob ? (
        <ConedCreateCaseSheet
          job={jobsById.get(deployJob.id) || deployJob}
          onClose={() => {
            setDeployJob(null);
            setDeployKind(null);
            setDeployRequestType(null);
          }}
          onSave={async (patch) => {
            await onCreateCaseSaved(patch, deployJob.id);
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

      {letterJob ? (
        <LetterQuestionnaireSheet
          job={jobsById.get(letterJob.id) || letterJob}
          initialTypeId="load_letter"
          itemName="Load Letter"
          onClose={() => {
            setLetterJob(null);
            setDeployKind(null);
          }}
          onSave={async ({ draft }) => {
            if (!draft) return;
            const job = jobsById.get(letterJob.id) || letterJob;
            const letterDrafts = upsertJobLetterDraft(job, draft);
            await patchAndSave(letterJob.id, { letterDrafts });
            // Also put a titled item on the Deploy queue via todo for visibility
            const { patch: todoPatch } = addPaperworkTodoPatch(job, {
              kind: "send_application",
              meterLabel: "Load Letter",
              title: formatDeployTitle({
                kind: "Load Letter",
                agency: "Con Edison",
                serviceAddress: job.serviceAddress || job.address || draft.siteAddress || "",
              }),
              note: "Load letter drafted — ready to send / attach",
              source: "deploy_load_letter",
            });
            if (todoPatch) await patchAndSave(letterJob.id, todoPatch);
            showToast("Load Letter saved — in Deploy queue");
            setLetterJob(null);
            setQueueOpen(true);
          }}
        />
      ) : null}
    </div>
  );
}
