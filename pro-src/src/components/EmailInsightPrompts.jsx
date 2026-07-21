// Email insights (Energy Services / Con Edison):
// - Strong job match → auto-add to calendar, then show a "done" notice
// - Weak / no match → approve, edit, or ignore sheet
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sheet, { Opt } from "./Sheet.jsx";
import IntelligentSuggestionBadge from "./IntelligentSuggestionBadge.jsx";
import AddAppointmentSheet from "./AddAppointmentSheet.jsx";
import { useStore } from "../state/store.jsx";
import {
  enrichInsight,
  appointmentTypeLabel,
  canAutoApply,
  defaultActionKeys,
  formatAppliedLead,
} from "../lib/emailInsight.js";
import { applyEmailInsight, buildCalendarPayload } from "../lib/applyEmailInsight.js";
import { shouldSuppressPrompts, beginPromptWorkPause } from "../lib/followUpReminders.js";
import { isScreenCovered, subscribeSheets } from "../lib/sheetRegistry.js";

const IS_TEST = import.meta.env.MODE === "test" || !!import.meta.env.VITEST;
const SESSION_KEY = "lepro_email_insight_session";

function markSessionSeen() {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

function sessionAlreadySeen() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function SourceBadge({ insight }) {
  const src = insight?.source || {};
  return (
    <div className="flex flex-wrap items-center gap-2 mb-2" data-testid="email-insight-source">
      <span className="text-[10px] font-bold uppercase tracking-wide text-sky-700 bg-sky-50 border border-sky-100 px-2 py-0.5 rounded-full">
        📧 {src.type === "email" ? "Email" : src.type || "Source"} · {src.fromLabel || "Unknown"}
      </span>
      {src.receivedAt ? (
        <span className="text-[10px] text-slate-400">{String(src.receivedAt).slice(0, 16).replace("T", " ")}</span>
      ) : null}
    </div>
  );
}

function ActionToggles({ actions, selected, onToggle }) {
  if (!actions?.length) return null;
  return (
    <div className="space-y-2 mb-4" data-testid="email-insight-actions">
      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">I'll do this</div>
      {actions.map((a) => (
        <label
          key={a.key}
          className={`flex items-start gap-2 text-sm rounded-lg border px-3 py-2 cursor-pointer ${
            selected.has(a.key) ? "border-brand/30 bg-brand-soft/40" : "border-slate-200 bg-white"
          } ${a.enabled === false ? "opacity-50" : ""}`}
        >
          <input
            type="checkbox"
            className="mt-0.5"
            checked={selected.has(a.key)}
            disabled={a.enabled === false}
            onChange={() => onToggle(a.key)}
          />
          <span>{a.label}</span>
        </label>
      ))}
    </div>
  );
}

function EmailInsightSheet({ insight, job, onApprove, onEdit, onIgnore, onOpenJob }) {
  const [selected, setSelected] = useState(() => {
    const s = new Set();
    for (const a of insight?.proposedActions || []) {
      if (a.defaultOn !== false) s.add(a.key);
    }
    return s;
  });

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Sheet title="Email understood" onClose={onIgnore} testId="email-insight-sheet">
      <SourceBadge insight={insight} />
      <div className="rounded-xl border border-purple-200 bg-purple-50/80 px-3 py-3 mb-3">
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <IntelligentSuggestionBadge />
          <span className="text-xs font-bold text-purple-800 uppercase tracking-wide">
            {appointmentTypeLabel(insight?.appointmentType)}
          </span>
        </div>
        <p className="text-sm text-purple-900/90 mb-1">{insight?.lead}</p>
        {insight?.source?.subject ? (
          <p className="text-xs text-purple-600/80 truncate" title={insight.source.subject}>
            Re: {insight.source.subject}
          </p>
        ) : null}
      </div>

      {insight?.emailSnippet ? (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-2 mb-3 whitespace-pre-wrap max-h-24 overflow-y-auto">
          {insight.emailSnippet}
        </p>
      ) : null}

      <ActionToggles actions={insight?.proposedActions} selected={selected} onToggle={toggle} />

      <Opt
        icon="✅"
        title="Approve"
        note="Apply the checked actions"
        onClick={() => onApprove([...selected])}
        testId="email-insight-approve"
      />
      <Opt icon="✏️" title="Edit first" note="Tweak the appointment before saving" onClick={onEdit} testId="email-insight-edit" />
      {job?.id ? (
        <Opt icon="📂" title="Open job" note={job.customer || job.title || job.id} onClick={onOpenJob} />
      ) : null}
      <Opt icon="✋" title="Ignore" note="Dismiss — won't ask again for this email" onClick={onIgnore} testId="email-insight-ignore" />
    </Sheet>
  );
}

