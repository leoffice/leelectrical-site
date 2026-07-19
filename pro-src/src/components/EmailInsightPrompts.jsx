// Pending email insights (Energy Services / Con Edison) — approve, edit, or ignore.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sheet, { Opt } from "./Sheet.jsx";
import IntelligentSuggestionBadge from "./IntelligentSuggestionBadge.jsx";
import AddAppointmentSheet from "./AddAppointmentSheet.jsx";
import { useStore } from "../state/store.jsx";
import { enrichInsight, appointmentTypeLabel } from "../lib/emailInsight.js";
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
  const [editSheet, setEditSheet] = useState(null);
  const [hidden, setHidden] = useState(false);
  const seen = useRef(new Set());

  const pending = useMemo(() => {
    return (emailInsights || [])
      .filter((x) => x.status === "pending" && !seen.current.has(x.id))
      .map((x) => enrichInsight(x, jobs));
  }, [emailInsights, jobs]);

  const dismiss = useCallback(() => {
    beginPromptWorkPause();
    setHidden(true);
    setCurrent(null);
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
    if (!pending.length) return;
    // Never stack on another sheet — its dimmer would swallow clicks.
    if (!current && !isScreenCovered()) setCurrent(pending[0]);
    if (!sessionAlreadySeen()) markSessionSeen();
  }, [pending, current, hidden, editSheet, sheetTick]);

  if (IS_TEST || shouldSuppressPrompts() || hidden) return null;
  if (!current && !editSheet) return null;

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
        setEditSheet({ insight: current, job, selected: [...(current?.proposedActions || []).filter((a) => a.defaultOn !== false).map((a) => a.key)] });
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