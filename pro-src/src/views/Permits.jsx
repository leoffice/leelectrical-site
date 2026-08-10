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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  countReadyConedApplications,
  listConedCompletedFiles,
  listReadyConedApplications,
  queueAllReadyConedUploads,
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
import {
  listConedCustomerTodos,
  conedTodoTapResult,
  jobPatchFromConedCustomerTodos,
  seedConedCustomerTodos,
  updateTodoListFromInsights,
} from "../lib/conedCustomerTodos.js";
import PaperworkApprovalSheet from "../components/PaperworkApprovalSheet.jsx";
import ConedCreateCaseSheet from "../components/ConedCreateCaseSheet.jsx";
import AgencyApplicationSheet from "../components/AgencyApplicationSheet.jsx";
import ConedApplicationStartSheet from "../components/ConedApplicationStartSheet.jsx";
import Toggle from "../components/Toggle.jsx";
import {
  openApplicationPipePatch,
  renewSchedulePatch,
  getRenewSchedule,
} from "../lib/permitThreeSurfacePipe.js";
import {
  RENEW_HAMPTON_SCENARIO,
  RENEW_HACKNER_SCENARIO,
  assertRenewComposeRecipient,
  buildPermitRenewEmail,
  buildPermitRenewPayUrl,
  formatPermitDateMdY,
  isLeviTesterMockRenewJob,
  listPendingRenewCards,
  listPaidUpdatePermitCards,
  prepareRenewScenario,
} from "../lib/permitRenewal.js";
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

/** Collapsible section — auto-closes after idle if not actively used (Levi 2026-08-05). */
function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  testId,
  /** Auto-collapse after this many ms of no interaction while open (0 = off). */
  autoCollapseMs = 30_000,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const idleRef = useRef(null);
  const bumpIdle = useCallback(() => {
    if (idleRef.current) clearTimeout(idleRef.current);
    if (!open || !autoCollapseMs) return;
    idleRef.current = setTimeout(() => setOpen(false), autoCollapseMs);
  }, [open, autoCollapseMs]);
  useEffect(() => {
    bumpIdle();
    return () => {
      if (idleRef.current) clearTimeout(idleRef.current);
    };
  }, [bumpIdle]);
  return (
    <div
      className="mb-4"
      data-testid={testId || "permits-collapsible"}
      onPointerDown={bumpIdle}
      onKeyDown={bumpIdle}
    >
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-1 mb-1.5 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          {title}
        </span>
        <span className="text-slate-400 text-xs">{open ? "▾" : "▸"}</span>
      </button>
      {open ? children : null}
    </div>
  );
}

/**
 * Renewal Application — collapsible like Deploy queue (Levi 2026-08-10).
 * Previous card design restored + tightened: address, name, permit #, exp always visible.
 * Expand is pure state toggle (snappy — no network on open).
 */
