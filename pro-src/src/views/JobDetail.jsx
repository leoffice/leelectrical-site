// Job detail — customer card (Call/Text/Email/Map + edit + QBO sync), quick
// views (invoice/estimate/calendar), mark-as-paid, 5-phase progress accordion
// with paperwork branches + scheduled date, follow-up + reminder, notes,
// attachments, send history and the live activity feed (retry on failed).
// All edits are STAGED via store.patchJob and only persist on Save & sync.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import { useDebouncedPatchField } from "../lib/useDebouncedPatch.js";
import { productName } from "../lib/tenantBranding.js";
import {
  FOLLOWUP_TYPES,
  PHASES,
  isCleared,
  phaseOfStage,
  progressPct,
  sortJobs,
  stageOf,
  stepState,
  todayStr,
} from "../lib/stages.js";
import {
  DATE_STEPS,
  INSPECTION_STEPS,
  PAPER,
  STEP_SHORT,
  firstVisiblePaperStep,
  isDatedStep,
} from "../lib/paperwork.js";
import { followUpFromPaperworkStep } from "../lib/calendarDue.js";
import { fmt$, ago } from "../lib/format.js";
import CustomerCard from "../components/CustomerCard.jsx";
import CustomerTransactionHistory from "../components/CustomerTransactionHistory.jsx";
import JobTransactionHistory from "../components/JobTransactionHistory.jsx";
import ConnectDocSheet from "../components/ConnectDocSheet.jsx";
import JobInfoCard from "../components/JobInfoCard.jsx";
import JobAddressCarousel from "../components/JobAddressCarousel.jsx";
import StatementSheet from "../components/StatementSheet.jsx";

import JobEditSheet from "../components/JobEditSheet.jsx";
import ServiceUpgradeEstimatorSheet from "../components/ServiceUpgradeEstimatorSheet.jsx";

import {
  canAddChangeOrder,
  carouselVisibleJobs,
  changeOrderJobPatch,
} from "../lib/changeOrder.js";
import ChangeOrderSheet from "../components/ChangeOrderSheet.jsx";
import AddJobAtAddressSheet from "../components/AddJobAtAddressSheet.jsx";
import ChangeOrdersTabPanel from "../components/ChangeOrdersTabPanel.jsx";
import {
  customerDisplayName,
  calendarServiceLocation,
} from "../lib/customerSync.js";
import { calendarUpsertDescription } from "../lib/calendarLink.js";
import {
  amountPaid,
  clientKey,
  customerContact,
  jobsForCustomerKey,
  openBalance,
  paidPct,
} from "../lib/customers.js";
import { touchCustomer } from "../lib/customerRecency.js";
import { movePayment, normalizePayments } from "../lib/payments.js";
import Toggle from "../components/Toggle.jsx";
import Jobs from "./Jobs.jsx";
import JobDocSheets, { openDocTab } from "../components/JobDocSheets.jsx";
import StepBubbleSheet from "../components/StepBubbleSheet.jsx";
import {
  completeAwarenessBubble,
  revertAwarenessBubble,
  skipAwarenessBubble,
  tapAwarenessBubble,
} from "../lib/bubbleHandlers.js";
import {
  AttachSheet,
  CombineSheet,
  CustEditSheet,
  InspectionSheet,
  PaperworkApptSheet,
  MarkPaidSheet,
  MenuSheet,
  PaymentHistorySheet,
  PaymentIntroSheet,
  PaymentLinkSheet,
  PaymentMenuSheet,
  ReminderSheet,
  useDoSend,
} from "../components/JobSheets.jsx";
import CustomerComposeSheet from "../components/CustomerComposeSheet.jsx";
import AgencyApplicationSheet from "../components/AgencyApplicationSheet.jsx";
import ConedApplicationStartSheet from "../components/ConedApplicationStartSheet.jsx";
import ConedCreateCaseSheet from "../components/ConedCreateCaseSheet.jsx";
import PaperworkApprovalSheet from "../components/PaperworkApprovalSheet.jsx";
import {
  getPaperworkJob,
  paperworkJobStatusLabel,
  paperworkJobStatusTone,
  ACTIVE_PAPERWORK_JOB_STATUSES,
} from "../lib/paperworkJobs.js";
import SendDocConfirmSheet from "../components/SendDocConfirmSheet.jsx";
import {
  buildWorkCompleteCustomerEmail,
  jobHasWorkCompleteMilestone,
} from "../lib/workCompleteNotify.js";
import { afterSendApprovedClose } from "../lib/sendDocConfirm.js";
import { beginPromptWorkPause } from "../lib/followUpReminders.js";
import { DOC_SOURCE_LOCAL } from "../lib/docSource.js";
import { useTenantConfig } from "../state/tenant.jsx";
import {
  isConedApplicationsEnabled,
  listConedCompletedFiles,
  checkCustomerIntake,
  mapIntakeAnswersToConed,
  intakeSubmissionToCompletedFiles,
  conedNotification,
  completionTodoPatch,
  listPaperworkTodos,
  readyToGoTodo,
  paperworkTodoLabel,
  updatePaperworkTodoPatch,
} from "../lib/agencyForms/index.js";

const CMD_TONES = {
  queued: "bg-slate-100 text-slate-500",
  working: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  needs_approval: "bg-violet-100 text-violet-700",
};

