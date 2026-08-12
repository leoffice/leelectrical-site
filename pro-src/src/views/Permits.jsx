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

import React, {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { emailSendHeaders } from "../lib/emailSendAuth.js";
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
  buildDeployHistoryItems,
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
  READY_RENEW_SCENARIOS,
  assertRenewComposeRecipient,
  buildPermitRenewEmail,
  buildPermitRenewPayUrl,
  buildRenewNoticeCtaUrl,
  buildRenewNoticeSentPatch,
  canSendRenewNotice,
  formatPermitDateMdY,
  isLeviTesterMockRenewJob,
  isPermitRenewJob,
  isRealCityPermitNo,
  listPendingRenewCards,
  materializeRenewInvoicePatch,
  prepareRenewNotice,
  prepareRenewScenario,
  renewFeeFromScenario,
  renewScenarioById,
  buildPermitRenewDeployStartPatch,
  buildPermitRenewDeployPayload,
} from "../lib/permitRenewal.js";
import {
  ensurePermitCacheSeeded,
  formatSendHistoryWhen,
  listRenewSendHistory,
} from "../lib/permitCache.js";
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
 * Pending send notices only. Paid renews live only on Deploy queue (Levi 2026-08-11).
 * Expand is pure state toggle (snappy — no network on open).
 */