function RenewalNotificationsCard({ jobs, phaseABusy, onSendForRow, onOpenJob }) {
  const pending = useMemo(() => listPendingRenewCards(jobs), [jobs]);
  const paidDeploy = useMemo(() => listPaidUpdatePermitCards(jobs), [jobs]);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [expandedId, setExpandedId] = useState("");

  return (
    <div
      className="card overflow-hidden mb-4 border border-violet-200"
      data-testid="permit-renew-phase-a-mock"
    >
      <button
        type="button"
        className="w-full px-3 py-2.5 border-b border-violet-100 bg-violet-50/90 text-left"
        onClick={() => setSectionOpen((o) => !o)}
        aria-expanded={sectionOpen}
        data-testid="renewal-application-toggle"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2
              className="font-semibold text-sm text-violet-950 tracking-wide"
              data-testid="renewal-notifications-title"
            >
              Renewal Application
            </h2>
            <p className="text-[11px] text-violet-800/70 mt-0.5">
              Pending approval to send
            </p>
          </div>
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="pill bg-violet-200 text-violet-950 text-[11px] font-extrabold min-w-[1.5rem] justify-center">
              {pending.length}
            </span>
            <span
              className={`text-violet-400 transition-transform text-lg leading-none ${
                sectionOpen ? "rotate-90" : ""
              }`}
            >
              ›
            </span>
          </span>
        </div>
      </button>

      {sectionOpen ? (
        <div className="bg-white">
          {paidDeploy.length > 0 ? (
            <div
              className="mx-2.5 mt-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2"
              data-testid="permit-renew-paid-deploy-box"
            >
              <div className="text-[11px] font-extrabold text-emerald-900 mb-1">
                Paid — update permit ({paidDeploy.length})
              </div>
              <ul className="space-y-1">
                {paidDeploy.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate font-semibold text-emerald-950">
                      {r.address} · {r.customer}
                      {r.permitNo ? ` · ${r.permitNo}` : ""}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-[11px] font-bold text-emerald-800 underline"
                      onClick={() => onOpenJob?.(r.jobId)}
                    >
                      Update
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="p-2 space-y-1.5" data-testid="permit-renew-app-list">
            {!pending.length ? (
              <p className="text-[12px] text-slate-500 text-center py-3">0 pending</p>
            ) : (
              pending.map((r) => {
                const open = expandedId === r.id;
                const expLabel = r.expiresDate
                  ? formatPermitDateMdY(r.expiresDate) || r.expiresDate
                  : "";
                const issuedLabel =
                  r.issuedDate || r.gradedDate
                    ? formatPermitDateMdY(r.issuedDate || r.gradedDate) ||
                      (r.issuedDate || r.gradedDate)
                    : "";
                return (
                  <div
                    key={r.id}
                    className="rounded-xl border border-violet-100 bg-white shadow-sm overflow-hidden"
                    data-testid="permit-renew-app-row"
                  >
                    <button
                      type="button"
                      className="w-full text-left px-2.5 pt-2 pb-1"
                      onClick={() => setExpandedId(open ? "" : r.id)}
                    >
                      <div className="text-[13px] font-extrabold text-slate-900 leading-snug truncate">
                        {r.address || "—"}
                      </div>
                      <div className="text-[12px] font-semibold text-slate-700 truncate">
                        {r.customer || "—"}
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5 truncate">
                        {r.permitNo ? (
                          <span className="font-bold text-violet-800">{r.permitNo}</span>
                        ) : (
                          <span className="text-slate-400">No permit #</span>
                        )}
                        {expLabel ? (
                          <span>
                            {" "}
                            · Exp {expLabel}
                          </span>
                        ) : null}
                        {r.fee != null ? (
                          <span className="text-slate-500"> · ${r.fee}</span>
                        ) : null}
                        {r.stageLabel ? (
                          <span className="text-amber-800 font-semibold"> · {r.stageLabel}</span>
                        ) : null}
                      </div>
                    </button>
                    <div className="px-2.5 pb-2 flex gap-1.5">
                      <button
                        type="button"
                        className="btn flex-1 bg-violet-700 text-white !py-1.5 text-[11px] font-bold rounded-lg"
                        disabled={phaseABusy}
                        data-testid="permit-renew-row-send"
                        onClick={() => onSendForRow?.(r)}
                      >
                        Send Email
                      </button>
                      <button
                        type="button"
                        className="btn bg-white border border-violet-200 text-violet-900 !py-1.5 !px-2.5 text-[11px] font-bold rounded-lg"
                        onClick={() => setExpandedId(open ? "" : r.id)}
                      >
                        {open ? "Less" : "More"}
                      </button>
                    </div>
                    {open ? (
                      <div
                        className="px-2.5 pb-2 border-t border-violet-50 text-[11px] text-slate-600 space-y-0.5 pt-1.5"
                        data-testid="permit-renew-app-detail"
                      >
                        <div>
                          <span className="font-semibold text-slate-700">Issued: </span>
                          {issuedLabel || "—"}
                          <span className="mx-1.5 text-slate-300">·</span>
                          <span className="font-semibold text-slate-700">Expires: </span>
                          {expLabel || "—"}
                        </div>
                        {r.email ? (
                          <div>
                            <span className="font-semibold text-slate-700">Email: </span>
                            {r.email}
                          </div>
                        ) : null}
                        {r.jobId ? (
                          <button
                            type="button"
                            className="mt-0.5 text-[11px] font-bold text-violet-800 underline underline-offset-2"
                            onClick={() => onOpenJob?.(r.jobId)}
                          >
                            Open job
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RenewEmailComposeSheet({ draft, saving, onClose, onSend }) {
  const [email, setEmail] = useState(draft?.to || "");
  const [subject, setSubject] = useState(draft?.subject || "");
  const [message, setMessage] = useState(draft?.body || "");

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 p-3"
      data-testid="renew-email-compose-sheet"
      role="dialog"
      aria-label="Renewal email compose"
      style={{ paddingBottom: "var(--kb-inset, 0px)" }}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-y-auto p-4"
        style={{ maxHeight: "min(90vh, calc(var(--vv-height, 100dvh) - 1.5rem))" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-extrabold text-slate-900">Send Email</h3>
          <button
            type="button"
            className="text-slate-400 text-xl leading-none px-2"
            onClick={onClose}
            aria-label="Close"
            disabled={saving}
          >
            ×
          </button>
        </div>
        <label className="block text-[11px] font-bold text-slate-600 mb-1">
          To — keep on file or enter a new address
        </label>
        <input
          className="input mb-3"
          type="text"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="renew-email-to"
        />
        <label className="block text-[11px] font-bold text-slate-600 mb-1">Subject</label>
        <input
          className="input mb-3"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          data-testid="renew-email-subject"
        />
        <label className="block text-[11px] font-bold text-slate-600 mb-1">Message</label>
        <textarea
          className="input mb-3 min-h-[180px] text-sm"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          data-testid="renew-email-body"
        />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn bg-slate-100 text-slate-800" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn bg-violet-700 text-white font-bold"
            disabled={saving || !String(email || "").includes("@")}
            data-testid="renew-email-send"
            onClick={() => onSend?.({ email, subject, message })}
          >
            {saving ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Group board cases by job so Con Ed + DOB share one card when idle (Levi 2026-08-05). */
function groupCasesByJob(sections) {
  const map = new Map();
  for (const sec of sections || []) {
    for (const row of sec.cases || []) {
      const id = String(row.jobId || row.key || "");
      if (!id) continue;
      if (!map.has(id)) {
        map.set(id, {
          jobId: row.jobId,
          jobName: row.jobName,
          address: row.address,
          rows: [],
        });
      }
      const g = map.get(id);
      if (!g.jobName && row.jobName) g.jobName = row.jobName;
      if (!g.address && row.address) g.address = row.address;
      g.rows.push({ ...row, sectionLabel: sec.label });
    }
  }
  return [...map.values()];
}

/** One job card with nested Con Ed / DOB (Permit) expanders. */
function JobPermitGroupCard({
  group,
  jobsById,
  onOpen,
  onMeterApplication,
  onStepAction,
  onCustomerTodo,
  onUpdateTodoList,
  updatingTodoId,
  onRenewSchedule,
}) {
  const [open, setOpen] = useState(false);
  const idleRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => setOpen(false), 30_000);
    return () => {
      if (idleRef.current) clearTimeout(idleRef.current);
    };
  }, [open]);
  const agencies = group.rows.map((r) => {
    const a = String(r.agency || "");
    if (a === "coned") return "Con Edison";
    if (a === "dob" || a === "city") return "Permit / DOB";
    return r.sectionLabel || a || "Permit";
  });
  const uniqueLabels = [...new Set(agencies)];
  const needsAny = group.rows.some((r) => isActionNeeded(r));

  return (
    <div
      className="card overflow-hidden"
      data-testid="permit-job-group"
      data-job-id={group.jobId || ""}
    >
      <button
        type="button"
        className="w-full text-left px-4 py-3 flex items-start gap-3"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="permit-job-group-toggle"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <b className="truncate">{group.jobName || "Job"}</b>
            {uniqueLabels.map((lab) => (
              <span
                key={lab}
                className="text-[10px] font-bold uppercase tracking-wide text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded"
              >
                {lab}
              </span>
            ))}
            {needsAny ? (
              <span className="text-[10px] font-bold uppercase tracking-wide text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
                Action
              </span>
            ) : null}
          </div>
          {group.address ? (
            <div className="text-xs text-slate-500 truncate">{group.address}</div>
          ) : null}
          {!open ? (
            <div className="text-[11px] text-slate-400 mt-0.5">
              {group.rows.length} track{group.rows.length === 1 ? "" : "s"} · tap to expand
            </div>
          ) : null}
        </div>
        <span className="text-slate-400 text-xs shrink-0">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="px-2 pb-2 space-y-2 border-t border-slate-100" data-testid="permit-job-group-body">
          {group.rows.map((row) => (
            <CaseRow
              key={row.key}
              row={row}
              job={jobsById.get(row.jobId)}
              onOpen={onOpen}
              onMeterApplication={onMeterApplication}
              onStepAction={onStepAction}
              onCustomerTodo={onCustomerTodo}
              onUpdateTodoList={onUpdateTodoList}
              updatingTodo={updatingTodoId === row.jobId}
              onRenewSchedule={onRenewSchedule}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
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

function CustomerTodoList({ todos = [], onTap }) {
  if (!todos.length) return null;
  return (
    <ul className="mt-2 space-y-1.5" data-testid="coned-customer-todos">
      {todos.map((t) => {
        const done = t.status === "done";
        const blocked = t.status === "blocked";
        return (
          <li key={t.id || t.kind}>
            <button
              type="button"
              className={
                "w-full flex items-start gap-2 text-left text-[12px] rounded-lg px-2 py-1.5 border " +
                (done
                  ? "border-emerald-100 bg-emerald-50/50 text-emerald-900"
                  : blocked
                    ? "border-slate-100 bg-slate-50 text-slate-400"
                    : "border-amber-100 bg-amber-50/60 text-amber-950")
              }
              onClick={(e) => {
                e.stopPropagation();
                onTap?.(t);
              }}
              data-testid="coned-customer-todo"
              data-kind={t.kind}
              data-status={t.status}
            >
              <span className="shrink-0 font-bold" aria-hidden>
                {done ? "☑" : blocked ? "○" : "☐"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{t.title}</span>
                {t.note ? (
                  <span className="block text-[10px] text-slate-500">{t.note}</span>
                ) : null}
                {t.skillReady === false ? (
                  <span className="block text-[10px] font-bold text-slate-500">
                    Skill not built yet
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CaseRow({
  row,
  job,
  onOpen,
  onMeterApplication,
  onStepAction,
  onCustomerTodo,
  onUpdateTodoList,
  updatingTodo,
  onRenewSchedule,
}) {
  const [expanded, setExpanded] = useState(false);
  const isConed = row.agency === "coned";
  const meter = job ? getMeterApplication(job) : null;
  const customerTodos = job ? listConedCustomerTodos(job) : [];
  const dueNow = Array.isArray(row.dueNow) ? row.dueNow : [];
  const caseSteps = Array.isArray(row.caseSteps) ? row.caseSteps : [];
  // Collapsed: only due-now chips; expanded: full flow with gates
  const showSteps = expanded ? caseSteps : dueNow;
  // Levi 2026-08-05: button says Updating while work runs, then Last Updated.
  const lastTodoUpdatedAt =
    job?.paperwork?.coned?.todoListUpdatedAt || job?.paperwork?.coned?.todoListLastUpdatedAt || "";
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
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3 flex items-start gap-3"
        data-testid="permit-row-toggle"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <b className="truncate">{row.jobName}</b>
            {row.caseNumber ? (
              <span className="text-[11px] font-semibold text-slate-500 shrink-0">{row.caseNumber}</span>
            ) : null}
            {isConed ? (
              <span className="text-[10px] font-bold uppercase tracking-wide text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">
                Con Ed
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                {row.agency === "city" || row.agency === "dob" ? "DOB / City" : row.agency || "Permit"}
              </span>
            )}
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
          {/* Collapsed: show customer to-do checkboxes summary */}
          {!expanded && customerTodos.length ? (
            <div className="text-[11px] text-slate-600 mt-1">
              To-do: {customerTodos.filter((t) => t.status === "done").length}/{customerTodos.length}{" "}
              checked
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
          <span className="text-slate-400 text-xs">{expanded ? "▾" : "▸"}</span>
        </div>
      </button>

      {expanded ? (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
          {/* Combined Con Ed + electrical + customer to-do in one card body */}
          {customerTodos.length ? (
            <div>
              <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide mb-1">
                Con Ed to-do list
              </div>
              <CustomerTodoList
                todos={customerTodos}
                onTap={(t) => onCustomerTodo?.(t, job, row)}
              />
            </div>
          ) : null}
          {row.recommended?.status === "due" ? (
            <button
              type="button"
              className="w-full btn bg-brand text-white font-semibold text-sm !py-3"
              onClick={() => handleStep(row.recommended)}
              data-testid="permit-run-next"
            >
              Do next: {row.recommended.title}
            </button>
          ) : null}
          {isConed && onUpdateTodoList ? (
            <button
              type="button"
              className="w-full btn bg-slate-800 text-white font-bold text-xs !py-2.5"
              disabled={!!updatingTodo}
              onClick={() => onUpdateTodoList(job, row)}
              data-testid="permit-update-todo-list"
            >
              {updatingTodo
                ? "Updating"
                : lastTodoUpdatedAt
                  ? "Last Updated"
                  : "Update To-do List"}
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
          {job && onMeterApplication && isConed ? (
            <MeterApplicationField
              job={job}
              onSelect={(value) => onMeterApplication(row.jobId, value)}
            />
          ) : null}
          {/* Yearly city permit renew — same flag as Job Paperwork panel (Levi 2026-08-06). Auto email OFF. */}
          {job && !isConed && onRenewSchedule ? (
            <div
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 space-y-2"
              data-testid="permit-renew-schedule-row"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800">Yearly permit renew</div>
                  <div className="text-[10px] text-slate-500">
                    12-mo schedule · auto email off until launch
                  </div>
                </div>
                <Toggle
                  small
                  on={getRenewSchedule(job, "dob")}
                  label="Yearly permit renew schedule"
                  onChange={(on) => onRenewSchedule(row.jobId, on)}
                />
              </div>

            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Levi 2026-08-05: green Deploy stays visible while working — battery fill + %
 * so the row never looks idle during a long Con Ed / fleet deploy.
 */
function DeployProgressButton({ pct = 0, label = "Deploying…", testId, compact }) {
  const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  return (
    <button
      type="button"
      disabled
      aria-busy="true"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={p}
      data-testid={testId}
      className={
        compact
          ? "relative overflow-hidden rounded-lg border border-emerald-800/40 min-w-[6.5rem] !py-1 !px-2.5 text-[11px] font-extrabold text-white shadow-inner"
          : "relative overflow-hidden rounded-xl border border-emerald-800/40 min-w-[8.5rem] !py-1.5 !px-3 text-xs font-extrabold text-white shadow-inner"
      }
      style={{ background: "#064e3b" }}
    >
      {/* Battery charge fill */}
      <span
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-600 via-emerald-400 to-lime-300 transition-[width] duration-700 ease-out"
        style={{ width: `${p}%` }}
        aria-hidden
      />
      {/* Soft pulse so it never looks frozen while holding */}
      <span
        className="absolute inset-0 animate-pulse bg-emerald-300/10"
        aria-hidden
      />
      <span className="relative z-10 tabular-nums drop-shadow-sm whitespace-nowrap">
        {label} {p}%
      </span>
    </button>
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

  // Battery charge while Deploying (fleet rarely streams real %).
  // Keeps moving + holds at 94% until the row leaves the queue.
  const [deployPct, setDeployPct] = useState(0);
  const [deployPhaseLabel, setDeployPhaseLabel] = useState("Deploying…");
  useEffect(() => {
    if (!isDeploying) {
      setDeployPct(0);
      setDeployPhaseLabel("Deploying…");
      return undefined;
    }
    setDeployPct((p) => (p > 0 ? p : 6));
    setDeployPhaseLabel("Deploying…");
    const phases = [
      [12, "Deploying…"],
      [28, "Queuing…"],
      [42, "Opening…"],
      [58, "Uploading…"],
      [74, "Working…"],
      [88, "Holding…"],
      [94, "Almost…"],
    ];
    let i = 0;
    const t = setInterval(() => {
      setDeployPct((prev) => {
        // Faster early, then crawl so the green fill is visible for a long run.
        const step = prev < 30 ? 5 : prev < 55 ? 3 : prev < 80 ? 2 : 1;
        const next = Math.min(94, prev + step);
        while (i < phases.length && next >= phases[i][0]) {
          setDeployPhaseLabel(phases[i][1]);
          i += 1;
        }
        return next;
      });
    }, 700);
    return () => clearInterval(t);
  }, [isDeploying, item.id]);

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
          <div className="text-[13px] font-semibold text-slate-900 leading-snug">
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
              <DeployProgressButton
                pct={deployPct}
                label={deployPhaseLabel}
                testId="permits-queue-deploy-sticky"
                compact
              />
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
              <DeployProgressButton
                pct={deployPct}
                label={deployPhaseLabel}
                testId="permits-queue-deploy"
              />
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
  const { jobs, emailInsights, events, patchAndSave, showToast, enqueue, createJob, api } =
    useStore();
  const [phaseABusy, setPhaseABusy] = useState(false);
  /** { draft, payUrl, job, created } — open compose before send (Levi 2026-08-10). */
  const [renewCompose, setRenewCompose] = useState(null);
  const config = useTenantConfig();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [caseRuns, setCaseRuns] = useState([]);
  const [approvalJob, setApprovalJob] = useState(null);
  // Collapsed by default so the tab is scannable; expand what you need (Levi 2026-08-05).
  const [queueOpen, setQueueOpen] = useState(false);
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
  /** Keep latest jobs for fleet poll without restarting the timer on every save. */
  const jobsRef = React.useRef(jobs);
  jobsRef.current = jobs;
  const dismissOnceRef = React.useRef(new Set());
  const healStartedRef = React.useRef(false);

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
        const liveJobs = jobsRef.current || [];
        const byId = new Map(liveJobs.filter((x) => x?.id).map((x) => [x.id, x]));
        // Auto clean-slate superseded fails — fire-and-forget, never block poll (lag fix)
        const superseded = list.filter(
          (j) =>
            j?.id &&
            !dismissOnceRef.current.has(j.id) &&
            (j.status === "failed" || j.status === "rejected") &&
            fleetRunIsSupersededSuccess(j, byId.get(j.jobId), list)
        );
        for (const j of superseded.slice(0, 5)) {
          dismissOnceRef.current.add(j.id);
          void dismissPaperworkJob(j.id).catch(() => {
            dismissOnceRef.current.delete(j.id);
          });
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
          for (const j of failed.slice(0, 3)) {
            const fields = fieldsFromPaperworkJob(j, byId.get(j.jobId));
            void reportPaperworkFailOnce(
              { ...fields, phase: "permits_poll", error: fields.error || j.error },
              enqueue
            );
          }
        }
        // Poll less often when quiet — lag fix (Levi 2026-08-04)
        timer = setTimeout(tick, anyActive ? 30000 : 90000);
      } else {
        timer = setTimeout(tick, 90000);
      }
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // Intentionally NOT depending on jobs — that restarted the poll every save (main lag).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enqueue]);

  // Heal open-case steps + open the three-surface pipe once per session (idle, limited)
  useEffect(() => {
    if (!patchAndSave || !jobs?.length || healStartedRef.current) return;
    healStartedRef.current = true;
    let cancelled = false;
    const run = async () => {
      // Yield so first paint / navigation is not blocked
      await new Promise((r) => setTimeout(r, 2500));
      if (cancelled) return;
      const candidates = (jobs || []).filter(
        (j) =>
          j?.id &&
          !healedRef.current.has(j.id) &&
          (j.paperwork?.coned?.caseNumber ||
            j.paperwork?.dob?.jobNumber ||
            j.paperwork?.coned?.customerTodos?.length ||
            j.paperwork?.coned?.currentStage ||
            j.paperwork?.dob?.currentStage ||
            (Array.isArray(j.permits) && j.permits.length > 0))
      );
      for (const job of candidates.slice(0, 12)) {
        if (cancelled) return;
        if (healedRef.current.has(job.id)) continue;
        const heal = healCaseProgressPatch(job, {
          events: events || [],
          insights: emailInsights || [],
        });
        // Open applications → Job Info toggle + Paperwork panel + this tab (one pipe)
        const pipe = openApplicationPipePatch(job);
        const patch =
          heal || pipe
            ? {
                ...(heal || {}),
                ...(pipe || {}),
                paperwork: {
                  ...((heal && heal.paperwork) || {}),
                  ...((pipe && pipe.paperwork) || {}),
                },
                ...(pipe?.permits ? { permits: pipe.permits } : heal?.permits ? { permits: heal.permits } : {}),
                ...(pipe?.status || heal?.status
                  ? { status: { ...(heal?.status || {}), ...(pipe?.status || {}) } }
                  : {}),
                ...(pipe?.permitTracker != null ? { permitTracker: pipe.permitTracker } : {}),
              }
            : null;
        healedRef.current.add(job.id);
        if (!patch || !Object.keys(patch).length) continue;
        try {
          await patchAndSave(job.id, patch);
          // stagger writes so UI stays responsive
          await new Promise((r) => setTimeout(r, 200));
        } catch {
          healedRef.current.delete(job.id);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // Run once when jobs first available — do not re-bind to jobs array updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!jobs?.length, patchAndSave]);

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

  const handleRenewSchedule = async (jobId, on) => {
    if (!jobId) return;
    const job = jobsById.get(jobId);
    if (!job) {
      showToast("Job not found for this case");
      return;
    }
    await patchAndSave(jobId, renewSchedulePatch(job, { on, agency: "dob" }));
    showToast(
      on
        ? "Yearly renew on — same flag on the job Paperwork panel"
        : "Yearly renew off"
    );
  };

  /**
   * Create/reuse renew invoice for a ready address (Hampton / Schenectady).
   * Also creates service address on the customer when missing.
   */
  const ensureRenewInvoice = async (scenario = RENEW_HAMPTON_SCENARIO) => {
    const sc = scenario || RENEW_HAMPTON_SCENARIO;
    const prep = prepareRenewScenario({ jobs, scenario: sc });
    let job = prep.job;
    if (job) {
      job = jobsById.get(job.id) || job;
      return { job, fee: prep.fee, created: false, scenario: sc };
    }
    if (typeof createJob !== "function") {
      throw new Error("Couldn't create renew invoice — try again");
    }
    const id = await createJob(prep.fields);
    if (!id) throw new Error("Couldn't create renew invoice");
    if (prep.meta) {
      await patchAndSave(id, {
        ...prep.meta,
        customer: prep.fields.customer,
        personName: prep.fields.personName,
        businessName: prep.fields.businessName,
        serviceAddress: prep.fields.serviceAddress,
        address: prep.fields.address,
        billingAddress: prep.fields.billingAddress,
        invoiceLines: prep.fields.invoiceLines,
        invoiceNo: prep.fields.invoiceNo,
        invoiceDate: prep.fields.invoiceDate,
        phone: prep.fields.phone || "",
        qboCustomerId: prep.fields.qboCustomerId || "",
        _invoiceConfirmed: true,
        openBalance: prep.fee,
        amount: prep.fee,
      });
    }
    job = {
      id,
      ...prep.fields,
      ...prep.meta,
      amount: prep.fields.amount,
      openBalance: prep.fee,
      email: prep.fields.email || sc.realEmail || "",
    };
    return { job, fee: prep.fee, created: true, scenario: sc };
  };

  /**
   * Renew notifications:
   * - email: create invoice + pay link, open compose (edit To + body, then send)
   * Unpaid renew invoices stay on file but do not count as balance due.
   */
  const runRenewNotice = async (mode = "email", scenario = RENEW_HAMPTON_SCENARIO) => {
    if (phaseABusy) return;
    setPhaseABusy(true);
    const sc = scenario || RENEW_HAMPTON_SCENARIO;
    try {
      const { job, fee, created } = await ensureRenewInvoice(sc);
      let payUrl = "";
      try {
        payUrl = await buildPermitRenewPayUrl(job, { fee });
      } catch (e) {
        showToast(String(e?.message || "Couldn't build pay link"));
        return;
      }

      if (mode === "email") {
        const draft = buildPermitRenewEmail({
          scenario: sc,
          fee,
          payUrl,
          invoiceNo: job.invoiceNo || "",
          noticeOnly: false,
        });
        draft.to = String(sc.realEmail || job.email || "").trim();
        setRenewCompose({ draft, payUrl, job, created, scenario: sc, realTest: true });
        return;
      }

      if (typeof window !== "undefined" && payUrl) {
        window.open(payUrl, "_blank", "noopener,noreferrer");
      }
      showToast(
        created
          ? `Invoice #${job.invoiceNo || "—"} created · pay page opened`
          : `Opened invoice #${job.invoiceNo || "—"} pay page`
      );
    } catch (e) {
      showToast(String(e?.message || e || "Renew action failed"));
    } finally {
      setPhaseABusy(false);
    }
  };

  /** Send from compose sheet (after staff edits To / body). */
  const sendRenewCompose = async ({ email, subject, message }) => {
    if (!renewCompose?.draft) return;
    const gate = assertRenewComposeRecipient(email, { realTest: true });
    if (!gate.ok) {
      showToast(gate.error || "Can't send to that address");
      return;
    }
    const to = gate.email;
    setPhaseABusy(true);
    try {
      const { draft, payUrl, job, created } = renewCompose;
      const bodyChanged =
        String(message || "").trim() !== String(draft.body || "").trim();
      const base =
        typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : "https://leelectrical.us";
      const res = await fetch(`${base}/.netlify/functions/customer-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: to,
          to,
          subject: subject || draft.subject,
          message: message || draft.body,
          // If staff rewrote the body, send plain/edited text; else keep branded HTML
          htmlBody: bodyChanged ? "" : draft.htmlBody || "",
          ctaLabel: draft.ctaLabel || "Renew Permit",
          ctaUrl: payUrl || draft.ctaUrl,
        }),
      }).then((r) => r.json().catch(() => ({})));
      if (res?.ok || res?.sent || res?.dryRun) {
        // After send: leave pending-send list until full pay
        if (job?.id) {
          const pr = job.permitRenew || {};
          await patchAndSave(job.id, {
            permitRenew: {
              ...pr,
              noticeSent: true,
              noticeSentAt: new Date().toISOString(),
              emailSentAt: new Date().toISOString(),
              noticeTo: to,
            },
          });
        }
        showToast(
          res?.dryRun
            ? `Queued — invoice #${job?.invoiceNo || "—"} to ${to}`
            : `Email sent to ${to} · invoice #${job?.invoiceNo || "—"}` +
                (created ? " (new)" : "")
        );
        setRenewCompose(null);
      } else {
        showToast(String(res?.error || res?.reason || "Email send failed"));
      }
    } catch (e) {
      showToast(String(e?.message || e || "Email send failed"));
    } finally {
      setPhaseABusy(false);
    }
  };

  /** Quietly drop leftover Levi-Tester draft renews (test phase over). */
  useEffect(() => {
    if (!jobs?.length || typeof patchAndSave !== "function") return;
    const leftovers = (jobs || []).filter((j) => isLeviTesterMockRenewJob(j));
    if (!leftovers.length) return;
    let cancelled = false;
    (async () => {
      for (const j of leftovers) {
        if (cancelled || !j?.id) continue;
        try {
          await patchAndSave(j.id, { _deleted: true });
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // once when jobs first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!jobs?.length]);

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

  const [updatingTodoId, setUpdatingTodoId] = useState(null);

  /** Pull latest Con Ed To-Do List from email insights → job customerTodos. */
  const handleUpdateTodoList = async (job) => {
    if (!job?.id) return;
    setUpdatingTodoId(job.id);
    try {
      const patch = updateTodoListFromInsights(job, emailInsights || []);
      const stamped = {
        ...(patch || {}),
        paperwork: {
          ...(patch?.paperwork || {}),
          coned: {
            ...(patch?.paperwork?.coned || {}),
            // Button flips to "Last Updated" after a successful pass (Levi 2026-08-05).
            todoListUpdatedAt: new Date().toISOString(),
          },
        },
      };
      if (patch) {
        await patchAndSave(job.id, stamped);
        const n = patch.paperwork?.coned?.customerTodos?.length || 0;
        showToast(`To-do list updated · ${n} item${n === 1 ? "" : "s"}`);
      } else {
        // Still stamp "Last Updated" so the button reflects the attempt finished.
        await patchAndSave(job.id, stamped);
        showToast(
          "No To-Do email body in app yet — open the Con Ed To-Do email or wait for daily sync"
        );
      }
    } catch {
      showToast("Couldn't update to-do list");
    } finally {
      setUpdatingTodoId(null);
    }
  };

  /** Con Ed customer to-do checkbox tap (application / certificate / checklist). */
  const handleCustomerTodo = async (todo, job) => {
    if (!job?.id || !todo) return;
    const r = conedTodoTapResult(todo, job);
    if (!r.ok) {
      showToast(r.message);
      if (r.action === "skill_not_built") return;
      if (r.action === "gated") return;
    }
    if (r.action === "create_application") {
      setConedStartJob(job);
      return;
    }
    if (todo.status !== "done" && todo.kind === "application_for_service") {
      setConedStartJob(job);
      return;
    }
    showToast(r.message || "OK");
  };

  /** Tap a due next-step → execute the action for that case type. */
  const handleStepAction = async (step, row, job) => {
    if (!step || !job?.id) {
      if (row?.jobId) open(row.jobId);
      return;
    }
    const action = step.action || step.id;
    // Electrical permit / certificate skill not built yet (Levi 2026-08-04)
    if (
      action === "electrical_permit" ||
      step.id === "electrical_permit" ||
      action === "file_electrical_permit"
    ) {
      const r = conedTodoTapResult({ kind: "electric_certificate", skillReady: false }, job);
      showToast(r.message);
      return;
    }
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
      if (
        action === "coned_submit_electrical_permit" ||
        step.id === "coned_submit_electrical_permit"
      ) {
        // Levi 2026-08-06: DOB issued → Full Detailed PDF → Energy Services upload on open case.
        // Ops skill does the portal work; mark complete when upload is done (or after agent confirms).
        open(job.id);
        showToast(
          "DOB done — download Full Detailed, then upload on Energy Services (city electrical permit)"
        );
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

      // Levi 2026-08-05/06: customer Form A ready → Deploy queues ALL ready uploads.
      // Multi-meter: never queue only the first and call it complete.
      if (item.source === "upload_application") {
        const liveJob = jobsById.get(item.jobId) || job;
        const files =
          item.completedFiles ||
          listReadyConedApplications(liveJob) ||
          listConedCompletedFiles(liveJob) ||
          [];
        const caseNumber = String(
          liveJob?.paperwork?.coned?.caseNumber || item.caseNumber || ""
        ).trim();
        const r = await queueAllReadyConedUploads({
          job: liveJob,
          caseNumber,
          enqueue,
          onSave: (p) => patchAndSave(item.jobId, p),
        });
        // Mark every open upload to-do as queued (batch), not done.
        const todos = listPaperworkTodos(liveJob).filter(
          (t) =>
            t &&
            (t.kind === "upload_application" ||
              t.kind === "upload_document" ||
              /upload application/i.test(String(t.title || ""))) &&
            t.status !== "done" &&
            t.status !== "removed"
        );
        if (!todos.length && files[0]) {
          const { patch } = addPaperworkTodoPatch(liveJob, {
            kind: "upload_application",
            agency: "coned",
            meterLabel: files[0].meterLabel || "",
            title: "Upload application to the Con Ed case",
            note:
              files.length > 1
                ? `FILE READY — ${files.length} applications (batch)`
                : "FILE READY — " + (files[0].name || files[0].filename || "Form A"),
            source: "customer",
          });
          if (patch) await patchAndSave(item.jobId, patch);
        } else if (r.queued) {
          for (const t of todos) {
            const p = updatePaperworkTodoPatch(liveJob, t.id, "queued", {
              firedAt: new Date().toISOString(),
              caseNumber,
              batchTotal: r.total || files.length,
              error: "",
            });
            if (p) await patchAndSave(item.jobId, p);
          }
        }
        showToast(
          r.queued
            ? r.message ||
                (caseNumber
                  ? `Deploying ${r.count || files.length} upload(s) to ${caseNumber}…`
                  : `Deploying ${r.count || files.length} Form A upload(s)…`)
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
      // Levi 2026-08-05: keep the green Deploy battery filling (not a flash).
      // Fleet rows keep Deploying via queueItemIsDeploying; local flag holds ≥12s.
      const holdMs = item.source === "fleet" ? 1200 : 12000;
      setTimeout(() => {
        setDeployingIds((m) => {
          const next = { ...m };
          delete next[item.id];
          return next;
        });
      }, holdMs);
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
  // Levi 2026-08-05/06: clear count of applications ready to upload (+ expected batch).
  const appsReadyTotal = useMemo(() => {
    let n = 0;
    for (const j of jobs || []) n += countReadyConedApplications(j);
    return n;
  }, [jobs]);

  return (
    <div className="pb-24" data-testid="permits-tab">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
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

      {/* Renewal Notifications — ready addresses · Send Email · paid→update permit */}
      <RenewalNotificationsCard
        jobs={jobs}
        phaseABusy={phaseABusy}
        onSendForRow={(row) => {
          if (!row) return;
          const sc =
            row.scenario ||
            (row.scenarioId === "schenectady-hackner" ||
            (row.address && /Schenectady/i.test(row.address))
              ? RENEW_HACKNER_SCENARIO
              : RENEW_HAMPTON_SCENARIO);
          void runRenewNotice("email", sc);
        }}
        onOpenJob={(id) => id && nav(`/job/${id}?doc=invoice&create=1`)}
      />
      {renewCompose?.draft ? (
        <RenewEmailComposeSheet
          draft={renewCompose.draft}
          saving={phaseABusy}
          onClose={() => !phaseABusy && setRenewCompose(null)}
          onSend={sendRenewCompose}
        />
      ) : null}

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
              <h2 className="font-semibold text-sm text-slate-900 tracking-wide">
                Deploy queue
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {queueItems.length
                  ? `${queueItems.length} item${queueItems.length === 1 ? "" : "s"}` +
                    (appsReadyTotal > 0
                      ? ` · ${appsReadyTotal} application${appsReadyTotal === 1 ? "" : "s"} ready to queue` +
                        (appsReadyTotal > 1
                          ? " · Deploy submits the full batch (not done after one)"
                          : "")
                      : " · Deploy when Ready")
                  : appsReadyTotal > 0
                    ? `${appsReadyTotal} application${appsReadyTotal === 1 ? "" : "s"} ready to queue — open after sync`
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

      {/* Success strip — collapsible */}
      {recentSuccesses.length ? (
        <CollapsibleSection
          testId="permits-success-strip"
          title={`Cases on record (${recentSuccesses.length})`}
          defaultOpen={false}
        >
          <div className="space-y-2">
            {recentSuccesses.map((row) => (
              <button
                key={row.id}
                type="button"
                className="card w-full text-left px-3.5 py-2.5 border border-emerald-100 bg-emerald-50/40"
                onClick={() => row.jobId && open(row.jobId)}
              >
                <div className="text-[13px] font-semibold text-slate-900">{row.title}</div>
                <div className="text-[11px] text-emerald-900 font-semibold mt-0.5">
                  Case {row.caseNumber} submitted
                </div>
                {row.nextHint ? (
                  <div className="text-[11px] text-slate-500 mt-0.5">{row.nextHint}</div>
                ) : null}
              </button>
            ))}
          </div>
        </CollapsibleSection>
      ) : null}

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

      {/* Open cases — combined cards (Con Ed + DOB + customer to-dos). Skills list is at bottom. */}
      {actionNeeded.length ? (
        <CollapsibleSection
          testId="permit-action-strip"
          title={`Action needed (${actionNeeded.length})`}
          defaultOpen={true}
          autoCollapseMs={30_000}
        >
          <div className="space-y-2">
            {actionNeeded.map((row) => (
              <CaseRow
                key={`an:${row.key}`}
                row={row}
                job={jobsById.get(row.jobId)}
                onOpen={open}
                onMeterApplication={handleMeterApplication}
                onStepAction={handleStepAction}
                onCustomerTodo={handleCustomerTodo}
                onUpdateTodoList={handleUpdateTodoList}
                updatingTodo={updatingTodoId === row.jobId}
                onRenewSchedule={handleRenewSchedule}
              />
            ))}
          </div>
        </CollapsibleSection>
      ) : null}

      {/* Jobs combined (Con Ed + DOB on one card when idle) — collapsible, start collapsed. */}
      {(() => {
        const jobGroups = groupCasesByJob(sections);
        if (!jobGroups.length) return null;
        return (
          <CollapsibleSection
            testId="permit-section-jobs"
            title={`Jobs (${jobGroups.length})`}
            defaultOpen={false}
            autoCollapseMs={30_000}
          >
            <div className="space-y-2" data-testid="permit-job-groups">
              {jobGroups.map((g) => (
                <JobPermitGroupCard
                  key={String(g.jobId || g.jobName)}
                  group={g}
                  jobsById={jobsById}
                  onOpen={open}
                  onMeterApplication={handleMeterApplication}
                  onStepAction={handleStepAction}
                  onCustomerTodo={handleCustomerTodo}
                  onUpdateTodoList={handleUpdateTodoList}
                  updatingTodoId={updatingTodoId}
                  onRenewSchedule={handleRenewSchedule}
                />
              ))}
            </div>
          </CollapsibleSection>
        );
      })()}

      {/* Empty agency labels still listed for empty tenants */}
      {sections.every((s) => !(s.cases || []).length) && sections.length ? (
        <div className="card px-4 py-6 text-center text-sm text-slate-400 mb-4">
          No open Con Edison or DOB cases yet.
        </div>
      ) : null}

      {!hasAny && !sections.length && !queueItems.length ? (
        <div className="card px-4 py-10 text-center text-sm text-slate-400">
          <span className="block text-3xl mb-2">📄</span>
          No permit cases yet.
          <br />
          Start a case from a job&apos;s Paperwork — it lands in the Deploy queue here.
        </div>
      ) : null}

      {/* Skills list — bottom only, collapsible (Levi 2026-08-04 / 2026-08-05) */}
      <CollapsibleSection
        testId="permits-skills-bottom"
        title="Skills & lock-in checklist"
        defaultOpen={false}
      >
        <div className="mb-4">
          <FunctionalitiesLockIn />
        </div>
      </CollapsibleSection>

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
            <div className="font-semibold text-slate-900 text-base">Need an application first</div>
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