export default function JobDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const fromCust = sp.get("from") || ""; // customer-group key when opened from CustomerView
  const foldParam = sp.get("fold");
  // Levi: open any job on the job info card only; tap card again to expand progress.
  // fold=0 forces expanded (rare deep links); fold=1 or omitted → collapsed.
  const foldOnOpen = foldParam !== "0";
  // Back / tap customer card → customer default page (info + transaction history).
  // Navigate immediately — never wait on local work (Levi snappy feedback).
  const goBack = () => {
    const to = fromCust ? "/customer/" + encodeURIComponent(fromCust) : "/";
    nav(to);
  };
  const {
    effectiveJob,
    patchJob,
    patchAndSave,
    createJob,
    commands,
    pending,
    loading,
    enqueue,
    retryCommand,
    guardNav,
    showToast,
    events,
    jobs,
    sasCalls,
  } = useStore();
  const tenantConfig = useTenantConfig();
  const job = effectiveJob(id);
  const doSend = useDoSend();
  const [workCompleteSendBusy, setWorkCompleteSendBusy] = useState(false);
  const [workCompleteSendErr, setWorkCompleteSendErr] = useState("");
  const showWorkCompleteNotify = job ? jobHasWorkCompleteMilestone(job) : false;
  const conedAppsOn = isConedApplicationsEnabled(tenantConfig);
  const conedCompletedFiles = useMemo(
    () => (job && conedAppsOn ? listConedCompletedFiles(job) : []),
    [job, conedAppsOn]
  );
  // S27 gate: a FRESH application press asks meters + fill-vs-send first;
  // an in-progress / submitted application goes straight to the form.
  const conedApplyKind = job?.paperwork?.coned?.application?.answers
    ? "conedApp"
    : "conedAppStart";
  const conedIntakeRequest = job?.paperwork?.coned?.applicationRequest || null;

  // Create-case run lifecycle (paperwork-jobs bridge): poll while active so
  // Levi sees queued -> running -> awaiting YOUR approval -> submitted here.
  const createCasePwId =
    job?.paperwork?.coned?.createCase?.execution?.paperworkJobId || "";
  const [casePwJob, setCasePwJob] = useState(null);
  useEffect(() => {
    if (!createCasePwId) {
      setCasePwJob(null);
      return undefined;
    }
    let alive = true;
    let timer = null;
    const tick = async () => {
      const r = await getPaperworkJob(createCasePwId);
      if (!alive) return;
      if (r.ok && r.job) {
        setCasePwJob(r.job);
        if (ACTIVE_PAPERWORK_JOB_STATUSES.has(r.job.status)) {
          timer = setTimeout(tick, 20000);
        }
        // A submitted run carries the case number back onto the job record.
        if (r.job.caseNumber && !job?.paperwork?.coned?.caseNumber) {
          patchJob(id, { paperwork: { coned: { caseNumber: r.job.caseNumber } } });
        }
        // Auto-page Israel when fleet marks create-case failed (troubleshoot + fix).
        if (r.job.status === "failed" && r.job.error) {
          const { reportPaperworkFailOnce, fieldsFromPaperworkJob } = await import(
            "../lib/paperworkFailReport.js"
          );
          const fields = fieldsFromPaperworkJob(r.job, job);
          void reportPaperworkFailOnce(
            { ...fields, phase: "fleet_failed", error: fields.error || r.job.error },
            enqueue
          );
        }
      } else {
        timer = setTimeout(tick, 30000);
      }
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, createCasePwId]);

  // Levi dedupe: an existing application / completed Form A auto-enables the
  // Con Ed paperwork branch so it shows once, in the paperwork menu.
  useEffect(() => {
    if (!conedAppsOn || !job) return;
    const c = job.paperwork?.coned;
    if ((conedCompletedFiles.length || c?.application) && c?.enabled !== true) {
      patchJob(id, { paperwork: { coned: { enabled: true } } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    id,
    conedAppsOn,
    conedCompletedFiles.length,
    !!job?.paperwork?.coned?.application,
    job?.paperwork?.coned?.enabled,
  ]);

  // S27 — poll once per job open for a customer-completed application; import
  // the files + answers onto the tab, then S28 auto-queues the case upload.
  useEffect(() => {
    if (!conedAppsOn || !job || !conedIntakeRequest) return undefined;
    let alive = true;
    (async () => {
      const r = await checkCustomerIntake(id);
      if (!alive || !r.ok || !r.submission) return;
      const sub = r.submission;
      const importedAt = job?.paperwork?.coned?.customerIntakeImportedAt || "";
      if (!sub.updatedAt || sub.updatedAt <= importedAt) return;
      const files = intakeSubmissionToCompletedFiles(sub);
      if (!files.length) return;
      const existing = Array.isArray(job.paperwork?.coned?.completedFiles)
        ? job.paperwork.coned.completedFiles
        : [];
      const seen = new Set(existing.map((f) => f.docKey));
      const merged = [...existing, ...files.filter((f) => !seen.has(f.docKey))];
      const meterEntries = Object.values(sub.meters || {});
      const firstMeter = meterEntries[0];
      const mapped = firstMeter
        ? mapIntakeAnswersToConed(firstMeter.answers, job)
        : null;
      patchJob(id, {
        paperwork: {
          coned: {
            completedFiles: merged,
            customerIntakeImportedAt: sub.updatedAt,
            ...(mapped
              ? {
                  application: {
                    agencyId: "coned-form-a",
                    answers: mapped,
                    status: "customer_submitted",
                    submittedAt: firstMeter.submittedAt || sub.updatedAt,
                  },
                }
              : {}),
            steps: { "Application submitted": true },
            enabled: true,
            notifications: conedNotification(job, {
              type: "customer_submitted",
              text: `Customer completed the Con Ed application (${files.length} file${
                files.length === 1 ? "" : "s"
              }) - saved on the Con Edison Application tab.`,
            }),
          },
        },
      });
      showToast?.("Customer completed the Con Ed application — saved to the tab");
      // Levi redirect: no auto-upload. Each completed meter adds an
      // "Upload application to the Con Ed case" to-do (Ready to go fires it).
      let todoJob = {
        ...job,
        paperwork: {
          ...(job.paperwork || {}),
          coned: { ...(job.paperwork?.coned || {}), completedFiles: merged },
        },
      };
      for (const f of files) {
        const t = completionTodoPatch(todoJob, {
          meterLabel: f.meterLabel,
          source: "customer",
        });
        if (t.patch) {
          patchJob(id, t.patch);
          todoJob = {
            ...todoJob,
            paperwork: {
              ...todoJob.paperwork,
              todos: t.patch.paperwork.todos || todoJob.paperwork.todos,
              coned: {
                ...todoJob.paperwork.coned,
                notifications: t.patch.paperwork.coned.notifications,
              },
            },
          };
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, conedAppsOn, !!conedIntakeRequest]);
  const workCompleteEmail = useMemo(
    () => (job && showWorkCompleteNotify ? buildWorkCompleteCustomerEmail(job) : null),
    [job, showWorkCompleteNotify]
  );
  const custKey = job ? (fromCust || clientKey(job)) : "";
  const customerJobs = useMemo(() => {
    if (!job || !custKey) return job ? [job] : [];
    return sortJobs(jobsForCustomerKey(jobs, custKey));
  }, [job, jobs, custKey]);
  useEffect(() => {
    if (!job) return;
    // Defer recency write so back/open never stalls on localStorage.
    const t = setTimeout(() => {
      touchCustomer(custKey, customerJobs.length ? customerJobs : [job]);
    }, 0);
    return () => clearTimeout(t);
  }, [id, custKey, job?.id, customerJobs]);
  const addressJobs = useMemo(() => {
    if (!job) return [];
    return sortJobs(carouselVisibleJobs(jobs, job));
  }, [job, jobs]);
  const addJobAtAddress = () => {
    if (!job) return;
    setSheet({ kind: "addJobAtAddress" });
  };

  const confirmAddJobAtAddress = async (patch, meta = {}) => {
    if (!job) return;
    setSheet(null);
    const newId = await createJob(patch);
    if (!newId) return;
    const q = fromCust ? "?from=" + encodeURIComponent(fromCust) : "";
    if (meta.changeOrder) {
      const label = meta.kind === "estimate" ? "Change order estimate" : "Change order invoice";
      showToast(label + " started — number will be original invoice + CO");
      nav("/job/" + newId + q);
      setSheet({ kind: "docBuild", docKind: meta.kind || "invoice", mode: "create" });
      return;
    }
    showToast("New job at this address — add details when ready");
    nav("/job/" + newId + q);
  };

  const startChangeOrder = async (kind) => {
    if (!job) return;
    if (!canAddChangeOrder(jobs, job)) {
      showToast("Finish the open change order first — save, email, and confirm in QuickBooks");
      return;
    }
    setSheet(null);
    const patch = changeOrderJobPatch(job, kind, jobs);
    const newId = await createJob(patch);
    if (newId) {
      const label = kind === "estimate" ? "Change order estimate" : "Change order invoice";
      showToast(label + " started — number will be original invoice + CO");
      const q = fromCust ? "?from=" + encodeURIComponent(fromCust) : "";
      nav("/job/" + newId + q);
      setSheet({ kind: "docBuild", docKind: kind, mode: "create" });
    }
  };
  const openPay = sp.get("pay") === "1";
  const openPayHist = sp.get("payhist") === "1";
  const openPayId = sp.get("payId") || "";
  const focusJob = sp.get("focus") === "job" || openPayHist || foldOnOpen;
  const openDoc = sp.get("doc"); // estimate | invoice
  const openDocCreate = sp.get("create") === "1";
  const [openPhase, setOpenPhase] = useState(null); // null = auto
  const [openStep, setOpenStep] = useState(null);
  const [showRemoved, setShowRemoved] = useState({}); // paperwork branch -> expanded
  const [sheet, setSheet] = useState(null); // {kind, ...}
  const [showChangeOrders, setShowChangeOrders] = useState(false);
  const [detailSectionsExpanded, setDetailSectionsExpanded] = useState(!foldOnOpen);
  // Levi 2026-07-28: default = transaction history only. Service-address / open-invoice
  // lists stay collapsed until the user opens Invoices or Addresses (customer tabs).
  const [shortTxns, setShortTxns] = useState(true);
  const [jobTxns, setJobTxns] = useState(false);
  // Desktop customer list is heavy (~thousands of jobs) — mount after first paint.
  // Tests need the pane immediately so sidebar assertions don't race idle.
  const [listPaneReady, setListPaneReady] = useState(
    () => typeof import.meta !== "undefined" && import.meta.env?.MODE === "test"
  );
  const stepTimer = useRef(null);
  const jobInfoRef = useRef(null);

  const scrollToJobInfo = useCallback(() => {
    const el = jobInfoRef.current;
    if (!el) return;
    // Pin job information near the top (under sticky chrome) — not buried under lists.
    const top = el.getBoundingClientRect().top + window.scrollY - 56;
    window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
  }, []);

  useEffect(() => {
    // Default collapsed job info; only fold=0 opens fully expanded.
    setDetailSectionsExpanded(foldParam === "0");
    setShowChangeOrders(false);
    setJobTxns(false);
    // Levi 2026-07-28: keep customer transaction history on by default (not address/invoice lists).
    setShortTxns(true);
  }, [id, foldParam]);

  useEffect(() => {
    // Double rAF: wait for layout after job swap, then pin job information.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(scrollToJobInfo);
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [id, focusJob, scrollToJobInfo]);

  useEffect(() => {
    // Defer heavy left-pane customer list so opening a job from transaction history feels instant.
    let cancelled = false;
    const arm = () => {
      if (!cancelled) setListPaneReady(true);
    };
    let idleId = 0;
    let t = 0;
    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(arm, { timeout: 400 });
    } else {
      t = window.setTimeout(arm, 120);
    }
    return () => {
      cancelled = true;
      if (idleId && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleId);
      if (t) clearTimeout(t);
    };
  }, [id]);

  const toggleDetailSections = () => {
    setDetailSectionsExpanded((v) => !v);
    requestAnimationFrame(scrollToJobInfo);
  };

  const openDocEdit = sp.get("edit") === "1";
  const fromEst = sp.get("fromEst") === "1";
  const returnPayId = sp.get("returnPayId") || "";
  const returnPayJob = sp.get("returnPayJob") || "";
  useEffect(() => {
    if (openPay && job) setSheet({ kind: "paymenu" });
    if (openPayHist && job) {
      setSheet({ kind: "payhist", editPayId: openPayId || null });
    }
    if (openDocCreate && job && (openDoc === "estimate" || openDoc === "invoice")) {
      const returnTo = returnPayId
        ? {
            kind: "payhist",
            editPayId: returnPayId,
            // If payment lived on another job, parent paysheet uses current job after convert.
            _returnPayJob: returnPayJob || "",
          }
        : null;
      if (fromEst && openDoc === "invoice") {
        setSheet({
          kind: "progressPct",
          title: "Convert estimate to invoice",
          hint: "What percentage of the estimate should this invoice bill?",
          next: { kind: "docBuild", docKind: "invoice", mode: "turn_from_estimate" },
          returnTo,
        });
      } else {
        setSheet({
          kind: "docBuild",
          docKind: openDoc,
          mode: "create",
          returnTo,
        });
      }
    } else if (openDocEdit && job && (openDoc === "estimate" || openDoc === "invoice")) {
      setSheet({ kind: "docBuild", docKind: openDoc, mode: "edit" });
    }
  }, [openPay, openPayHist, openPayId, openDoc, openDocCreate, openDocEdit, fromEst, returnPayId, returnPayJob, job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 5s auto-collapse of the step action row (sleek's stepTimer)
  useEffect(() => {
    clearTimeout(stepTimer.current);
    if (openStep) stepTimer.current = setTimeout(() => setOpenStep(null), 5000);
    return () => clearTimeout(stepTimer.current);
  }, [openStep]);

  const myCommands = useMemo(
    () =>
      (commands || [])
        .filter((c) => String(c.jobId) === String(id))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [commands, id]
  );

  // Hooks must run before the !job early return.
  const notesToPatch = useCallback((v) => ({ notes: v }), []);
  const fuTextToPatch = useCallback((v) => ({ followUp: { text: v } }), []);
  const notesField = useDebouncedPatchField(id, job?.notes || "", patchJob, notesToPatch);
  const fuTextField = useDebouncedPatchField(
    id,
    (job?.followUp && job.followUp.text) || "",
    patchJob,
    fuTextToPatch
  );

  if (!job) {
    return (
      <div className="card px-6 py-12 text-center text-slate-400 text-sm">
        {loading ? "Loading…" : (
          <>Job “{id}” not found. <Link className="text-brand font-semibold" to="/">Back to jobs</Link></>
        )}
      </div>
    );
  }

  const cur = stageOf(job);
  const setStep = (stage, val) => {
    clearTimeout(stepTimer.current);
    setOpenStep(null);
    const p = { status: { [stage]: val ? { s: val, d: todayStr() } : { s: "" } } };
    if (stage === "Paid") p.paid = val === "done";
    patchJob(id, p);
  };
  const fu = job.followUp || {};
  const setFu = (patch) => patchJob(id, { followUp: patch });
  const autoIdx = PHASES.indexOf(phaseOfStage(cur) || PHASES[4]);
  const openIdx = openPhase !== null ? openPhase : autoIdx;
  const hist = (job.invoiceHistory || []).slice().reverse();
  const at = job.attachments || [];

  const schedDate = (d) => {
    patchJob(id, { status: { Scheduled: { s: "done", d } } });
    // Never clobber Google event notes with a product marker on reschedule.
    const calDesc = calendarUpsertDescription({
      notes: job.description || job.notes,
      calEventId: job.calEventId || "",
      createFallback: `Scheduled from ${productName()}`,
    });
    const calPayload = {
      calEventId: job.calEventId || "",
      summary: (job.title || "Job") + " — " + (job.customer || ""),
      start: d,
      location: calendarServiceLocation(job),
    };
    if (calDesc != null) calPayload.description = calDesc;
    enqueue("calendar_upsert", id, calPayload, "judgment", "sched:" + id + ":" + d);
  };

  // Sub-item three-state model (all schema-additive, staged via patchJob):
  //   paperwork[k].active[step]  = true  -> item enabled (Complete/Undo UX)
  //   paperwork[k].steps[step]   = true  -> item completed (existing key)
  //   paperwork[k].removed[step] = true  -> hidden into "Removed items"
  // Completing implies enabling; a done item from old saved data renders as
  // enabled+done, so existing data is unchanged. Keys are never deleted —
  // restore just flips removed[step] back to false.
  const paperStep = (k, s, on) => {
    setOpenStep(null);
    const patch = { paperwork: { [k]: { steps: { [s]: on }, active: { [s]: true } } } };
    if (on) patch.followUp = followUpFromPaperworkStep(k, s);
    patchJob(id, patch);
    if (on && INSPECTION_STEPS.has(s)) setSheet({ kind: "inspection", branch: k, step: s });
  };
  const enablePaper = (k, s) => {
    patchJob(id, { paperwork: { [k]: { active: { [s]: true } } } });
    setOpenStep(null);
  };
  const removePaper = (k, s) => {
    patchJob(id, { paperwork: { [k]: { removed: { [s]: true } } } });
    setOpenStep(null);
  };
  const restorePaper = (k, s) => patchJob(id, { paperwork: { [k]: { removed: { [s]: false } } } });

  const rmAtt = (i) => {
    const a = at.slice();
    a.splice(i, 1);
    patchJob(id, { attachments: a });
  };

  const detail = (
    <div className="space-y-3.5 min-w-0" data-testid="detail-pane">
      <div className="flex items-center">
        <button
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand min-w-0 max-w-[70%] truncate"
          onClick={() => guardNav(goBack)}
          data-testid="detail-back"
        >
          {fromCust ? "‹ " + (job.customer || "Customer") : "‹ Customers"}
        </button>
        <button className="btn-ghost !py-1.5 ml-auto" onClick={() => setSheet({ kind: "menu" })} aria-label="More">
          ⋮ More
        </button>
      </div>

      {/* Customer card — contact on top; Transaction history toggle (estimates live here).
          From customer: tap card body collapses job info and returns to customer default. */}
      <CustomerCard
        contact={{
          ...customerContact(customerJobs),
          name: customerDisplayName(job) || job.customer,
        }}
        showSummary={false}
        primaryJob={job}
        shortTxns={shortTxns}
        onShortTxnsChange={setShortTxns}
        onCardTap={fromCust ? () => guardNav(goBack) : undefined}
        onEdit={() => setSheet({ kind: "cust" })}
        onText={() => setSheet({ kind: "compose", channel: "sms" })}
        onEmail={() => setSheet({ kind: "compose", channel: "email" })}
      />

      {shortTxns ? (
        <CustomerTransactionHistory
          jobs={customerJobs}
          fromCust={custKey || fromCust}
          onOpenRow={(row) => {
            // Stay on this job page — payment sheet opens instantly (no full remount hang).
            if (row?.kind === "payment") {
              const payJobId = row.jobId;
              if (payJobId && String(payJobId) !== String(job.id)) {
                const parts = ["fold=1", "focus=job", "payhist=1"];
                if (fromCust || custKey) parts.push("from=" + encodeURIComponent(fromCust || custKey));
                if (row.payment?.id) parts.push("payId=" + encodeURIComponent(String(row.payment.id)));
                nav("/job/" + payJobId + "?" + parts.join("&"));
                return;
              }
              setSheet({
                kind: "payhist",
                editPayId: row.payment?.id || null,
              });
              return;
            }
            if (row?.kind === "estimate" || row?.kind === "invoice") {
              const targetId = row.jobId;
              if (targetId && String(targetId) !== String(job.id)) {
                const parts = ["fold=1", "focus=job"];
                if (fromCust || custKey) parts.push("from=" + encodeURIComponent(fromCust || custKey));
                nav("/job/" + targetId + "?" + parts.join("&"));
                return;
              }
              openDocTab(job, row.kind, setSheet);
            }
          }}
        />
      ) : null}

      {pending[id] ? (
        <div className="px-1 -mt-2">
          <span className="pill bg-amber-100 text-amber-700 text-xs">unsaved changes</span>
        </div>
      ) : null}

      <div ref={jobInfoRef} className="scroll-mt-20" data-testid="job-info-anchor">
        {addressJobs.length > 1 ? (
          <JobAddressCarousel
            jobs={addressJobs}
            activeId={id}
            events={events}
            commands={commands}
            sasCalls={sasCalls}
            onSelectJob={(j) => nav("/job/" + j.id + (fromCust ? "?from=" + encodeURIComponent(fromCust) : ""))}
            onAddChangeOrder={() => setSheet({ kind: "changeOrder" })}
            canAddChangeOrder={canAddChangeOrder(jobs, job)}
            onAddAttachment={() => setSheet({ kind: "attach" })}
            onAddJob={addJobAtAddress}
            onEditJob={() => setSheet({ kind: "jobedit" })}
            onEstimate={(j) => openDocTab(j, "estimate", setSheet)}
            onInvoice={(j) => openDocTab(j, "invoice", setSheet)}
            onPayment={() => setSheet({ kind: "paymenu" })}
            onCalendar={(j) => openDocTab(j, "calendar", setSheet)}
            onChangeOrders={() => setShowChangeOrders((v) => !v)}
            changeOrdersActive={showChangeOrders}
            onStatement={() => setSheet({ kind: "statement" })}
            onBubbleTap={(j, bubble) => tapAwarenessBubble(j, bubble, setSheet, openDocTab)}
            onCardTap={toggleDetailSections}
            jobTxns={jobTxns}
            onJobTxnsChange={setJobTxns}
          />
        ) : (
          <JobInfoCard
            job={job}
            jobs={jobs}
            events={events}
            commands={commands}
            sasCalls={sasCalls}
            showOpenLink={false}
            onCardTap={toggleDetailSections}
            onEditJob={() => setSheet({ kind: "jobedit" })}
            onAddJob={addJobAtAddress}
            onAddChangeOrder={() => setSheet({ kind: "changeOrder" })}
            canAddChangeOrder={canAddChangeOrder(jobs, job)}
            onAddAttachment={() => setSheet({ kind: "attach" })}
            onEstimate={() => openDocTab(job, "estimate", setSheet)}
            onInvoice={() => openDocTab(job, "invoice", setSheet)}
            onPayment={() => setSheet({ kind: "paymenu" })}
            onCalendar={() => openDocTab(job, "calendar", setSheet)}
            onChangeOrders={() => setShowChangeOrders((v) => !v)}
            changeOrdersActive={showChangeOrders}
            onStatement={() => setSheet({ kind: "statement" })}
            onBubbleTap={(bubble) => tapAwarenessBubble(job, bubble, setSheet, openDocTab)}
            jobTxns={jobTxns}
            onJobTxnsChange={setJobTxns}
          />
        )}
        {jobTxns ? (
          <div className="mt-2" data-testid="job-txn-history-section">
            <JobTransactionHistory
              job={job}
              customerJobs={customerJobs}
              onOpenFull={() => setSheet({ kind: "payhist" })}
              onOpenRow={(row) => {
                // Payment rows open the payment card (edit / delete / reassign invoice or customer).
                if (row?.kind === "payment") {
                  setSheet({
                    kind: "payhist",
                    editPayId: row.payment?.id || null,
                    applyTargetJobId: row.applyTargetJobId || null,
                    applyTargetDocNo: row.applyTargetDocNo || null,
                    openApply: !!row.openApply,
                  });
                }
              }}
            />
          </div>
        ) : null}
        {showChangeOrders ? (
          <div className="mt-2" data-testid="job-change-orders-section">
            <ChangeOrdersTabPanel
              jobs={jobs}
              sourceJob={job}
              canAdd={canAddChangeOrder(jobs, job)}
              onAdd={() => setSheet({ kind: "changeOrder" })}
              onEdit={(row) => {
                const target = row.job || job;
                const kind = row.docKind === "estimate" ? "estimate" : "invoice";
                const mode =
                  kind === "estimate"
                    ? target.estimateNo
                      ? "edit"
                      : "create"
                    : target.invoiceNo
                      ? "edit"
                      : "create";
                if (target.id && target.id !== job.id) {
                  const parts = [];
                  if (fromCust) parts.push("from=" + encodeURIComponent(fromCust));
                  parts.push("doc=" + kind);
                  if (mode === "create") parts.push("create=1");
                  else parts.push("edit=1");
                  nav("/job/" + target.id + "?" + parts.join("&"));
                  return;
                }
                setSheet({ kind: "docBuild", docKind: kind, mode });
              }}
              onOpenJob={(j) => {
                if (!j?.id) return;
                const q = fromCust ? "?from=" + encodeURIComponent(fromCust) : "";
                nav("/job/" + j.id + q);
              }}
              onRemove={(row) => {
                if (!row?.jobId) return;
                if (!window.confirm("Remove this change order from the app? QuickBooks is not changed.")) return;
                patchAndSave(row.jobId, { _deleted: true })
                  .then(() => showToast("Change order removed"))
                  .catch(() => showToast("Could not remove — try again"));
                if (String(row.jobId) === String(id)) {
                  const q = fromCust ? "?from=" + encodeURIComponent(fromCust) : "";
                  nav(fromCust ? "/customer/" + encodeURIComponent(fromCust) : "/");
                }
              }}
            />
          </div>
        ) : null}
      </div>

      {/* Levi 2026-07-28: do NOT auto-expand open invoices at this address.
          Open invoices / service addresses live under customer Invoices & Addresses tabs.
          Default view is job card + transaction history only. */}

      {detailSectionsExpanded ? (
      <>
      {/* Money */}
      {(() => {
        const due = openBalance(job);
        const paid = amountPaid(job);
        const pays = normalizePayments(job);
        const pct = paidPct(job);
        return (
          <div className="space-y-2">
            {(pays.length || due > 0.01) && (
              <button
                type="button"
                className="card w-full px-4 py-3 text-left"
                onClick={() => setSheet({ kind: "payhist" })}
                data-testid="payment-history-btn"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">💳 Payment history</span>
                  <span className="text-xs text-slate-500">{pays.length} payment{pays.length === 1 ? "" : "s"}</span>
                </div>
                <div className="text-[12px] text-slate-600 mt-1">
                  {paid > 0 ? (
                    <>
                      Paid <b>{fmt$(paid)}</b>
                      {pct ? <span className="text-slate-400"> ({pct}%)</span> : null}
                      {due > 0.01 ? (
                        <>
                          {" "}
                          · <span className="text-amber-800">{fmt$(due)} open</span>
                        </>
                      ) : (
                        <span className="text-emerald-700"> · Paid in full</span>
                      )}
                    </>
                  ) : due > 0.01 ? (
                    <>
                      Open balance <b>{fmt$(due)}</b>
                    </>
                  ) : (
                    <span className="text-slate-400">Tap to view or edit payments</span>
                  )}
                </div>
              </button>
            )}
          </div>
        );
      })()}

      {/* Progress */}
      <div>
        <div className="flex items-center gap-3 px-1 mb-2">
          <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
            Progress — {progressPct(job)}%
          </h2>
          <div className="flex-1 h-1.5 rounded-full bg-slate-200/70 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-brand to-accent" style={{ width: `${progressPct(job)}%` }} />
          </div>
        </div>
        {/* §5 Work Complete — opt-in customer notify (never auto-sends) */}
        {showWorkCompleteNotify ? (
          <div
            className="card mb-2 px-3 py-3 border border-emerald-200 bg-emerald-50/80"
            data-testid="work-complete-notify-card"
          >
            <p className="text-sm font-bold text-emerald-900 mb-1">Work complete — permit signed off</p>
            <p className="text-[12px] text-emerald-800/90 mb-2.5">
              Optionally email the customer that work is done and attach their invoice. You confirm before anything
              sends.
            </p>
            <button
              type="button"
              className="btn bg-emerald-700 text-white w-full !py-2.5 text-sm font-bold min-h-[44px]"
              data-testid="work-complete-notify-btn"
              onClick={() => {
                setWorkCompleteSendErr("");
                setSheet({ kind: "workCompleteNotify" });
              }}
            >
              Notify customer (work complete + invoice)
            </button>
            {job.workCompleteCustomerNotifiedAt ? (
              <p className="text-[11px] text-emerald-700 font-semibold mt-1.5 px-0.5">
                Customer notified · {String(job.workCompleteCustomerNotifiedAt).slice(0, 10)}
              </p>
            ) : null}
          </div>
        ) : null}
        {/* Levi dedupe: Con Ed application lives ONCE — inside the Paperwork
            phase below (auto-enabled when an application exists), never as a
            separate card at the top of the page. */}
        {PHASES.map((ph, pi) => {
          const done = ph.steps.filter((s) => isCleared(job, s)).length;
          const isOpen = openIdx === pi;
          return (
            <div key={ph.nm} className="card overflow-hidden mb-2">
              <button
                className="w-full flex items-center gap-2.5 px-4 py-3 text-left"
                onClick={() => {
                  setOpenPhase(isOpen ? -1 : pi);
                  setOpenStep(null);
                }}
              >
                <span>{ph.ic}</span>
                <span className="font-bold text-sm text-slate-800 flex-1">{ph.nm}</span>
                <span className={`pill ${done === ph.steps.length ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {done}/{ph.steps.length}
                </span>
                <span className={`text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
              </button>
              {isOpen && (
                <div className="px-2.5 pb-2.5">
                  {ph.steps.map((s) => {
                    const e = (job.status || {})[s] || {};
                    const cls = e.s === "done" ? "done" : e.s === "skipped" ? "skipped" : s === cur ? "current" : "";
                    return (
                      <div key={s}>
                        <button
                          className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left ${
                            cls === "skipped" ? "opacity-50" : ""
                          } active:bg-slate-50`}
                          onClick={() => setOpenStep(openStep === s ? null : s)}
                          data-testid={"progress-step-" + s}
                        >
                          <span
                            className={`grid place-items-center w-5 h-5 rounded-full text-[11px] text-white shrink-0 ${
                              cls === "done"
                                ? "bg-emerald-500"
                                : cls === "current"
                                ? "bg-amber-500 ring-4 ring-amber-100"
                                : "bg-slate-300"
                            }`}
                          >
                            {cls === "done" ? "✓" : cls === "skipped" ? "–" : ""}
                          </span>
                          <span className={`text-sm font-semibold flex-1 ${cls === "done" ? "text-emerald-800" : "text-slate-700"}`}>
                            {s}
                          </span>
                          {e.d && <span className="text-[11px] text-slate-400">{e.d}</span>}
                        </button>
                        {openStep === s && (
                          <div className="flex flex-wrap gap-1.5 pl-10 pb-2">
                            {s === "Estimate" && (e.s === "done" || e.s === "skipped") ? (
                              <>
                                <button className="btn-ghost !py-1.5" onClick={() => setStep(s, null)}>↩ Undo</button>
                                {job.estimateNo ? (
                                  <button
                                    className="btn bg-brand-soft text-brand !py-1.5"
                                    onClick={() => setSheet({ kind: "docBuild", docKind: "estimate", mode: "edit" })}
                                    data-testid="edit-estimate-paperwork"
                                  >
                                    Edit Est #{job.estimateNo}
                                  </button>
                                ) : null}
                                {(job.estimateLines?.length || job._estimator?.kind === "service_upgrade") ? (
                                  <button
                                    className="btn bg-brand-soft text-brand !py-1.5"
                                    onClick={() => setSheet({ kind: "docBuild", docKind: "estimate", mode: "edit" })}
                                    data-testid="edit-estimate-manual"
                                  >
                                    Edit lines
                                  </button>
                                ) : null}
                                {job._estimator?.kind === "service_upgrade" || job._fromEstimateGenerator ? (
                                  <>
                                    <button
                                      className="btn bg-emerald-100 text-emerald-800 !py-1.5"
                                      onClick={() => setSheet({ kind: "serviceUpgradeGen" })}
                                      data-testid="edit-estimate-generator"
                                    >
                                      Edit with estimate generator
                                    </button>
                                    <button
                                      className="btn bg-emerald-50 text-emerald-900 !py-1.5 border border-emerald-200"
                                      onClick={() => setSheet({ kind: "serviceUpgradeGen", startStep: 6 })}
                                      data-testid="job-takeoff-materials"
                                    >
                                      Take Off Materials
                                    </button>
                                  </>
                                ) : null}
                                {(job.estimateNo || (job.estimateLines && job.estimateLines.length)) && !job.invoiceNo ? (
                                  <button
                                    className="btn bg-brand-soft text-brand !py-1.5"
                                    onClick={() =>
                                      setSheet({
                                        kind: "progressPct",
                                        title: "Turn estimate into invoice",
                                        hint: "Bill what percentage of the estimate?",
                                        next: { kind: "docBuild", docKind: "invoice", mode: "turn_from_estimate" },
                                      })
                                    }
                                    data-testid="turn-to-invoice"
                                  >
                                    {job.estimateNo ? "Turn Est #" + job.estimateNo + " to invoice" : "Turn to invoice"}
                                  </button>
                                ) : null}
                              </>
                            ) : s === "Estimate" && e.s !== "done" && e.s !== "skipped" ? (
                              <>
                                <button
                                  className="btn bg-brand-soft text-brand !py-1.5"
                                  onClick={() => setSheet({ kind: "docBuild", docKind: "estimate", mode: "create" })}
                                  data-testid="generate-estimate"
                                >
                                  Generate
                                </button>
                                <button className="btn bg-emerald-100 text-emerald-700 !py-1.5" onClick={() => setStep(s, "done")}>
                                  ✓ Complete
                                </button>
                                <button className="btn-ghost !py-1.5" onClick={() => setStep(s, "skipped")}>Skip</button>
                              </>
                            ) : s === "Invoiced" && (e.s === "done" || e.s === "skipped") ? (
                              <>
                                <button className="btn-ghost !py-1.5" onClick={() => setStep(s, null)}>↩ Undo</button>
                                {job.invoiceNo ? (
                                  <button
                                    className="btn bg-brand-soft text-brand !py-1.5"
                                    onClick={() => setSheet({ kind: "docBuild", docKind: "invoice", mode: "edit" })}
                                    data-testid="edit-invoice-paperwork"
                                  >
                                    Edit Inv #{job.invoiceNo}
                                  </button>
                                ) : null}
                              </>
                            ) : s === "Invoiced" && e.s !== "done" && e.s !== "skipped" ? (
                              <>
                                <button
                                  className="btn bg-brand-soft text-brand !py-1.5"
                                  onClick={() =>
                                    setSheet(
                                      job.estimateNo || (job.estimateLines && job.estimateLines.length)
                                        ? { kind: "invoiceCreate" }
                                        : { kind: "docBuild", docKind: "invoice", mode: "create" }
                                    )
                                  }
                                  data-testid="create-invoice"
                                >
                                  Create
                                </button>
                                <button className="btn bg-emerald-100 text-emerald-700 !py-1.5" onClick={() => setStep(s, "done")}>
                                  ✓ Complete
                                </button>
                                <button className="btn-ghost !py-1.5" onClick={() => setStep(s, "skipped")}>Skip</button>
                              </>
                            ) : e.s === "done" || e.s === "skipped" ? (
                              <button className="btn-ghost !py-1.5" onClick={() => setStep(s, null)}>↩ Undo</button>
                            ) : (
                              <>
                                <button className="btn bg-emerald-100 text-emerald-700 !py-1.5" onClick={() => setStep(s, "done")}>
                                  ✓ Complete
                                </button>
                                <button className="btn-ghost !py-1.5" onClick={() => setStep(s, "skipped")}>Skip</button>
                              </>
                            )}
                          </div>
                        )}
                        {/* Paperwork branches */}
                        {s === "Paperwork" && e.s !== "skipped" && (
                          <div className="ml-7">
                            {Object.keys(PAPER).map((k) => {
                              const br = (job.paperwork || {})[k] || { enabled: false, steps: {}, dates: {} };
                              return (
                                <div key={k} className="border-l-2 border-slate-200 pl-3 my-1.5">
                                  <div className="flex items-center gap-2 py-1">
                                    <span className="text-[13px] font-bold flex-1">{PAPER[k].nm}</span>
                                    <Toggle
                                      on={br.enabled}
                                      label={PAPER[k].nm}
                                      onChange={(on) => {
                                        const patch = { paperwork: { [k]: { enabled: on } } };
                                        if (on) {
                                          const first = firstVisiblePaperStep(k, br);
                                          if (first) {
                                            patch.paperwork[k].active = { [first]: true };
                                          }
                                        }
                                        patchJob(id, patch);
                                      }}
                                    />
                                  </div>
                                  {/* ConEd open-case stage from email brain (Batch 1) */}
                                  {br.enabled && k === "coned" && (br.stageLabel || br.caseNumber || br.nextAction) && (
                                    <div className="text-[11px] text-slate-600 pb-1 space-y-0.5" data-testid="coned-stage-chip">
                                      {br.caseNumber ? (
                                        <div className="font-semibold text-slate-800">{br.caseNumber}</div>
                                      ) : null}
                                      {br.stageLabel ? (
                                        <div>
                                          <span
                                            className={`inline-block rounded-full px-2 py-0.5 font-semibold ${
                                              br.health === "blocked-by-us"
                                                ? "bg-red-100 text-red-800"
                                                : br.health === "at-risk"
                                                  ? "bg-amber-100 text-amber-900"
                                                  : br.stageBucket === "Passed" || br.stageBucket === "Terminal"
                                                    ? "bg-emerald-100 text-emerald-800"
                                                    : "bg-violet-100 text-violet-900"
                                            }`}
                                          >
                                            {br.stageLabel}
                                          </span>
                                        </div>
                                      ) : null}
                                      {br.nextAction ? (
                                        <div className="text-slate-500">{br.nextAction}</div>
                                      ) : null}
                                    </div>
                                  )}
                                  {/* S23 Submit a Case + Form A (Levi-tenant Con Ed apps) */}
                                  {br.enabled && k === "coned" && (
                                    <div className="py-1.5 space-y-1" data-testid="coned-app-cta">
                                      {conedCompletedFiles.map((f, fi) => (
                                        <div
                                          key={(f.docKey || f.name || "f") + fi}
                                          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm"
                                          data-testid="coned-completed-file"
                                        >
                                          <span className="shrink-0">📄</span>
                                          <div className="min-w-0 flex-1">
                                            {f.url ? (
                                              <a
                                                href={f.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-brand font-semibold truncate block"
                                                download={f.name || undefined}
                                              >
                                                {f.name || "Completed Form A.pdf"}
                                              </a>
                                            ) : (
                                              <span className="font-semibold text-slate-800 truncate block">
                                                {f.name || "Completed Form A.pdf"}
                                              </span>
                                            )}
                                            <div className="text-[11px] text-slate-500">
                                              {(f.meterLabel ? f.meterLabel + " · " : "") +
                                                (f.status || "submitted") +
                                                (f.submittedAt
                                                  ? " · " + String(f.submittedAt).slice(0, 10)
                                                  : "")}
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                      {conedAppsOn ? (
                                        <button
                                          type="button"
                                          className="btn bg-violet-700 text-white w-full !py-2.5 text-sm font-bold min-h-[44px]"
                                          onClick={() => setSheet({ kind: "conedCreateCase" })}
                                          data-testid="coned-submit-a-case"
                                        >
                                          {br.createCase?.status === "ready_to_fill" ||
                                          br.createCase?.execution?.status === "queued"
                                            ? "Submit a Case · queued / continue"
                                            : br.createCase?.answers
                                              ? "Continue Submit a Case"
                                              : "Submit a Case"}
                                        </button>
                                      ) : null}
                                      <button
                                        type="button"
                                        className="btn bg-emerald-700 text-white w-full !py-2.5 text-sm font-bold min-h-[44px]"
                                        onClick={() => setSheet({ kind: conedApplyKind })}
                                        data-testid="coned-fill-application"
                                      >
                                        {(br.application?.status === "submitted"
                                          ? "View / resend Con Ed application"
                                          : br.application?.status === "customer_submitted"
                                            ? "Review customer application"
                                            : br.application?.answers
                                              ? "Continue Con Ed application"
                                              : "Con Ed application") +
                                          (br.application?.status === "submitted" ? " ✓" : "")}
                                      </button>
                                      {conedIntakeRequest &&
                                      !job?.paperwork?.coned?.customerIntakeImportedAt ? (
                                        <p className="text-[11px] text-slate-500 px-0.5">
                                          Sent to customer
                                          {conedIntakeRequest.to ? ` (${conedIntakeRequest.to})` : ""} ·{" "}
                                          {String(conedIntakeRequest.sentAt || "").slice(0, 10)} — waiting
                                          for them to fill it out.
                                        </p>
                                      ) : null}
                                      {(job?.paperwork?.coned?.notifications || [])
                                        .slice(-3)
                                        .map((n, ni) => (
                                          <p
                                            key={(n.at || "") + ni}
                                            className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1.5"
                                            data-testid="coned-notification"
                                          >
                                            {n.text || n.type}
                                          </p>
                                        ))}
                                      {casePwJob ? (
                                        <div
                                          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2"
                                          data-testid="coned-case-run"
                                        >
                                          <div className="min-w-0 flex-1">
                                            <div className="text-[12px] font-bold text-slate-800">
                                              Create case run
                                              {casePwJob.caseNumber
                                                ? ` · ${casePwJob.caseNumber}`
                                                : ""}
                                            </div>
                                            <span
                                              className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${paperworkJobStatusTone(
                                                casePwJob.status
                                              )}`}
                                            >
                                              {paperworkJobStatusLabel(casePwJob.status)}
                                            </span>
                                            {casePwJob.error ? (
                                              <div className="text-[11px] text-red-600">
                                                {casePwJob.error}
                                                {casePwJob.status === "failed" ? (
                                                  <span className="block text-slate-500 font-semibold mt-0.5">
                                                    Developers notified — fixing in the background
                                                  </span>
                                                ) : null}
                                              </div>
                                            ) : null}
                                          </div>
                                          {casePwJob.status === "awaiting_approval" ? (
                                            <button
                                              type="button"
                                              className="btn bg-red-600 text-white !py-1.5 !px-2.5 text-xs font-extrabold shrink-0 animate-pulse"
                                              onClick={() =>
                                                setSheet({ kind: "pwApproval", pwJob: casePwJob })
                                              }
                                              data-testid="coned-case-review"
                                            >
                                              Review &amp; approve
                                            </button>
                                          ) : null}
                                        </div>
                                      ) : br.createCase?.execution?.status === "queued" ? (
                                        <p className="text-[11px] text-violet-700 font-semibold px-0.5">
                                          Create-case queued for the browser agent · stops at Review
                                          for your approval
                                        </p>
                                      ) : null}
                                      {br.application?.status === "submitted" ? (
                                        <p className="text-[11px] text-emerald-700 font-semibold px-0.5">
                                          Application submitted
                                          {br.application?.emailResult?.ok ? " · emailed" : ""}
                                        </p>
                                      ) : br.application?.updatedAt ? (
                                        <p className="text-[11px] text-slate-500 px-0.5">Draft saved — resume anytime</p>
                                      ) : (
                                        <p className="text-[11px] text-slate-500 px-0.5">
                                          Mobile-friendly Form A — emails the full application on submit
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  {/* Levi: visual step FLOW — parallel chips, green=done,
                                      amber=in progress, gray=not yet. Tap a chip to open
                                      that step's controls (incl. remove). */}
                                  {br.enabled && (
                                    <div
                                      className="flex flex-wrap items-center gap-1 py-1.5"
                                      data-testid={`paper-flow-${k}`}
                                    >
                                      {PAPER[k].steps
                                        .filter((ps) => !(br.removed && br.removed[ps]))
                                        .map((ps, si, arr) => {
                                          const on = !!(br.steps && br.steps[ps]);
                                          const active = !on && !!(br.active && br.active[ps]);
                                          const rowKey = "pp:" + k + ":" + ps;
                                          return (
                                            <React.Fragment key={ps}>
                                              <button
                                                type="button"
                                                className={`rounded-full px-2 py-1 text-[11px] font-bold border leading-tight ${
                                                  on
                                                    ? "bg-emerald-600 text-white border-emerald-600"
                                                    : active
                                                      ? "bg-amber-50 text-amber-800 border-amber-300"
                                                      : "bg-slate-100 text-slate-400 border-slate-200"
                                                }`}
                                                data-status={on ? "done" : active ? "active" : "todo"}
                                                onClick={() => {
                                                  // Gray chip = not yet enabled: tapping enables
                                                  // immediately (fast path kept from the row UX)
                                                  // and opens its controls.
                                                  if (!on && !active) enablePaper(k, ps);
                                                  setOpenStep(openStep === rowKey ? null : rowKey);
                                                }}
                                                title={ps}
                                              >
                                                {on ? "✓ " : ""}
                                                {STEP_SHORT[ps] || ps}
                                              </button>
                                              {si < arr.length - 1 ? (
                                                <span className="text-slate-300 text-[10px]">›</span>
                                              ) : null}
                                            </React.Fragment>
                                          );
                                        })}
                                    </div>
                                  )}
                                  {/* Detail controls only for the tapped chip — the flow
                                      strip above is the scannable view of every step. */}
                                  {br.enabled &&
                                    PAPER[k].steps
                                      .filter(
                                        (ps) =>
                                          !(br.removed && br.removed[ps]) &&
                                          openStep === "pp:" + k + ":" + ps
                                      )
                                      .map((ps) => {
                                        const on = !!(br.steps && br.steps[ps]);
                                        const enabledItem = on || !!(br.active && br.active[ps]);
                                        const rowKey = "pp:" + k + ":" + ps;
                                        return (
                                          <div key={ps}>
                                            <div className={`flex items-center gap-2 py-1 ${enabledItem ? "" : "opacity-50"}`}>
                                              <button
                                                type="button"
                                                className={`text-left text-[13px] flex-1 min-w-0 ${
                                                  on ? "text-emerald-800 font-semibold" : "text-slate-600"
                                                }`}
                                                onClick={() => {
                                                  if (!enabledItem) {
                                                    enablePaper(k, ps);
                                                    return;
                                                  }
                                                  setOpenStep(openStep === rowKey ? null : rowKey);
                                                }}
                                              >
                                                {on ? "✓ " : ""}
                                                {ps}
                                              </button>
                                              {isDatedStep(ps) && (
                                                <input
                                                  type={DATE_STEPS[ps] === "datetime" ? "datetime-local" : "date"}
                                                  className={`input !py-1 !px-1.5 !text-xs ${
                                                    DATE_STEPS[ps] === "datetime" ? "!w-[165px]" : "!w-[135px]"
                                                  }`}
                                                  value={
                                                    DATE_STEPS[ps] === "datetime"
                                                      ? (br.dates && br.dates[ps]) || ""
                                                      : ((br.dates && br.dates[ps]) || "").slice(0, 10)
                                                  }
                                                  onChange={(ev) => {
                                                    const val = ev.target.value;
                                                    if (INSPECTION_STEPS.has(ps) && val) {
                                                      setSheet({
                                                        kind: "inspection",
                                                        branch: k,
                                                        step: ps,
                                                        initialDt: val,
                                                      });
                                                      return;
                                                    }
                                                    patchJob(id, {
                                                      paperwork: { [k]: { dates: { [ps]: val } } },
                                                    });
                                                  }}
                                                  aria-label={ps + " date"}
                                                />
                                              )}
                                              <Toggle
                                                small
                                                on={on}
                                                label={ps}
                                                onChange={(v) => {
                                                  if (v && !enabledItem) {
                                                    enablePaper(k, ps);
                                                    if (INSPECTION_STEPS.has(ps)) {
                                                      setSheet({ kind: "inspection", branch: k, step: ps });
                                                    }
                                                  } else {
                                                    paperStep(k, ps, v);
                                                  }
                                                }}
                                              />
                                              <button
                                                type="button"
                                                className="btn-ghost !py-0.5 !px-1.5 text-slate-400"
                                                onClick={() => removePaper(k, ps)}
                                                aria-label={`Remove ${ps} from list`}
                                              >
                                                ✕
                                              </button>
                                            </div>
                                            {openStep === rowKey && (
                                              <div className="flex gap-1.5 pl-4 pb-1.5">
                                                {!enabledItem ? (
                                                  <button
                                                    className="btn bg-brand-soft text-brand !py-1.5"
                                                    onClick={() => enablePaper(k, ps)}
                                                  >
                                                    Enable
                                                  </button>
                                                ) : on ? (
                                                  <button className="btn-ghost !py-1.5" onClick={() => paperStep(k, ps, false)}>
                                                    ↩ Undo
                                                  </button>
                                                ) : (
                                                  <button
                                                    className="btn bg-emerald-100 text-emerald-700 !py-1.5"
                                                    onClick={() => paperStep(k, ps, true)}
                                                  >
                                                    ✓ Complete
                                                  </button>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                  {br.enabled &&
                                    (() => {
                                      const gone = PAPER[k].steps.filter((ps) => br.removed && br.removed[ps]);
                                      if (!gone.length) return null;
                                      return (
                                        <div className="mt-0.5">
                                          <button
                                            type="button"
                                            className="flex items-center gap-1 py-1 text-[12px] font-semibold text-slate-400"
                                            onClick={() => setShowRemoved((m) => ({ ...m, [k]: !m[k] }))}
                                          >
                                            <span className={`transition-transform ${showRemoved[k] ? "rotate-90" : ""}`}>›</span>
                                            Removed items ({gone.length})
                                          </button>
                                          {showRemoved[k] &&
                                            gone.map((ps) => (
                                              <div key={ps} className="flex items-center gap-2 py-1">
                                                <span className="text-[13px] flex-1 min-w-0 text-slate-400 line-through">{ps}</span>
                                                <button
                                                  type="button"
                                                  className="btn-ghost !py-1 !px-2.5"
                                                  onClick={() => restorePaper(k, ps)}
                                                >
                                                  Restore
                                                </button>
                                              </div>
                                            ))}
                                        </div>
                                      );
                                    })()}
                                </div>
                              );
                            })}
                            {/* Paperwork TO-DOS (Levi) — created on completion, fired
                                manually with Ready to go once access is unlocked. */}
                            {listPaperworkTodos(job).length ? (
                              <div
                                className="mt-2 rounded-xl border border-violet-200 bg-violet-50/60 p-2.5 space-y-1.5"
                                data-testid="paperwork-todos"
                              >
                                <div className="text-[11px] font-extrabold uppercase tracking-wide text-violet-800">
                                  Paperwork to-do list
                                </div>
                                {listPaperworkTodos(job).map((t) => (
                                  <div
                                    key={t.id}
                                    className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-2.5 py-2"
                                    data-testid="paperwork-todo-row"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="text-[13px] font-semibold text-slate-800 truncate">
                                        {t.title || paperworkTodoLabel(t.kind)}
                                        {t.meterLabel ? ` · ${t.meterLabel}` : ""}
                                      </div>
                                      {t.error ? (
                                        <div className="text-[11px] text-red-600">{t.error}</div>
                                      ) : t.status === "queued" ? (
                                        <div className="text-[11px] text-emerald-700">
                                          Fired · stops at review for your confirm
                                        </div>
                                      ) : null}
                                    </div>
                                    {t.status === "queued" ? (
                                      <span className="pill bg-emerald-100 text-emerald-800">queued</span>
                                    ) : (
                                      <button
                                        type="button"
                                        className="btn bg-violet-700 text-white !py-1.5 !px-2.5 text-xs font-bold shrink-0"
                                        onClick={async () => {
                                          const r = await readyToGoTodo({
                                            job,
                                            todo: t,
                                            enqueue,
                                            onSave: (p) => patchJob(id, p),
                                          });
                                          showToast?.(
                                            r.queued
                                              ? "Queued — stops at review for your confirm"
                                              : "Not fired: " + (r.error || "unknown")
                                          );
                                        }}
                                        data-testid="todo-ready-to-go"
                                      >
                                        Ready to go
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="btn-ghost !py-0.5 !px-1.5 text-slate-400"
                                      aria-label={`Remove to-do ${t.title || t.kind}`}
                                      onClick={() => {
                                        const p = updatePaperworkTodoPatch(job, t.id, "removed");
                                        if (p) patchJob(id, p);
                                      }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )}
                        {/* Scheduled job-date */}
                        {s === "Scheduled" && (
                          <div className="ml-7 border-l-2 border-slate-200 pl-3 my-1.5 flex items-center gap-2 py-1">
                            <span className="text-[13px] text-slate-500 flex-1">Job date</span>
                            <input
                              type="date"
                              className="input !w-[150px] !py-1 !px-1.5 !text-xs"
                              value={e.d || ""}
                              onChange={(ev) => schedDate(ev.target.value)}
                              aria-label="Job date"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Follow-up & notes */}
      <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider px-1 !mb-[-6px]">
        Follow-up &amp; notes
      </h2>
      <div className="card px-4 py-4 space-y-2.5">
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5">Follow-up type</label>
          <select className="input" value={fu.type || ""} onChange={(e) => setFu({ type: e.target.value })} aria-label="Follow-up type">
            <option value="">— none —</option>
            {FOLLOWUP_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Custom message (optional)"
            value={fuTextField.value}
            onChange={fuTextField.onChange}
            onBlur={fuTextField.onBlur}
            aria-label="Follow-up text"
          />
          <input
            className="input !w-[150px]"
            type="date"
            value={fu.date || ""}
            onChange={(e) => setFu({ date: e.target.value })}
            aria-label="Follow-up date"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4"
            checked={!!fu.remind}
            onChange={(e) => {
              setFu({ remind: e.target.checked });
              showToast(e.target.checked ? "Office Manager will Telegram you on that date" : "Reminder off");
            }}
          />
          🔔 Remind me on Telegram on this date (via Office Manager)
        </label>
        {!job.paid && job.invoiceNo && (
          <button className="btn bg-red-100 text-red-600 w-full !py-2" onClick={() => setSheet({ kind: "reminder" })}>
            🔔 Send customer a payment reminder…
          </button>
        )}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5">Notes</label>
          <textarea
            className="input min-h-[74px]"
            value={notesField.value}
            onChange={notesField.onChange}
            onBlur={notesField.onBlur}
            aria-label="Notes"
          />
        </div>
      </div>

      {/* Attachments list — add via 📋 Attach next to Job information */}
      {at.length ? (
        <>
          <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider px-1 !mb-[-6px]">
            Attachments ({at.length})
          </h2>
          <div className="card px-4 py-3" data-testid="attachments-list">
            {at.map((a, i) => (
              <div key={i} className="flex items-center gap-2.5 py-1.5 border-b border-dashed border-slate-200 last:border-0 text-sm">
                <span>📎</span>
                <span className="flex-1 min-w-0 truncate">
                  {a.url ? (
                    <a href={a.url} target="_blank" rel="noreferrer" className="text-brand font-semibold">
                      {a.name || "file"}
                    </a>
                  ) : (
                    a.name || "file"
                  )}
                </span>
                <button className="btn-ghost !py-1 !px-2.5" onClick={() => rmAtt(i)} aria-label={`Remove ${a.name}`}>
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn-ghost w-full !py-1.5 mt-1 text-brand text-sm font-semibold"
              onClick={() => setSheet({ kind: "attach" })}
              data-testid="attachments-add-more"
            >
              📋 Add another
            </button>
          </div>
        </>
      ) : null}

      {/* Send history */}
      {hist.length > 0 && (
        <>
          <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider px-1 !mb-[-6px]">
            Send history
          </h2>
          <div className="card px-4 py-3">
            {hist.slice(0, 6).map((x, i) => (
              <div key={i} className="flex items-center gap-2.5 py-1.5 border-b border-dashed border-slate-200 last:border-0 text-sm">
                <span>📤</span>
                <span className="flex-1 min-w-0 truncate">{x.kind || "Sent"}</span>
                <span className="text-slate-400 text-xs shrink-0">
                  {x.date || ""}
                  {x.to ? " → " + x.to : ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Activity */}
      <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider px-1 !mb-[-6px]">Activity</h2>
      <div className="card px-4 py-3">
        {myCommands.length ? (
          myCommands.slice(0, 8).map((c) => (
            <div key={c.id} className="flex items-center gap-2.5 py-1.5 border-b border-dashed border-slate-200 last:border-0 text-sm">
              <span className={`pill shrink-0 ${CMD_TONES[c.status] || "bg-slate-100 text-slate-500"}`}>
                {c.status === "needs_approval" ? "needs OK" : c.status}
              </span>
              <span className="flex-1 min-w-0 truncate">
                {c.type}
                {c.error ? <span className="text-red-600"> — {String(c.error).slice(0, 80)}</span> : null}
              </span>
              {c.status === "failed" && (
                <button className="btn bg-red-100 text-red-600 !py-1 !px-2.5 shrink-0" onClick={() => retryCommand(c.id)}>
                  Retry
                </button>
              )}
              <span className="text-slate-400 text-xs shrink-0">{ago(c.updatedAt || c.createdAt)}</span>
            </div>
          ))
        ) : (
          <div className="text-sm text-slate-400">
            No actions yet. Sends, payments and syncs will show here with live status.
          </div>
        )}
      </div>
      </>
      ) : null}

      {/* Sheets */}
      {sheet?.kind === "workCompleteNotify" && job && workCompleteEmail ? (
        <SendDocConfirmSheet
          job={job}
          kind="invoice"
          docSource={DOC_SOURCE_LOCAL}
          withPay={!!job.invoiceNo && openBalance(job) > 0.01}
          initialSubject={workCompleteEmail.subject}
          initialMessage={workCompleteEmail.body}
          title="Notify customer — work complete"
          intro="Review the note and invoice attachment, then Approve. Nothing sends until you confirm."
          busy={workCompleteSendBusy}
          error={workCompleteSendErr}
          onBack={() => {
            if (workCompleteSendBusy) return;
            setSheet(null);
            setWorkCompleteSendErr("");
          }}
          onApprove={async (model) => {
            setWorkCompleteSendBusy(true);
            setWorkCompleteSendErr("");
            beginPromptWorkPause();
            const result = await doSend(job, "invoice", {
              includePaymentLink: model.withPay,
              email: model.email,
              docSource: model.docSource,
              message: model.message,
              subject: model.subject,
              emailPolicy: model.emailPolicy,
            });
            if (result?.ok) {
              try {
                await patchAndSave(job.id, {
                  workCompleteCustomerNotifiedAt: new Date().toISOString(),
                });
              } catch {
                /* non-fatal */
              }
              await afterSendApprovedClose({ ok: true, onClose: () => setSheet(null) });
              setWorkCompleteSendBusy(false);
              return;
            }
            setWorkCompleteSendBusy(false);
            setWorkCompleteSendErr(result?.error || "Send failed — nothing was emailed");
          }}
        />
      ) : null}
      {sheet?.kind === "menu" && (
        <MenuSheet
          job={job}
          onClose={() => setSheet(null)}
          onCombine={() => setSheet({ kind: "combine" })}
          onConnect={(kind) => setSheet({ kind: "connect", connectKind: kind })}
        />
      )}
      {sheet?.kind === "connect" && job ? (
        <ConnectDocSheet
          job={job}
          pressedKind={sheet.connectKind || (job.invoiceNo ? "invoice" : job.estimateNo ? "estimate" : "permit")}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet?.kind === "combine" && <CombineSheet job={job} onClose={() => setSheet(null)} />}
      {sheet?.kind === "payintro" && (
        <PaymentIntroSheet
          onClose={() => setSheet(null)}
          onAttachPicture={() => setSheet({ kind: "paid", initialMethod: "Check", openProofPicker: true })}
          onPickMethod={(method) => setSheet({ kind: "paid", initialMethod: method })}
        />
      )}
      {sheet?.kind === "statement" && job ? (
        <StatementSheet
          jobs={[job]}
          customerName={customerDisplayName(job) || job.customer || job.businessName || ""}
          customerEmail={job.email || ""}
          billingAddress={job.billingAddress || job.address || ""}
          primaryJob={job}
          scopeLabel="job"
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet?.kind === "paid" && (
        <MarkPaidSheet
          job={job}
          onClose={() => setSheet(null)}
          initialMethod={sheet.initialMethod || ""}
          openProofPicker={Boolean(sheet.openProofPicker)}
        />
      )}
      {sheet?.kind === "payhist" && (
        <PaymentHistorySheet
          key={
            "payhist-" +
            (sheet.editPayId || "list") +
            "-" +
            (sheet.applyTargetJobId || "") +
            "-" +
            (sheet.openApply ? "apply" : "")
          }
          job={job}
          onClose={() => setSheet(null)}
          onAddPayment={() => setSheet({ kind: "paid" })}
          initialEditId={sheet.editPayId || null}
          applyTargetJobId={sheet.applyTargetJobId || null}
          applyTargetDocNo={sheet.applyTargetDocNo || null}
          openApply={!!sheet.openApply}
          onConvertEstimate={(estJob, draft) => {
            const targetId = estJob?.id || job.id;
            const returnTo = {
              kind: "payhist",
              editPayId: draft?.paymentId || sheet.editPayId || null,
            };
            // Same job: open convert flow and return to this payment after Save.
            if (String(targetId) === String(job.id)) {
              setSheet({
                kind: "progressPct",
                title: "Convert estimate to invoice",
                hint: "What percentage of the estimate should this invoice bill?",
                next: {
                  kind: "docBuild",
                  docKind: "invoice",
                  mode: "turn_from_estimate",
                },
                returnTo,
              });
              return;
            }
            // Different job: jump there with convert + return pay context.
            const parts = ["fold=1", "focus=job", "doc=invoice", "create=1", "fromEst=1"];
            if (fromCust) parts.push("from=" + encodeURIComponent(fromCust));
            if (draft?.paymentId) parts.push("returnPayId=" + encodeURIComponent(String(draft.paymentId)));
            if (draft?.sourceJobId) parts.push("returnPayJob=" + encodeURIComponent(String(draft.sourceJobId)));
            nav("/job/" + targetId + "?" + parts.join("&"));
          }}
        />
      )}
      {sheet?.kind === "paymenu" && (
        <PaymentMenuSheet
          job={job}
          onClose={() => setSheet(null)}
          onRecord={() => setSheet({ kind: "payintro" })}
          onLink={() => setSheet({ kind: "paylink" })}
        />
      )}
      {sheet?.kind === "paylink" && <PaymentLinkSheet job={job} onClose={() => setSheet(null)} />}
      {sheet?.kind === "cust" && <CustEditSheet job={job} onClose={() => setSheet(null)} />}
      {sheet?.kind === "jobedit" && (
        <JobEditSheet job={job} fromCust={fromCust} onClose={() => setSheet(null)} />
      )}

      {sheet?.kind === "reminder" && <ReminderSheet job={job} onClose={() => setSheet(null)} />}
      {sheet?.kind === "compose" && (
        <CustomerComposeSheet
          job={job}
          channel={sheet.channel || "email"}
          context={sheet.context || "general"}
          title={sheet.title}
          initialTo={sheet.initialTo}
          initialPhone={sheet.initialPhone}
          initialSubject={sheet.initialSubject}
          initialMessage={sheet.initialMessage}
          paymentUrl={sheet.paymentUrl}
          extraActions={sheet.extraActions}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "attach" && <AttachSheet job={job} onClose={() => setSheet(null)} />}
      {sheet?.kind === "inspection" && (
        <InspectionSheet
          job={job}
          branch={sheet.branch}
          step={sheet.step}
          initialDt={sheet.initialDt}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "paperAppt" && (
        <PaperworkApptSheet
          job={job}
          branch={sheet.branch}
          step={sheet.step}
          initialDt={sheet.initialDt}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "conedAppStart" && (
        <ConedApplicationStartSheet
          job={job}
          onClose={() => setSheet(null)}
          onFill={() => setSheet({ kind: "conedApp" })}
          onSave={(patch) => patchJob(id, patch)}
        />
      )}
      {sheet?.kind === "conedApp" && (
        <AgencyApplicationSheet
          job={job}
          agencyId="coned-form-a"
          onClose={() => setSheet(null)}
          onSave={(patch) => patchJob(id, patch)}
        />
      )}
      {sheet?.kind === "conedCreateCase" && (
        <ConedCreateCaseSheet
          job={job}
          onClose={() => setSheet(null)}
          onSave={(patch) => patchJob(id, patch)}
        />
      )}
      {sheet?.kind === "pwApproval" && sheet.pwJob && (
        <PaperworkApprovalSheet
          pwJob={sheet.pwJob}
          onClose={() => setSheet(null)}
          onDecided={(updated) => setCasePwJob(updated)}
        />
      )}
      {sheet?.kind === "bubble" && sheet.bubble ? (
        <StepBubbleSheet
          bubble={sheet.bubble}
          onClose={() => setSheet(null)}
          onComplete={(b) => {
            const prompt = completeAwarenessBubble(id, job, b, patchJob);
            if (prompt) {
              setSheet({
                kind: "paperAppt",
                branch: prompt.branchKey,
                step: prompt.step,
                initialDt: prompt.initialDt,
              });
            } else {
              setSheet(null);
            }
          }}
          onSkip={(b) => {
            skipAwarenessBubble(id, b, patchJob);
            setSheet(null);
          }}
          onRevert={(b) => {
            revertAwarenessBubble(id, job, b, patchJob);
            setSheet(null);
          }}
          onOpen={(b) => tapAwarenessBubble(job, b, setSheet, openDocTab)}
          onCalendar={(b) =>
            setSheet({
              kind: "paperAppt",
              branch: b.branchKey,
              step: b.step,
              initialDt: b.date,
            })
          }
        />
      ) : null}
      {sheet?.kind === "changeOrder" ? (
        <ChangeOrderSheet
          sourceLabel={
            job.invoiceNo
              ? "invoice #" + job.invoiceNo
              : job.estimateNo
              ? "estimate #" + job.estimateNo
              : job.title || "this job"
          }
          onPick={startChangeOrder}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet?.kind === "serviceUpgradeGen" && job ? (
        <ServiceUpgradeEstimatorSheet
          onClose={() => setSheet(null)}
          prefill={{
            jobId: job.id,
            id: job.id,
            customer: job.businessName || job.customer || "",
            businessName: job.businessName || job.customer || "",
            personName: job.personName || "",
            email: job.email || "",
            phone: job.phone || "",
            serviceAddress: job.serviceAddress || job.address || "",
            billingAddress: job.billingAddress || "",
            _estimator: job._estimator,
            startStep: sheet.startStep,
          }}
        />
      ) : null}
      {sheet?.kind === "addJobAtAddress" ? (        <AddJobAtAddressSheet
          sourceJob={job}
          jobs={jobs}
          onCreate={confirmAddJobAtAddress}
          onClose={() => setSheet(null)}
        />
      ) : null}
      <JobDocSheets
        sheet={sheet}
        setSheet={setSheet}
        job={job}
        onDocDone={(doneJob, meta) => {
          setOpenStep(null);
          // After convert-from-payment Save, payment sheet is reopened via returnTo.
          // Move orphan payment onto this job when convert finished on a different estimate job.
          const ret = meta?.returnTo;
          if (ret?.kind === "payhist" && ret.editPayId && ret._returnPayJob && doneJob?.id) {
            const fromId = ret._returnPayJob;
            if (String(fromId) !== String(doneJob.id)) {
              const fromLive = effectiveJob(fromId);
              const toLive = effectiveJob(doneJob.id) || doneJob;
              if (fromLive && toLive) {
                const moved = movePayment(fromLive, toLive, ret.editPayId, {});
                if (moved?.patches?.length) {
                  for (const row of moved.patches) patchJob(row.jobId, row.patch);
                }
              }
            }
          }
        }}
      />
    </div>
  );

  // Desktop: two-pane (job list | detail); mobile: detail only.
  // List pane mounts after idle so tapping a transaction opens job info first (no list lag).
  return (
    <div className="lg:grid lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] lg:gap-5 lg:items-start">
      <div className="hidden lg:block sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden lg-scroll-hidden pr-1" data-testid="list-pane">
        {listPaneReady ? (
          <Jobs embedded collapseGroups activeJobId={id} />
        ) : (
          <div className="card px-4 py-8 text-center text-xs text-slate-400" data-testid="list-pane-deferred">
            Loading customers…
          </div>
        )}
      </div>
      {detail}
    </div>
  );
}