function RenewalNotificationsCard({
  jobs,
  phaseABusy,
  onSendForRow,
  onOpenJob,
  onResendFromHistory,
  historyTick = 0,
}) {
  const pending = useMemo(() => listPendingRenewCards(jobs), [jobs, historyTick]);
  const sendHistory = useMemo(
    () => listRenewSendHistory(jobs),
    [jobs, historyTick]
  );
  // Collapsed by default (Levi 2026-08-11) — open for pending send list.
  const [sectionOpen, setSectionOpen] = useState(false);
  // History collapsed with the section
  const [historyOpen, setHistoryOpen] = useState(false);
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
              className="font-bold text-[16px] text-violet-950 tracking-tight"
              data-testid="renewal-notifications-title"
            >
              Renewal Application
            </h2>
            <p className="text-[13px] text-violet-800/80 mt-0.5 leading-relaxed">
              Collapsed by default · open for pending send · paid renews are on Deploy queue only
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
                const sendGate = canSendRenewNotice(r.scenario || r);
                const canSend = sendGate.ok;
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
                        {r.businessName && r.businessName !== r.customer ? (
                          <span className="font-normal text-slate-500">
                            {" "}
                            · {r.businessName}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {isRealCityPermitNo(r.permitNo) ? (
                          <span
                            className="inline-flex items-center rounded-full bg-violet-100 text-violet-900 text-[10px] font-bold px-1.5 py-0.5"
                            data-testid="permit-renew-permit-no"
                          >
                            {r.permitNo}
                          </span>
                        ) : (
                          <span
                            className="text-[10px] text-amber-800 font-bold bg-amber-50 rounded-full px-1.5 py-0.5"
                            data-testid="permit-renew-needs-dob"
                          >
                            Needs DOB permit #
                          </span>
                        )}
                        {expLabel ? (
                          <span
                            className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold px-1.5 py-0.5"
                            data-testid="permit-renew-exp"
                          >
                            Exp {expLabel}
                          </span>
                        ) : null}
                        {r.stageLabel ? (
                          <span
                            className="inline-flex items-center rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold px-1.5 py-0.5"
                            data-testid="permit-renew-status"
                          >
                            {r.stageLabel}
                          </span>
                        ) : null}
                        {r.fee != null ? (
                          <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold px-1.5 py-0.5">
                            ${r.fee}
                          </span>
                        ) : null}
                      </div>
                    </button>
                    <div className="px-2.5 pb-2 flex gap-1.5">
                      <button
                        type="button"
                        className="btn flex-1 bg-violet-700 text-white !py-1.5 text-[11px] font-bold rounded-lg disabled:opacity-50"
                        disabled={phaseABusy || !canSend}
                        title={canSend ? "Send renew notice" : sendGate.reason}
                        data-testid="permit-renew-row-send"
                        onClick={() => onSendForRow?.(r)}
                      >
                        {canSend ? "Send Email" : "Need permit #"}
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

          {/* Send history — every notice send, last + prior (Levi 2026-08-10) */}
          <div
            className="border-t border-violet-100 mx-0"
            data-testid="permit-renew-send-history"
          >
            <button
              type="button"
              className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left"
              onClick={() => setHistoryOpen((o) => !o)}
              aria-expanded={historyOpen}
              data-testid="permit-renew-history-toggle"
            >
              <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wide">
                Send history
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-violet-800">
                  {sendHistory.length}
                </span>
                <span
                  className={`text-violet-400 text-sm leading-none ${
                    historyOpen ? "rotate-90" : ""
                  }`}
                >
                  ›
                </span>
              </span>
            </button>
            {historyOpen ? (
              <ul className="px-2.5 pb-2.5 space-y-1.5 max-h-48 overflow-y-auto">
                {!sendHistory.length ? (
                  <li className="text-[11px] text-slate-500 text-center py-2">
                    No notices sent yet
                  </li>
                ) : (
                  sendHistory.map((h) => (
                    <li
                      key={h.id}
                      className="rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5 text-[11px]"
                      data-testid="permit-renew-history-row"
                    >
                      <div className="font-bold text-slate-900 truncate">
                        {h.address || "—"}
                        {h.permitNo ? (
                          <span className="font-semibold text-violet-800">
                            {" "}
                            · {h.permitNo}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-slate-600 truncate">
                        {h.customer || "—"}
                        {h.to ? ` · ${h.to}` : ""}
                      </div>
                      <div className="text-slate-500 mt-0.5 flex flex-wrap gap-x-2 items-center">
                        <span>{formatSendHistoryWhen(h.at)}</span>
                        {h.placeholderInvoiceNo ? (
                          <span className="font-semibold text-slate-700">
                            Ref {h.placeholderInvoiceNo}
                            {!h.invoiceMaterialized ? " (placeholder)" : ""}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className="ml-auto text-[11px] font-bold text-violet-800 underline"
                          disabled={phaseABusy}
                          data-testid="permit-renew-history-resend"
                          onClick={() => onResendFromHistory?.(h)}
                        >
                          Resend
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
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
const JobPermitGroupCard = memo(function JobPermitGroupCard({
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
});

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

const CaseRow = memo(function CaseRow({
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
});

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
const DeployQueueRow = memo(function DeployQueueRow({
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
  onReportDeploy,
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

  // Battery charge while Deploying. Renew uses honest desk labels (not fake
  // Opening/Uploading) — real progress is host-acked (Levi 2026-08-11).
  const [deployPct, setDeployPct] = useState(0);
  const [deployPhaseLabel, setDeployPhaseLabel] = useState("Deploying now");
  const isRenewDeploy =
    item.source === "permit_renew" || item.kind === "Renew Permit";
  // Prefer real host step text when Israel/host stamps deployLiveStep (Levi 2026-08-11).
  const liveStep = String(item.deployLiveStep || item.job?.permitRenew?.deployLiveStep || "").trim();
  useEffect(() => {
    if (!isDeploying) {
      setDeployPct(0);
      setDeployPhaseLabel("Deploying now");
      return undefined;
    }
    if (liveStep) {
      setDeployPhaseLabel(liveStep.slice(0, 48));
      setDeployPct((p) => Math.max(p, item.hostAcked ? 70 : 40));
      return undefined;
    }
    setDeployPct((p) => (p > 0 ? p : 6));
    setDeployPhaseLabel(isRenewDeploy ? "Sent to desk…" : "Deploying now");
    // Renew: honest wait labels only. Con Ed/fleet: soft progress fill.
    const phases = isRenewDeploy
      ? [
          [12, "Sent to desk…"],
          [28, "Waiting for Israel…"],
          [48, "Israel starting…"],
          [68, "On DOB NOW…"],
          [88, "Working…"],
          [94, "Almost…"],
        ]
      : [
          [12, "Deploying now"],
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
        // Renew caps at 55% until host confirms (item.hostAcked) so we never look
        // "almost done" when nothing actually started.
        const cap = isRenewDeploy && !item.hostAcked ? 55 : 94;
        const step = prev < 30 ? 5 : prev < 55 ? 3 : prev < 80 ? 2 : 1;
        const next = Math.min(cap, prev + step);
        while (i < phases.length && next >= phases[i][0]) {
          setDeployPhaseLabel(phases[i][1]);
          i += 1;
        }
        return next;
      });
    }, 700);
    return () => clearInterval(t);
  }, [isDeploying, item.id, isRenewDeploy, item.hostAcked, liveStep]);

  let statusLabel = status || "pending";
  let statusTone = "bg-slate-100 text-slate-700";
  if (isDeploying && item.source !== "fleet") {
    statusLabel = "Deploying now";
    statusTone = "bg-amber-100 text-amber-900";
  } else if (item.deployError) {
    statusLabel = "Failed";
    statusTone = "bg-red-100 text-red-800 border border-red-200";
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
          <div className="text-[15px] font-bold text-slate-900 leading-snug tracking-tight">
            {item.title}
          </div>
          {item.subtitle ? (
            <div className="text-[13px] text-slate-700 mt-0.5 leading-relaxed">{item.subtitle}</div>
          ) : null}
          {item.nextHint && !expanded ? (
            <div
              className="text-[12px] text-slate-700 mt-1 font-semibold"
              data-testid="permits-queue-next-hint"
            >
              Next: {item.nextHint}
            </div>
          ) : null}
          {needsInfo && !expanded ? (
            <div
              className="text-[11px] text-amber-900 font-semibold mt-1"
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
          ) : null}
          {/* Always show full facts on expand (Levi 2026-08-11 — no more guessing) */}
          {item.subtitle ||
          reviewBits.length ||
          item.customer ||
          item.permitNo ||
          item.invoiceNo ||
          item.detailLines?.length ||
          item.whatDeployDoes ||
          item.nextHint ||
          item.filesCount != null ||
          item.filesWhere ? (
            <ul
              className="text-[14px] text-slate-800 space-y-1.5 leading-relaxed"
              data-testid="permits-queue-facts"
            >
              {item.detailLines?.length
                ? item.detailLines.map((b) => (
                    <li key={b}>· {b}</li>
                  ))
                : null}
              {!item.detailLines?.length && item.subtitle
                ? String(item.subtitle)
                    .split(" · ")
                    .filter(Boolean)
                    .map((b) => (
                      <li key={b}>· {b}</li>
                    ))
                : null}
              {reviewBits
                .filter((b) => !String(item.subtitle || "").includes(b))
                .map((b) => (
                  <li key={`r-${b}`}>· {b}</li>
                ))}
              {item.permitNo && !String(item.subtitle || "").includes(item.permitNo) ? (
                <li>· Permit {item.permitNo}</li>
              ) : null}
              {item.invoiceNo && !String(item.subtitle || "").includes(item.invoiceNo) ? (
                <li>· Inv {item.invoiceNo}</li>
              ) : null}
              {item.filesCount != null || item.appsReady != null || item.appsExpected != null ? (
                <li className="font-semibold text-slate-900">
                  · Files:{" "}
                  {item.filesCount != null
                    ? `${item.filesCount} ready`
                    : `${item.appsReady || 0} ready`}
                  {item.appsExpected != null && item.appsExpected > 0
                    ? ` · ${item.appsUploaded || 0} uploaded · ${item.appsExpected} expected`
                    : ""}
                </li>
              ) : null}
              {item.filesWhere ? <li>· Where: {item.filesWhere}</li> : null}
              {item.nextHint ? (
                <li className="font-semibold text-slate-900">· Next: {item.nextHint}</li>
              ) : null}
              {item.whatDeployDoes ? (
                <li className="text-slate-800">
                  · When you press Deploy: {item.whatDeployDoes}
                </li>
              ) : null}
            </ul>
          ) : !missing.length ? (
            <p className="text-[14px] text-slate-600 leading-relaxed">
              No application details yet — Edit to fill.
            </p>
          ) : null}
          {/* Fail stays on this row — never history until OK (Levi 2026-08-11) */}
          {item.deployError ? (
            <div
              className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-3 space-y-2.5"
              data-testid="permits-queue-deploy-error"
            >
              <div className="text-[12px] font-extrabold text-red-900 uppercase tracking-wide">
                Deploy issue — still in queue
              </div>
              <p className="text-[14px] text-red-950 leading-relaxed whitespace-pre-wrap font-medium">
                {item.deployError}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn bg-emerald-700 text-white !py-2 !px-3.5 text-[13px] font-extrabold"
                  data-testid="permits-queue-try-again"
                  onClick={() => onDeploy(item)}
                >
                  Try again
                </button>
                <button
                  type="button"
                  className="btn bg-white border border-red-300 text-red-900 !py-2 !px-3.5 text-[13px] font-bold"
                  data-testid="permits-queue-report-dev"
                  onClick={() => onReportDeploy?.(item)}
                >
                  Report to developer
                </button>
              </div>
            </div>
          ) : null}
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
});

export default function Permits() {
  const { jobs, emailInsights, events, patchAndSave, showToast, enqueue, createJob, whenJobSaved, api } =
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
  // Paid renews auto-open the queue once (see effect below) so they are not missed
  // when Renewal Application stays collapsed (Levi 2026-08-11).
  const [queueOpen, setQueueOpen] = useState(false);
  const paidQueueOpenedRef = React.useRef(false);
  const [historyOpen, setDeployHistoryOpen] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [expandedIds, setExpandedIds] = useState({});
  const [deployingIds, setDeployingIds] = useState({});
  /** Local deploy fail text per row id — stays on queue until success (Levi 2026-08-11). */
  const [rowDeployErrors, setRowDeployErrors] = useState({});
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
        // Poll must not block expand/check taps (Levi snappy — 2026-08-11)
        startTransition(() => {
          setCaseRuns(list);
          setLastSyncedAt(new Date().toISOString());
        });
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

  const queueItems = useMemo(() => {
    const base = buildDeployQueueItems({ jobs, caseRuns });
    return base.map((it) => {
      const localErr = rowDeployErrors[it.id];
      if (!localErr) return it;
      return {
        ...it,
        deployError: localErr,
        status: it.status === "deploying" || it.status === "queued" ? it.status : "failed",
      };
    });
  }, [jobs, caseRuns, rowDeployErrors]);

  // Paid renews live only on Deploy queue (no separate Paid list — Levi 2026-08-11)
  const paidRenewQueueCount = useMemo(
    () =>
      queueItems.filter(
        (it) => it.source === "permit_renew" || it.kind === "Renew Permit"
      ).length,
    [queueItems]
  );

  // Auto-open Deploy queue when a paid renew is ready
  useEffect(() => {
    if (paidQueueOpenedRef.current) return;
    if (paidRenewQueueCount > 0) {
      paidQueueOpenedRef.current = true;
      setQueueOpen(true);
    }
  }, [paidRenewQueueCount]);

  // Deploy history — only successful completes ("OK, successfully sent …")
  const deployHistory = useMemo(
    () => buildDeployHistoryItems({ jobs, caseRuns, limit: 20 }),
    [jobs, caseRuns]
  );
  const recentSuccesses = useMemo(
    () => buildRecentCaseSuccesses({ jobs, caseRuns, limit: 8 }),
    [jobs, caseRuns]
  );
  // Prefer dedicated deploy history; fall back to case successes with same OK wording
  const historyRows = deployHistory.length
    ? deployHistory
    : recentSuccesses.map((r) => ({
        id: r.id,
        jobId: r.jobId,
        okLine:
          r.successLabel ||
          r.okLine ||
          `OK, successfully sent ${r.title || "application"}`,
        subtitle: r.subtitle || r.title || "",
        nextStage: r.nextHint || r.nextStage || "",
      }));

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

  // Stable callbacks so memoized CaseRow / JobPermitGroupCard skip re-render on poll (snappy)
  // Must stay above any early return (Rules of Hooks).
  const [updatingTodoId, setUpdatingTodoId] = useState(null);

  const open = useCallback((jobId) => {
    if (jobId) nav(`/job/${jobId}`);
  }, [nav]);

  const handleRenewSchedule = useCallback(
    (jobId, on) => {
      if (!jobId) return;
      const job = jobsById.get(jobId);
      if (!job) {
        showToast("Job not found for this case");
        return;
      }
      // Fire-and-forget save — toggle must feel instant (Levi 2026-08-11)
      showToast(
        on
          ? "Yearly renew on — same flag on the job Paperwork panel"
          : "Yearly renew off"
      );
      void patchAndSave(jobId, renewSchedulePatch(job, { on, agency: "dob" })).catch(() => {
        showToast("Could not save renew schedule — try again");
      });
    },
    [jobsById, patchAndSave, showToast]
  );

  const handleMeterApplication = useCallback(
    (jobId, value) => {
      if (!jobId || !value) return;
      const job = jobsById.get(jobId);
      if (!job) {
        showToast("Job not found for this case");
        return;
      }
      // Toast + fire-and-forget — never block the box tap (Levi snappy)
      const patch = jobPatchMeterApplication(job, value);
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
          (patch.paperwork?.coned?.meterApplication?.label ||
            meterApplicationLabel(value) ||
            value) +
          queued
      );
      void patchAndSave(jobId, patch).catch(() => {
        showToast("Couldn't save meter application");
      });
    },
    [jobsById, patchAndSave, showToast]
  );

  const handleUpdateTodoList = useCallback(
    async (job) => {
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
              todoListUpdatedAt: new Date().toISOString(),
            },
          },
        };
        if (patch) {
          await patchAndSave(job.id, stamped);
          const n = patch.paperwork?.coned?.customerTodos?.length || 0;
          showToast(`To-do list updated · ${n} item${n === 1 ? "" : "s"}`);
        } else {
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
    },
    [emailInsights, patchAndSave, showToast]
  );

  const handleCustomerTodo = useCallback(
    (todo, job) => {
      if (!job?.id || !todo) return;
      const r = conedTodoTapResult(todo, job);
      if (!r.ok) {
        // Dead connector: electrical permit skill not built yet — open job so staff can file from Paperwork.
        if (r.action === "skill_not_built") {
          showToast(r.message + " — opening job");
          if (job?.id) open(job.id);
          return;
        }
        showToast(r.message);
        if (r.action === "gated") return;
        return;
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
    },
    [showToast, open]
  );

  /**
   * Create/reuse a renew job row.
   * noticeOnly=true → placeholder # only (no real invoice).
   * noticeOnly=false → real invoice for staff pay preview.
   */
  const ensureRenewJob = async (
    scenario = RENEW_HAMPTON_SCENARIO,
    { noticeOnly = true } = {}
  ) => {
    const sc = scenario || RENEW_HAMPTON_SCENARIO;
    const prep = noticeOnly
      ? prepareRenewNotice({ jobs, scenario: sc })
      : prepareRenewScenario({ jobs, scenario: sc, noticeOnly: false });
    let job = prep.job;
    if (job) {
      job = jobsById.get(job.id) || job;
      // Reuse notice-only; if staff needs a real invoice and it isn't materialized yet, materialize below
      const pr = job.permitRenew || {};
      if (
        !noticeOnly &&
        !pr.invoiceMaterialized &&
        (pr.noticeOnly || pr.placeholderInvoiceNo)
      ) {
        const mat = materializeRenewInvoicePatch(job, { fee: prep.fee });
        await patchAndSave(job.id, mat);
        job = { ...job, ...mat, permitRenew: mat.permitRenew };
        return {
          job,
          fee: prep.fee,
          created: false,
          scenario: sc,
          noticeOnly: false,
          placeholderInvoiceNo: mat.invoiceNo || pr.placeholderInvoiceNo || "",
        };
      }
      return {
        job,
        fee: prep.fee,
        created: false,
        scenario: sc,
        noticeOnly: !!(pr.noticeOnly || !pr.invoiceMaterialized),
        placeholderInvoiceNo:
          pr.placeholderInvoiceNo || prep.placeholderInvoiceNo || job.invoiceNo || "",
      };
    }
    if (typeof createJob !== "function") {
      throw new Error("Couldn't create renew notice — try again");
    }
    const id = await createJob(prep.fields);
    if (!id) throw new Error("Couldn't create renew notice");
    if (typeof whenJobSaved === "function") await whenJobSaved(id);
    if (prep.meta) {
      await patchAndSave(id, {
        ...prep.meta,
        customer: prep.fields.customer,
        personName: prep.fields.personName,
        businessName: prep.fields.businessName,
        serviceAddress: prep.fields.serviceAddress,
        address: prep.fields.address,
        billingAddress: prep.fields.billingAddress,
        invoiceLines: prep.fields.invoiceLines || [],
        invoiceNo: prep.fields.invoiceNo || "",
        invoiceDate: prep.fields.invoiceDate || "",
        phone: prep.fields.phone || "",
        qboCustomerId: prep.fields.qboCustomerId || "",
        _invoiceConfirmed: !!prep.fields._invoiceConfirmed,
        openBalance: noticeOnly ? 0 : prep.fee,
        amount: noticeOnly ? 0 : prep.fee,
      });
    }
    job = {
      id,
      ...prep.fields,
      ...prep.meta,
      amount: noticeOnly ? 0 : prep.fee,
      openBalance: noticeOnly ? 0 : prep.fee,
      email: prep.fields.email || sc.realEmail || "",
    };
    return {
      job,
      fee: prep.fee,
      created: true,
      scenario: sc,
      noticeOnly: !!noticeOnly,
      placeholderInvoiceNo: prep.placeholderInvoiceNo || "",
    };
  };

  /** @deprecated name — staff real-invoice path */
  const ensureRenewInvoice = (scenario) =>
    ensureRenewJob(scenario, { noticeOnly: false });

  /**
   * Renew notifications (Levi 2026-08-10):
   * - email: notice-only job + reserved placeholder — NO real invoice.
   *   CTA generates invoice when customer taps Renew.
   * - pay: materialize real invoice (staff preview).
   */
  const [historyTick, setHistoryTick] = useState(0);

  useEffect(() => {
    try {
      ensurePermitCacheSeeded(READY_RENEW_SCENARIOS);
    } catch {
      /* ignore */
    }
    // Backend cash file: BLZ Electric Inc / Permits / Completed
    let cancelled = false;
    (async () => {
      try {
        if (typeof api?.listCompletedPermits !== "function") return;
        const cat = await api.listCompletedPermits();
        if (cancelled || !cat?.cacheEntries?.length) return;
        const { upsertPermitCacheEntries } = await import("../lib/permitCache.js");
        upsertPermitCacheEntries(cat.cacheEntries);
      } catch {
        /* offline */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const runRenewNotice = async (
    mode = "email",
    scenario = RENEW_HAMPTON_SCENARIO,
    { defaultTo = "", resend = false } = {}
  ) => {
    if (phaseABusy) return;
    const sc = scenario || RENEW_HAMPTON_SCENARIO;
    // Cache-first: no notice email without a real city permit # (Levi 2026-08-10)
    if (mode === "email") {
      const gate = canSendRenewNotice(sc);
      if (!gate.ok) {
        showToast(gate.reason || "Need real DOB permit # in the cache first");
        return;
      }
    }
    setPhaseABusy(true);
    try {
      // Notice email path: notice-only job + placeholder (not a real invoice)
      if (mode === "email") {
        const {
          job,
          fee,
          created,
          placeholderInvoiceNo,
        } = await ensureRenewJob(sc, { noticeOnly: true });
        const origin =
          typeof window !== "undefined" && window.location?.origin
            ? window.location.origin
            : "https://leelectrical.us";
        const refNo =
          placeholderInvoiceNo ||
          job?.permitRenew?.placeholderInvoiceNo ||
          "";
        const payUrl = buildRenewNoticeCtaUrl({
          scenarioId: sc.id,
          invoiceNo: refNo,
          origin,
        });
        const draft = buildPermitRenewEmail({
          scenario: sc,
          fee,
          payUrl,
          invoiceNo: refNo,
          noticeOnly: true,
        });
        // Resend / compose: prefer on-file customer email, not last one-off (Levi)
        draft.to = String(
          defaultTo || sc.realEmail || job?.email || ""
        ).trim();
        setRenewCompose({
          draft,
          payUrl,
          job,
          created,
          scenario: sc,
          realTest: true,
          noticeOnly: true,
          placeholderInvoiceNo: refNo,
          resend: !!resend,
        });
        return;
      }

      // Staff "open pay page" — materialize real invoice
      const { job, fee: invFee, created } = await ensureRenewInvoice(sc);
      let payUrl = "";
      try {
        payUrl = await buildPermitRenewPayUrl(job, { fee: invFee });
      } catch (e) {
        showToast(String(e?.message || "Couldn't build pay link"));
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
      const {
        draft,
        payUrl,
        job,
        created,
        scenario: sc,
        noticeOnly,
        placeholderInvoiceNo,
      } = renewCompose;
      const bodyChanged =
        String(message || "").trim() !== String(draft.body || "").trim();
      const base =
        typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : "https://leelectrical.us";
      const res = await fetch(`${base}/.netlify/functions/customer-email`, {
        method: "POST",
        headers: await emailSendHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          email: to,
          to,
          subject: subject || draft.subject,
          message: message || draft.body,
          htmlBody: bodyChanged ? "" : draft.htmlBody || "",
          ctaLabel: draft.ctaLabel || "Renew Permit",
          ctaUrl: payUrl || draft.ctaUrl,
        }),
      }).then((r) => r.json().catch(() => ({})));
      if (res?.ok || res?.sent || res?.dryRun) {
        const refNo =
          placeholderInvoiceNo ||
          job?.permitRenew?.placeholderInvoiceNo ||
          "";
        if (job?.id) {
          const patch = buildRenewNoticeSentPatch(job, {
            to,
            subject: subject || draft.subject || "",
            placeholderInvoiceNo: refNo,
          });
          await patchAndSave(job.id, patch);
        }
        setHistoryTick((n) => n + 1);
        showToast(
          res?.dryRun
            ? `Queued — notice to ${to}` + (refNo ? ` · ref ${refNo}` : "")
            : `Email sent to ${to}` +
                (refNo ? ` · ref ${refNo}` : "") +
                (noticeOnly
                  ? " (invoice opens when they tap Renew)"
                  : created
                    ? " (new inv)"
                    : "")
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

  /**
   * Quietly drop leftover Levi-Tester mocks + phantom $365 renew invoices
   * that had no real DOB permit # / resurrected after delete (Levi 2026-08-10).
   * Never touch paid renews / any money on the invoice — that hid LE-2702 from
   * Deploy after the customer paid (cleanup deleted before pay, pay kept _deleted).
   */
  useEffect(() => {
    if (!jobs?.length || typeof patchAndSave !== "function") return;
    const leftovers = (jobs || []).filter((j) => {
      if (!j || j._deleted || j.paid) return false;
      const pr = j.permitRenew || j.permitRenewMock || {};
      // Money / Deploy queue signals — never soft-delete
      if (pr.paid || pr.nextStep === "update_permit" || pr.queueUpdatePermit || pr.deployUpdate) {
        return false;
      }
      const pays = Array.isArray(j.payments) ? j.payments : [];
      if (pays.some((p) => Number(String(p?.amount ?? "").replace(/[^0-9.-]/g, "")) > 0.009)) {
        return false;
      }
      if (isLeviTesterMockRenewJob(j)) return true;
      if (!isPermitRenewJob(j)) return false;
      const permit = String(pr.permitNo || "").trim();
      // Fake permit (company name) — never a real books invoice
      if (permit && !isRealCityPermitNo(permit)) return true;
      // Notice-only row that incorrectly still has a confirmed open invoice
      if (
        (pr.noticeOnly || pr.placeholderInvoiceNo) &&
        !pr.invoiceMaterialized &&
        j.invoiceNo &&
        j._invoiceConfirmed
      ) {
        return true;
      }
      return false;
    });
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

  /**
   * Heal overlay: if a paid renew is still flagged _deleted in state (pay after
   * mock cleanup), clear delete so future devices/sync keep it on Deploy.
   * mergeJobs already shows it live; this writes the fix back.
   */
  useEffect(() => {
    if (!jobs?.length || typeof patchAndSave !== "function") return;
    const needHeal = (jobs || []).filter((j) => {
      if (!j?.id) return false;
      const pr = j.permitRenew || j.permitRenewMock || {};
      const paidRenew =
        !!(j.paid || pr.paid || pr.nextStep === "update_permit" || pr.queueUpdatePermit);
      // merge may have cleared _deleted on the in-memory row; heal when stamp missing
      if (!paidRenew || !isPermitRenewJob(j)) return false;
      // Only re-write when Deploy flags incomplete (queueUpdate/deployUpdate missing)
      // or job still looks deleted from a stale merge path.
      return (
        !!j._deleted ||
        (paidRenew && !pr.queueUpdatePermit && !pr.deployUpdate && (j.paid || pr.paid))
      );
    });
    if (!needHeal.length) return;
    let cancelled = false;
    (async () => {
      for (const j of needHeal) {
        if (cancelled || !j?.id) continue;
        try {
          const pr = j.permitRenew || j.permitRenewMock || {};
          await patchAndSave(j.id, {
            _deleted: false,
            _archived: false,
            deletedAt: "",
            paid: true,
            openBalance: 0,
            permitRenew: {
              ...pr,
              paid: true,
              nextStep: pr.nextStep || "update_permit",
              queueUpdatePermit: true,
              deployUpdate: true,
              dismissed: false,
            },
          });
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!jobs?.length]);

  /** Tap a due next-step → execute the action for that case type. */
  const handleStepAction = useCallback((step, row, job) => {
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
    // Async work after toast — never block the tap (Levi 2026-08-11 snappy boxes)
    const run = async () => {
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
          showToast("PLP meter application queued — open Deploy when ready");
          await patchAndSave(job.id, withPlp);
          return;
        }
        void handleMeterApplication(job.id, "new_meter");
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
    void run();
  }, [open, handleMeterApplication, patchAndSave, showToast]);

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

  /** Deploy failed → report to Israel (same bus as paperwork fails). */
  const reportDeployIssue = async (item) => {
    if (!item) return;
    const err =
      item.deployError ||
      rowDeployErrors[item.id] ||
      item.error ||
      `Deploy queue issue · ${item.kind || item.title || "row"} · ${item.serviceAddress || ""}`;
    if (!enqueue) {
      showToast("Could not reach developers — try again later");
      return;
    }
    try {
      const { reportPaperworkFailOnce } = await import("../lib/paperworkFailReport.js");
      const rep = await reportPaperworkFailOnce(
        {
          kind: "deploy_queue",
          error: String(err).slice(0, 500),
          jobId: item.jobId || item.job?.id || "",
          paperworkJobId: item.run?.id || item.id || "",
          customer: item.job?.customer || item.card?.customer || "",
          address: item.serviceAddress || item.job?.serviceAddress || "",
          requestType: item.kind || item.title || "",
          phase: "permits_deploy_report",
          force: true,
          extra: item.subtitle || "",
        },
        enqueue
      );
      showToast(rep?.queued || rep?.ok ? "Reported to developers" : "Report sent");
    } catch {
      showToast("Report failed — try again");
    }
  };

  /** Stamp fail on the same queue row (never history). Expand so Levi sees it. */
  const markDeployRowFailed = (item, errMsg) => {
    if (!item?.id) return;
    const msg = String(errMsg || "Deploy failed").slice(0, 600);
    setRowDeployErrors((m) => ({ ...m, [item.id]: msg }));
    setExpandedIds((m) => ({ ...m, [item.id]: true }));
    setQueueOpen(true);
    showToast("Deploy issue — see the row for details");
  };

  const clearDeployRowError = (itemId) => {
    if (!itemId) return;
    setRowDeployErrors((m) => {
      if (!m[itemId]) return m;
      const next = { ...m };
      delete next[itemId];
      return next;
    });
  };

  /** Green Deploy on a queue row — fire skill; button shows Deploying now */
  const deployQueueItem = async (item) => {
    if (!item?.id || deployingIds[item.id]) return;
    if (item.source === "fleet" && item.status === "awaiting_approval") {
      setApprovalJob(item.run);
      return;
    }
    // Fleet failed → Try again re-queues from job payload when possible
    if (
      item.source === "fleet" &&
      (String(item.status || "").toLowerCase() === "failed" ||
        String(item.status || "").toLowerCase() === "rejected" ||
        item.deployError)
    ) {
      const job = jobsById.get(item.jobId) || item.job;
      clearDeployRowError(item.id);
      setDeployingIds((m) => ({ ...m, [item.id]: true }));
      setQueueOpen(true);
      setExpandedIds((m) => ({ ...m, [item.id]: true }));
      try {
        const type = String(item.run?.type || item.kind || "").toLowerCase();
        if (type.includes("permit_renew") || item.kind === "Renew Permit") {
          // Fall through via synthetic renew item
          const card = {
            jobId: item.jobId,
            address: item.serviceAddress,
            customer: job?.customer,
            permitNo: item.run?.payload?.permitNo || job?.permitRenew?.permitNo,
          };
          const renewItem = {
            ...item,
            id: `permit-renew:${item.jobId}`,
            source: "permit_renew",
            kind: "Renew Permit",
            status: "ready",
            deployError: "",
          };
          void deployQueueItem({ ...renewItem, ...card, jobId: item.jobId, job });
          return;
        }
        if (job && (type.includes("create") || type === "new_case" || !type)) {
          const answers =
            item.run?.payload?.answers ||
            job?.paperwork?.coned?.createCase?.answers ||
            {};
          const r = await createCasePaperworkJob({
            answers,
            job,
            onSave: (p) => patchAndSave(item.jobId, p),
          });
          if (r.ok) {
            showToast("Deploying now — stops at review for your confirm");
            await refreshRuns();
          } else {
            markDeployRowFailed(item, r.error || "Could not re-queue deploy");
          }
        } else {
          markDeployRowFailed(
            item,
            item.deployError ||
              "This fleet row failed. Open the job and Deploy again from the matching draft, or Report to developer."
          );
        }
      } catch (e) {
        markDeployRowFailed(item, e?.message || "Try again failed");
      } finally {
        setTimeout(() => {
          setDeployingIds((m) => {
            const next = { ...m };
            delete next[item.id];
            return next;
          });
        }, 1500);
      }
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
    clearDeployRowError(item.id);
    setDeployingIds((m) => ({ ...m, [item.id]: true }));
    setQueueOpen(true);
    try {
      const job = jobsById.get(item.jobId) || item.job;
      if (!job && item.source !== "fleet") {
        markDeployRowFailed(item, "Job not found for this deploy row");
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
          // Submit case → already queued fleet job; queue shows Deploying now until done
          showToast("Deploying now — fills up to Review for your confirm");
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
          if (errMsg === "questionnaire_incomplete") {
            showToast("Fill the application first — tap Edit");
            setExpandedIds((m) => ({ ...m, [item.id]: true }));
          } else {
            markDeployRowFailed(item, errMsg);
            if (enqueue) {
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
              );
            }
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
        if (r.queued) {
          showToast("Deploying now — stops at review for your confirm");
        } else {
          markDeployRowFailed(item, r.error || "Could not queue this deploy");
        }
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
        if (r.queued) {
          showToast(
            r.message ||
              (caseNumber
                ? `Deploying now — ${r.count || files.length} upload(s) to ${caseNumber}`
                : `Deploying now — ${r.count || files.length} Form A upload(s)`)
          );
        } else {
          markDeployRowFailed(item, r.error || "Could not queue Form A upload(s)");
        }
        await refreshRuns();
        return;
      }

      if (item.source === "meter") {
        // Gate: PLP / new meter Deploy needs a completed Form A on the job first.
        if (!jobHasConedFormA(job)) {
          setNeedAppPrompt({ job, item });
          markDeployRowFailed(item, "No application on this job yet — create Form A first");
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
          if (r.queued) {
            showToast("Deploying now — new meter");
          } else {
            markDeployRowFailed(item, r.error || "Could not queue meter deploy");
          }
        } else {
          markDeployRowFailed(item, "Couldn't queue meter deploy");
        }
        await refreshRuns();
        return;
      }

      // Paid renew → queue host command; Israel starts DOB Renew Work Permit
      // (improves with practice — Levi 2026-08-11). Honest feedback: wait host ack;
      // never leave a cute battery running when the desk never picked up.
      if (item.source === "permit_renew" || item.kind === "Renew Permit") {
        const liveJob = jobsById.get(item.jobId) || job;
        if (!liveJob) {
          showToast("Job not found");
          return;
        }
        const payload = buildPermitRenewDeployPayload(liveJob, item);
        if (!payload.address && !payload.permitNo) {
          showToast("Need address or permit # before Deploy");
          setExpandedIds((m) => ({ ...m, [item.id]: true }));
          return;
        }
        const startPatch = buildPermitRenewDeployStartPatch(liveJob);
        await patchAndSave(item.jobId, startPatch);
        const idk = `permit-renew:${item.jobId}:${payload.permitNo || "addr"}`;
        const cmd = await enqueue(
          "permit_renew_update",
          item.jobId,
          payload,
          "judgment",
          idk
        );
        if (!cmd) {
          markDeployRowFailed(
            item,
            "Could not reach the command bus — Try again or Report to developer"
          );
          await patchAndSave(item.jobId, {
            permitRenew: {
              ...(liveJob.permitRenew || liveJob.permitRenewMock || {}),
              deployStatus: "failed",
              deployError: "Command bus unreachable",
              queueUpdatePermit: true,
              nextStep: "update_permit",
            },
          });
          return;
        }
        showToast("Sent to desk — waiting for Israel");
        setDeployingIds((m) => ({ ...m, [item.id]: true }));
        // Poll until host marks done (Israel pinged) or fail/timeout.
        try {
          const { waitForCommandDone } = await import("../lib/commandWait.js");
          const wait = await waitForCommandDone(api, idk, {
            maxMs: 45000,
            intervalMs: 2000,
          });
          if (wait?.ok) {
            showToast("Israel started — opening DOB NOW");
            await patchAndSave(item.jobId, {
              permitRenew: {
                ...(liveJob.permitRenew || liveJob.permitRenewMock || {}),
                deployStatus: "deploying",
                deployHostAckedAt: new Date().toISOString(),
                deployError: "",
                queueUpdatePermit: true,
                nextStep: "update_permit",
              },
            });
          } else if (wait?.cmd?.status === "failed") {
            const err =
              wait.cmd.error ||
              wait.cmd.result ||
              "Host failed to start renew deploy";
            markDeployRowFailed(item, err);
            await patchAndSave(item.jobId, {
              permitRenew: {
                ...(liveJob.permitRenew || liveJob.permitRenewMock || {}),
                deployStatus: "failed",
                deployError: String(err).slice(0, 400),
                queueUpdatePermit: true,
                nextStep: "update_permit",
              },
            });
          } else {
            markDeployRowFailed(
              item,
              "Host did not pick up in time — Try again (or Report to developer)"
            );
            await patchAndSave(item.jobId, {
              permitRenew: {
                ...(liveJob.permitRenew || liveJob.permitRenewMock || {}),
                deployStatus: "failed",
                deployError: "Host did not pick up in time",
                queueUpdatePermit: true,
                nextStep: "update_permit",
              },
            });
          }
        } catch (e) {
          markDeployRowFailed(
            item,
            e?.message || "Could not confirm host pickup — Try again"
          );
        }
        return;
      }

      if (item.source === "fleet") {
        await refreshRuns();
        return;
      }

      markDeployRowFailed(item, "Nothing to deploy on this row");
    } finally {
      // Levi 2026-08-05: keep the green Deploy battery filling (not a flash).
      // Fleet rows keep Deploying via queueItemIsDeploying; local flag holds ≥12s.
      // Renew keeps job.deployStatus=deploying so the row stays Deploying after flag clear.
      const holdMs =
        item.source === "fleet"
          ? 1200
          : item.source === "permit_renew"
            ? 8000
            : 12000;
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

  // Precompute once per board change — expand/collapse must not regroup (snappy)
  const jobGroups = useMemo(() => groupCasesByJob(sections), [sections]);

  const toggleQueueRow = useCallback((id) => {
    setExpandedIds((m) => ({ ...m, [id]: !m[id] }));
  }, []);

  if (!isModuleEnabled(config, "permits")) return null;

  return (
    <div
      className="pb-24 text-[15px] leading-relaxed text-slate-900 antialiased"
      data-testid="permits-tab"
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-[13px] font-bold text-slate-700 tracking-tight">
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

      {/* Renewal Application — pending send notices only; paid → Deploy queue */}
      <RenewalNotificationsCard
        jobs={jobs}
        phaseABusy={phaseABusy}
        historyTick={historyTick}
        onOpenJob={(id) => id && nav(`/job/${id}?doc=invoice&create=1`)}
        onSendForRow={(row) => {
          if (!row) return;
          // Prefer card scenario (Drive cache / ready list); never re-bind 364 Schenectady.
          // No Hampton fallback — a missing scenario must never send another
          // customer's permit content.
          const sc = row.scenario || renewScenarioById(row.scenarioId);
          if (!sc) {
            showToast(
              "This permit isn't in the cache anymore — refresh Permits and try again"
            );
            return;
          }
          void runRenewNotice("email", sc);
        }}
        onResendFromHistory={(h) => {
          if (!h) return;
          const sc = renewScenarioById(h.scenarioId);
          if (!sc) {
            // Scenario aged out of the cache — never prefill Hampton's content.
            showToast(
              `Can't resend — permit ${h.permitNo || h.address || h.scenarioId || ""} is no longer in the cache. Open its pending row to send fresh.`
            );
            return;
          }
          void runRenewNotice("email", sc, {
            // On-file only — never pre-fill last custom To
            defaultTo: sc.realEmail || "",
            resend: true,
          });
        }}
      />
      {renewCompose?.draft ? (
        <RenewEmailComposeSheet
          draft={renewCompose.draft}
          saving={phaseABusy}
          onClose={() => !phaseABusy && setRenewCompose(null)}
          onSend={sendRenewCompose}
        />
      ) : null}

      {/* DEPLOY QUEUE — sticky Deploy/Fix · paid renews only here (Levi 2026-08-11) */}
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
              <h2 className="font-bold text-[16px] text-slate-900 tracking-tight">
                Deploy queue
              </h2>
              <p className="text-[13px] text-slate-600 mt-1 leading-relaxed">
                {queueItems.length
                  ? `${queueItems.length} item${queueItems.length === 1 ? "" : "s"} in queue` +
                    (paidRenewQueueCount > 0
                      ? ` · ${paidRenewQueueCount} paid renew${paidRenewQueueCount === 1 ? "" : "s"} ready to Deploy`
                      : "") +
                    (appsReadyTotal > 0
                      ? ` · ${appsReadyTotal} Form A application${appsReadyTotal === 1 ? "" : "s"} ready` +
                        (appsReadyTotal > 1
                          ? " · Deploy uploads the full batch (not done after one)"
                          : "")
                      : paidRenewQueueCount > 0
                        ? " · press Deploy to start DOB renew"
                        : " · expand a row for files / where / next / what Deploy does")
                  : appsReadyTotal > 0
                    ? `${appsReadyTotal} application${appsReadyTotal === 1 ? "" : "s"} ready to queue — open after sync`
                    : "Nothing to deploy"}
                {queueItems.some((i) => (i.missing || []).length || i.deployError)
                  ? " · amber/red = fix or try again first"
                  : ""}
                {" · only OK success moves to history below"}
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
                    onToggle={toggleQueueRow}
                    onRemove={removeQueueItem}
                    onOpen={onEditQueueItem}
                    onEdit={onEditQueueItem}
                    onReview={setApprovalJob}
                    onOpenJob={open}
                    onDeploy={deployQueueItem}
                    onFixMissing={fixMissingOnItem}
                    onReportDeploy={reportDeployIssue}
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

      {/* Deploy history — OK successes only; fails stay in queue (Levi 2026-08-11) */}
      <div
        className="card overflow-hidden mb-4 border border-emerald-200"
        data-testid="permits-deploy-history"
      >
        <button
          type="button"
          className="w-full px-4 py-3 border-b border-emerald-100 bg-emerald-50/80 text-left"
          onClick={() => setDeployHistoryOpen((o) => !o)}
          aria-expanded={historyOpen}
          data-testid="permits-deploy-history-toggle"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-bold text-[16px] text-emerald-950 tracking-tight">
                Deploy history
              </h2>
              <p className="text-[13px] text-emerald-900/80 mt-1 leading-relaxed">
                {historyRows.length
                  ? `${historyRows.length} successful · fails stay in the queue above until fixed`
                  : "Successful deploys land here as OK, successfully sent…"}
              </p>
            </div>
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="pill bg-emerald-200 text-emerald-950 text-[11px] font-extrabold min-w-[1.5rem] justify-center">
                {historyRows.length}
              </span>
              <span
                className={`text-emerald-500 transition-transform text-lg leading-none ${
                  historyOpen ? "rotate-90" : ""
                }`}
              >
                ›
              </span>
            </span>
          </div>
        </button>
        {historyOpen ? (
          historyRows.length ? (
            <ul className="divide-y divide-emerald-50 bg-white" data-testid="permits-deploy-history-list">
              {historyRows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3 hover:bg-emerald-50/50"
                    onClick={() => row.jobId && open(row.jobId)}
                    data-testid="permits-deploy-history-row"
                  >
                    <div className="text-[14px] font-semibold text-emerald-950 leading-snug">
                      {row.okLine || row.successLabel || "OK, successfully sent"}
                    </div>
                    {row.subtitle ? (
                      <div className="text-[13px] text-slate-700 mt-0.5 leading-relaxed">
                        {row.subtitle}
                      </div>
                    ) : null}
                    {row.nextStage || row.nextHint ? (
                      <div className="text-[12px] text-slate-600 mt-1 font-medium leading-relaxed">
                        {row.nextStage || row.nextHint}
                      </div>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-6 text-center text-[14px] text-slate-500 leading-relaxed">
              No successful deploys yet — press Deploy when a row is Ready.
            </div>
          )
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
      {jobGroups.length ? (
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
      ) : null}

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