/** Post-auto-apply notice — tells Levi the calendar/job was already updated. */
function EmailInsightDoneSheet({ insight, job, onAck, onOpenJob, onOpenCalendar }) {
  const lead = insight?.appliedLead || formatAppliedLead(insight, job);
  const outcome = insight?.outcome || "other";
  const onCal = outcome !== "cancelled" && outcome !== "completed" && insight?.dateTime;
  return (
    <Sheet title="Already on your calendar" onClose={onAck} testId="email-insight-done-sheet">
      <SourceBadge insight={insight} />
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-3 mb-3">
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
            ✅ Done automatically
          </span>
          <span className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
            {appointmentTypeLabel(insight?.appointmentType)}
          </span>
        </div>
        <p className="text-sm text-emerald-950/90 mb-1" data-testid="email-insight-done-lead">
          {lead}
        </p>
        {insight?.source?.subject ? (
          <p className="text-xs text-emerald-700/80 truncate" title={insight.source.subject}>
            Re: {insight.source.subject}
          </p>
        ) : null}
      </div>
      {onCal ? (
        <p className="text-xs text-slate-500 mb-3">
          Check Today or the schedule calendar — it should be there (syncing if you just opened the app).
        </p>
      ) : null}
      {job?.id ? (
        <Opt icon="📂" title="Open job" note={job.customer || job.title || job.id} onClick={onOpenJob} />
      ) : null}
      {onCal ? (
        <Opt icon="📅" title="Open schedule calendar" note="See it on the calendar" onClick={onOpenCalendar} />
      ) : null}
      <Opt icon="👍" title="Got it" note="Dismiss this notice" onClick={onAck} testId="email-insight-ack" />
    </Sheet>
  );
}

