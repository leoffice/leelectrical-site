// Job detail — customer card (Call/Text/Email/Map + edit + QBO sync), quick
// views (invoice/estimate/calendar), mark-as-paid, 5-phase progress accordion
// with paperwork branches + scheduled date, follow-up + reminder, notes,
// attachments, send history and the live activity feed (retry on failed).
// All edits are STAGED via store.patchJob and only persist on Save & sync.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useStore } from "../state/store.jsx";
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
  firstVisiblePaperStep,
  isDatedStep,
} from "../lib/paperwork.js";
import { followUpFromPaperworkStep } from "../lib/calendarDue.js";
import { fmt$, ago } from "../lib/format.js";
import CustomerCard from "../components/CustomerCard.jsx";
import JobInfoCard from "../components/JobInfoCard.jsx";
import JobAddressCarousel from "../components/JobAddressCarousel.jsx";
import api from "../data/adapter.js";

import JobEditSheet from "../components/JobEditSheet.jsx";

import {
  canAddChangeOrder,
  carouselVisibleJobs,
  changeOrderJobPatch,
} from "../lib/changeOrder.js";
import { cloneJobAtAddressPatch } from "../lib/customerHierarchy.js";
import ChangeOrderSheet from "../components/ChangeOrderSheet.jsx";
import {
  customerDisplayName,
  calendarServiceLocation,
} from "../lib/customerSync.js";
import {
  amountPaid,
  clientKey,
  customerContact,
  jobsForCustomerKey,
  openBalance,
  paidPct,
} from "../lib/customers.js";
import { touchCustomer } from "../lib/customerRecency.js";
import { GroupJobRow } from "../components/JobCard.jsx";
import { normalizePayments } from "../lib/payments.js";
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
} from "../components/JobSheets.jsx";
import CustomerComposeSheet from "../components/CustomerComposeSheet.jsx";

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
  const foldOnOpen = foldParam === "1"; // job info only until card tap (from customer invoice)
  const goBack = () =>
    fromCust
      ? nav("/customer/" + encodeURIComponent(fromCust) + "?job=" + encodeURIComponent(id))
      : nav("/");
  const {
    effectiveJob,
    patchJob,
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
  const job = effectiveJob(id);
  const custKey = job ? (fromCust || clientKey(job)) : "";
  const customerJobs = useMemo(() => {
    if (!job || !custKey) return job ? [job] : [];
    return sortJobs(jobsForCustomerKey(jobs, custKey));
  }, [job, jobs, custKey]);
  useEffect(() => {
    if (!job) return;
    touchCustomer(custKey, customerJobs.length ? customerJobs : [job]);
  }, [id, custKey, job?.id, customerJobs]);
  const siblingJobs = useMemo(() => customerJobs.filter((j) => j.id !== job?.id), [customerJobs, job?.id]);
  const addressJobs = useMemo(() => {
    if (!job) return [];
    return sortJobs(carouselVisibleJobs(jobs, job));
  }, [job, jobs]);

  // If a requisition project is linked to this job (by jobId or shared customer
  // key) and has requisitions, surface a jump-to-requisition affordance.
  const [reqProjectId, setReqProjectId] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!job) {
        setReqProjectId("");
        return;
      }
      try {
        const projects = (await api.getProjects()) || [];
        const jk = clientKey(job);
        const match = projects.find(
          (p) =>
            (p.jobId && p.jobId === job.id) ||
            (p.customerKey && jk && p.customerKey === jk)
        );
        const has = match && ((match.requisitions || []).length > 0 || match.requisitionEnabled);
        if (alive) setReqProjectId(has ? match.id : "");
      } catch {
        if (alive) setReqProjectId("");
      }
    })();
    return () => {
      alive = false;
    };
  }, [job?.id]);

  const addJobAtAddress = async () => {
    if (!job) return;
    const patch = cloneJobAtAddressPatch(job);
    const newId = await createJob(patch);
    if (newId) {
      showToast("New job at this address — add details when ready");
      const q = fromCust ? "?from=" + encodeURIComponent(fromCust) : "";
      nav("/job/" + newId + q);
    }
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
      showToast(label + " started — fill in the description and send when ready");
      const q = fromCust ? "?from=" + encodeURIComponent(fromCust) : "";
      nav("/job/" + newId + q);
      setSheet({ kind: "docBuild", docKind: kind, mode: "create" });
    }
  };
  const openPay = sp.get("pay") === "1";
  const openDoc = sp.get("doc"); // estimate | invoice
  const openDocCreate = sp.get("create") === "1";
  const [openPhase, setOpenPhase] = useState(null); // null = auto
  const [openStep, setOpenStep] = useState(null);
  const [showRemoved, setShowRemoved] = useState({}); // paperwork branch -> expanded
  const [sheet, setSheet] = useState(null); // {kind, ...}
  const [detailSectionsExpanded, setDetailSectionsExpanded] = useState(!foldOnOpen);
  const stepTimer = useRef(null);
  const jobInfoRef = useRef(null);

  const scrollToJobInfo = useCallback(() => {
    const el = jobInfoRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
  }, []);

  useEffect(() => {
    setDetailSectionsExpanded(foldParam !== "1");
  }, [id, foldParam]);

  useEffect(() => {
    requestAnimationFrame(scrollToJobInfo);
  }, [id, scrollToJobInfo]);

  const toggleDetailSections = () => {
    setDetailSectionsExpanded((v) => !v);
    requestAnimationFrame(scrollToJobInfo);
  };

  useEffect(() => {
    if (openPay && job) setSheet({ kind: "paymenu" });
    if (openDocCreate && job && (openDoc === "estimate" || openDoc === "invoice")) {
      setSheet({ kind: "docBuild", docKind: openDoc, mode: "create" });
    }
  }, [openPay, openDoc, openDocCreate, job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    enqueue(
      "calendar_upsert",
      id,
      {
        calEventId: job.calEventId || "",
        summary: (job.title || "Job") + " — " + (job.customer || ""),
        start: d,
        location: calendarServiceLocation(job),
        description: "Scheduled from LE Pro",
      },
      "judgment",
      "sched:" + id + ":" + d
    );
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

      {/* Customer card — contact on top, compact actions, edit + sync */}
      <CustomerCard
        contact={{
          ...customerContact(customerJobs),
          name: customerDisplayName(job) || job.customer,
        }}
        showSummary={false}
        primaryJob={job}
        onEdit={() => setSheet({ kind: "cust" })}
        onText={() => setSheet({ kind: "compose", channel: "sms" })}
        onEmail={() => setSheet({ kind: "compose", channel: "email" })}
      />

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
            onAddJob={addJobAtAddress}
            onEditJob={() => setSheet({ kind: "jobedit" })}
            onEstimate={(j) => openDocTab(j, "estimate", setSheet)}
            onInvoice={(j) => openDocTab(j, "invoice", setSheet)}
            onPayment={() => setSheet({ kind: "paymenu" })}
            onCalendar={(j) => openDocTab(j, "calendar", setSheet)}
            onBubbleTap={(j, bubble) => tapAwarenessBubble(j, bubble, setSheet, openDocTab)}
            onCardTap={toggleDetailSections}
          />
        ) : (
          <JobInfoCard
            job={job}
            events={events}
            commands={commands}
            sasCalls={sasCalls}
            showOpenLink={false}
            onCardTap={toggleDetailSections}
            onEditJob={() => setSheet({ kind: "jobedit" })}
            onAddJob={addJobAtAddress}
            onAddChangeOrder={() => setSheet({ kind: "changeOrder" })}
            canAddChangeOrder={canAddChangeOrder(jobs, job)}
            onEstimate={() => openDocTab(job, "estimate", setSheet)}
            onInvoice={() => openDocTab(job, "invoice", setSheet)}
            onPayment={() => setSheet({ kind: "paymenu" })}
            onCalendar={() => openDocTab(job, "calendar", setSheet)}
            onBubbleTap={(bubble) => tapAwarenessBubble(job, bubble, setSheet, openDocTab)}
            onJumpToRequisition={reqProjectId ? () => nav("/projects/" + reqProjectId) : undefined}
          />
        )}
      </div>

      {!detailSectionsExpanded && siblingJobs.length > 0 ? (
        <div className="space-y-2" data-testid="customer-sibling-jobs">
          <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider px-1">
            Other jobs ({siblingJobs.length})
          </h2>
          <div className="space-y-1.5">
            {siblingJobs.map((j) => (
              <GroupJobRow key={j.id} job={j} />
            ))}
          </div>
        </div>
      ) : null}

      {detailSectionsExpanded ? (
      <>
      {/* Job timer (clock in/out) removed from Job Information per Phase 3 —
          time tracking remains on the Time tab. */}

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
                                    Edit estimate
                                  </button>
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
                                    Turn to invoice
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
                                    Edit invoice
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
                                  {br.enabled &&
                                    PAPER[k].steps
                                      .filter((ps) => !(br.removed && br.removed[ps]))
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
            value={fu.text || ""}
            onChange={(e) => setFu({ text: e.target.value })}
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
            value={job.notes || ""}
            onChange={(e) => patchJob(id, { notes: e.target.value })}
            aria-label="Notes"
          />
        </div>
      </div>

      {/* Attachments */}
      <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider px-1 !mb-[-6px]">Attachments</h2>
      <div className="card px-4 py-4">
        {at.length ? (
          at.map((a, i) => (
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
          ))
        ) : (
          <div className="text-sm text-slate-400 mb-2">No attachments yet.</div>
        )}
        <button className="btn bg-brand-soft text-brand w-full !py-2 mt-2" onClick={() => setSheet({ kind: "attach" })}>
          ＋ Add attachment
        </button>
      </div>

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
      {sheet?.kind === "menu" && (
        <MenuSheet job={job} onClose={() => setSheet(null)} onCombine={() => setSheet({ kind: "combine" })} />
      )}
      {sheet?.kind === "combine" && <CombineSheet job={job} onClose={() => setSheet(null)} />}
      {sheet?.kind === "payintro" && (
        <PaymentIntroSheet
          onClose={() => setSheet(null)}
          onAttachPicture={() => setSheet({ kind: "paid", initialMethod: "Check", openProofPicker: true })}
          onPickMethod={(method) => setSheet({ kind: "paid", initialMethod: method })}
        />
      )}
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
          job={job}
          onClose={() => setSheet(null)}
          onAddPayment={() => setSheet({ kind: "paid" })}
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
      <JobDocSheets sheet={sheet} setSheet={setSheet} job={job} onDocDone={() => setOpenStep(null)} />
    </div>
  );

  // Desktop: two-pane (job list | detail); mobile: detail only.
  return (
    <div className="lg:grid lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] lg:gap-5 lg:items-start">
      <div className="hidden lg:block sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden lg-scroll-hidden pr-1" data-testid="list-pane">
        <Jobs embedded collapseGroups activeJobId={id} />
      </div>
      {detail}
    </div>
  );
}