export default function EmailInsightPrompts() {
  const {
    jobs,
    loading,
    emailInsights,
    refreshEmailInsights,
    patchEmailInsight,
    enqueue,
    patchAndSave,
    appendLocalEvent,
    pullCalendarNow,
    showToast,
    effectiveJob,
  } = useStore();
  const nav = useNavigate();
  const [current, setCurrent] = useState(null);
  const [doneNotice, setDoneNotice] = useState(null);
  const [editSheet, setEditSheet] = useState(null);
  const [hidden, setHidden] = useState(false);
  const seen = useRef(new Set());
  const autoRunning = useRef(new Set());

  const enrichedAll = useMemo(() => {
    return (emailInsights || []).map((x) => enrichInsight(x, jobs));
  }, [emailInsights, jobs]);

  // Pending that still need Levi (weak match / no date) — strong matches auto-apply silently.
  const pendingNeedsApprove = useMemo(() => {
    return enrichedAll.filter((x) => {
      if (x.status !== "pending" || seen.current.has(x.id)) return false;
      const job = x.jobId ? effectiveJob(x.jobId) : null;
      return !canAutoApply(x, job);
    });
  }, [enrichedAll, effectiveJob]);

  const doneQueue = useMemo(() => {
    return enrichedAll.filter(
      (x) =>
        (x.status === "auto_applied" || (x.autoApplied && x.notified === false)) &&
        x.notified !== true &&
        !seen.current.has(x.id)
    );
  }, [enrichedAll]);

  const dismiss = useCallback(() => {
    beginPromptWorkPause();
    setHidden(true);
    setCurrent(null);
    setDoneNotice(null);
    setEditSheet(null);
  }, []);

  const ignore = useCallback(
    async (insight) => {
      if (!insight?.id) return dismiss();
      seen.current.add(insight.id);
      try {
        await patchEmailInsight(insight.id, { status: "ignored" });
      } catch {
        showToast("Couldn't save — dismissed locally");
      }
      setCurrent(null);
      await refreshEmailInsights();
    },
    [dismiss, patchEmailInsight, refreshEmailInsights, showToast]
  );

  const approve = useCallback(
    async (insight, selectedKeys) => {
      const job = insight?.jobId ? effectiveJob(insight.jobId) : null;
      try {
        await applyEmailInsight({
          insight,
          job,
          selectedActionKeys: selectedKeys,
          enqueue,
          patchAndSave,
          patchEmailInsight,
          appendLocalEvent,
          pullCalendarNow,
          showToast,
          autoApply: false,
        });
        seen.current.add(insight.id);
        setCurrent(null);
        await refreshEmailInsights();
      } catch (e) {
        showToast(String(e?.message || "Couldn't apply"));
      }
    },
    [
      effectiveJob,
      enqueue,
      patchAndSave,
      patchEmailInsight,
      appendLocalEvent,
      pullCalendarNow,
      refreshEmailInsights,
      showToast,
    ]
  );

  const ackDone = useCallback(
    async (insight) => {
      if (!insight?.id) return;
      seen.current.add(insight.id);
      try {
        await patchEmailInsight(insight.id, { notified: true, status: insight.status || "auto_applied" });
      } catch {
        /* local dismiss is fine */
      }
      setDoneNotice(null);
      await refreshEmailInsights();
    },
    [patchEmailInsight, refreshEmailInsights]
  );

  // Auto-apply strong matches in the background.
  useEffect(() => {
    if (IS_TEST || loading || !jobs?.length) return;
    let cancelled = false;
    (async () => {
      for (const raw of emailInsights || []) {
        if (cancelled) break;
        if (raw.status !== "pending") continue;
        if (autoRunning.current.has(raw.id) || seen.current.has(raw.id)) continue;
        const enriched = enrichInsight(raw, jobs);
        const job = enriched.jobId ? effectiveJob(enriched.jobId) : null;
        if (!canAutoApply(enriched, job)) continue;
        autoRunning.current.add(raw.id);
        try {
          await applyEmailInsight({
            insight: enriched,
            job,
            selectedActionKeys: defaultActionKeys(enriched, job),
            enqueue,
            patchAndSave,
            patchEmailInsight,
            appendLocalEvent,
            pullCalendarNow,
            showToast: null,
            autoApply: true,
          });
        } catch {
          /* leave pending for manual approve */
        } finally {
          autoRunning.current.delete(raw.id);
        }
      }
      if (!cancelled) await refreshEmailInsights();
    })();
    return () => {
      cancelled = true;
    };
  }, [
    loading,
    jobs,
    emailInsights,
    effectiveJob,
    enqueue,
    patchAndSave,
    patchEmailInsight,
    appendLocalEvent,
    pullCalendarNow,
    refreshEmailInsights,
  ]);

  useEffect(() => {
    if (IS_TEST || loading) return;
    refreshEmailInsights();
    const iv = setInterval(refreshEmailInsights, 60_000);
    return () => clearInterval(iv);
  }, [loading, refreshEmailInsights]);

  // Re-evaluate when any sheet opens/closes so we can open once it clears.
  const [sheetTick, setSheetTick] = useState(0);
  useEffect(() => subscribeSheets(() => setSheetTick((t) => t + 1)), []);

  useEffect(() => {
    if (IS_TEST || shouldSuppressPrompts() || hidden || editSheet) return;
    if (current || doneNotice) return;
    if (isScreenCovered()) return;
    // Prefer "done" notices so Levi sees what already landed.
    if (doneQueue.length) {
      setDoneNotice(doneQueue[0]);
      if (!sessionAlreadySeen()) markSessionSeen();
      return;
    }
    if (pendingNeedsApprove.length) {
      setCurrent(pendingNeedsApprove[0]);
      if (!sessionAlreadySeen()) markSessionSeen();
    }
  }, [pendingNeedsApprove, doneQueue, current, doneNotice, hidden, editSheet, sheetTick]);

  if (IS_TEST || shouldSuppressPrompts() || hidden) return null;
  if (!current && !editSheet && !doneNotice) return null;

  if (doneNotice) {
    const ins = doneNotice;
    const job = ins?.jobId ? effectiveJob(ins.jobId) : null;
    return (
      <EmailInsightDoneSheet
        insight={ins}
        job={job}
        onAck={() => ackDone(ins)}
        onOpenJob={() => {
          if (!job?.id) return;
          dismiss();
          nav("/job/" + encodeURIComponent(job.id));
        }}
        onOpenCalendar={() => {
          dismiss();
          nav("/today");
        }}
      />
    );
  }

  const job = current?.jobId ? effectiveJob(current.jobId) : null;

  if (editSheet) {
    const ins = editSheet.insight;
    const j = editSheet.job;
    const selected = new Set(editSheet.selected || []);
    const payload = buildCalendarPayload(ins, j, selected);
    return (
      <AddAppointmentSheet
        job={j}
        defaultDate={ins?.dateTime}
        defaultSummary={payload.summary}
        defaultLocation={payload.location}
        defaultNotes={payload.description}
        inspectionPreset={
          ins?.appointmentType === "inspection"
            ? { branch: "coned", step: "Inspection appointment", date: ins?.dateTime }
            : ins?.appointmentType === "meter_installation"
              ? { branch: "coned", step: "Meter installation date", date: ins?.dateTime }
              : null
        }
        onClose={() => {
          setEditSheet(null);
          setHidden(false);
        }}
        onSaved={async () => {
          seen.current.add(ins.id);
          await patchEmailInsight(ins.id, { status: "approved", approvedAt: new Date().toISOString() });
          setEditSheet(null);
          setCurrent(null);
          await refreshEmailInsights();
        }}
      />
    );
  }

  return (
    <EmailInsightSheet
      insight={current}
      job={job}
      onApprove={(keys) => approve(current, keys)}
      onEdit={() => {
        setEditSheet({
          insight: current,
          job,
          selected: [...(current?.proposedActions || []).filter((a) => a.defaultOn !== false).map((a) => a.key)],
        });
        dismiss();
      }}
      onIgnore={() => ignore(current)}
      onOpenJob={() => {
        if (!job?.id) return;
        dismiss();
        nav("/job/" + encodeURIComponent(job.id));
      }}
    />
  );
}
