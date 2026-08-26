// Email insights (Energy Services / Con Edison / City DOB):
// - New appointment sets → approve / edit / ignore / ignore-and-cancel (never auto-create)
// - Reminders → calendar cross-check only (already-on-calendar notice or quiet dismiss)
// - Completed inspections → may auto-update paperwork, then "done" notice
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Opt } from "./Sheet.jsx";
import PromptSurface from "./PromptSurface.jsx";
import IntelligentSuggestionBadge from "./IntelligentSuggestionBadge.jsx";
import AddAppointmentSheet from "./AddAppointmentSheet.jsx";
import { useStoreData } from "../state/store.jsx";
import {
  enrichInsight,
  appointmentTypeLabel,
  canAutoApply,
  defaultActionKeys,
  formatAppliedLead,
  formatInsightDateLabel,
  formatInsightHoursLabel,
  formatInsightSourceLabel,
  isPastAppointmentInsight,
  hasRealInsightData,
  shouldSurfaceInsight,
} from "../lib/emailInsight.js";
import {
  applyEmailInsight,
  buildCalendarPayload,
  cancelEmailInsightAppointment,
} from "../lib/applyEmailInsight.js";
import {
  collectOpenConedCasesFromInsights,
  planConedCaseJobLinks,
} from "../lib/conedCaseLink.js";
import { updateTodoListFromInsights } from "../lib/conedCustomerTodos.js";
import { shouldSuppressPrompts, beginPromptWorkPause } from "../lib/followUpReminders.js";
import { isScreenCovered, subscribeSheets } from "../lib/sheetRegistry.js";
import { findEventForInsight, stashCalendarPick } from "../lib/calendarNavigate.js";
import { evStart } from "../lib/format.js";

const IS_TEST = import.meta.env.MODE === "test" || !!import.meta.env.VITEST;
const SESSION_KEY = "lepro_email_insight_session";
/** Per app-open: how many calendar auto-applies already ran this session (paperwork only). */
let autoApplyCalendarCount = 0;
/** Test-only: allow Edit-first / Approve card UI without enabling background auto-apply. */
let forceSurfaceInTest = false;
export function __forceEmailInsightSurfaceForTest(on = true) {
  forceSurfaceInTest = !!on;
}
function skipBackgroundInTest() {
  return IS_TEST && !forceSurfaceInTest;
}
function skipSurfaceInTest() {
  return IS_TEST && !forceSurfaceInTest;
}

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
  return (
    <div className="flex flex-wrap items-center gap-2 mb-2" data-testid="email-insight-source">
      <span className="text-[10px] font-bold uppercase tracking-wide text-sky-700 bg-sky-50 border border-sky-100 px-2 py-0.5 rounded-full">
        📧 {formatInsightSourceLabel(insight)}
      </span>
    </div>
  );
}

/** Date + hours + source — the useful facts Levi wants on the calendar notice. */
function InsightWhenBlock({ insight, event }) {
  const start = event?.start || insight?.exactDateTime || insight?.dateTime || "";
  const dateLabel = formatInsightDateLabel(start);
  const hoursLabel = formatInsightHoursLabel(insight, event);
  const sourceLabel = formatInsightSourceLabel(insight);
  const where =
    insight?.address ||
    event?.location ||
    "";
  if (!dateLabel && !hoursLabel && !sourceLabel) return null;
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 mb-3 space-y-1.5"
      data-testid="email-insight-when"
    >
      <div className="flex items-start gap-2 text-sm">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 w-14 shrink-0 pt-0.5">
          Source
        </span>
        <span className="font-semibold text-slate-800">{sourceLabel}</span>
      </div>
      {dateLabel ? (
        <div className="flex items-start gap-2 text-sm" data-testid="email-insight-date">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 w-14 shrink-0 pt-0.5">
            Date
          </span>
          <span className="font-semibold text-slate-800">{dateLabel}</span>
        </div>
      ) : null}
      {hoursLabel ? (
        <div className="flex items-start gap-2 text-sm" data-testid="email-insight-hours">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 w-14 shrink-0 pt-0.5">
            Hours
          </span>
          <span className="font-semibold text-slate-800">{hoursLabel}</span>
        </div>
      ) : null}
      {where ? (
        <div className="flex items-start gap-2 text-sm">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 w-14 shrink-0 pt-0.5">
            Where
          </span>
          <span className="text-slate-700 text-[13px] leading-snug">{where}</span>
        </div>
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

function EmailInsightSheet({
  insight,
  job,
  hasExistingAppointment,
  onApprove,
  onEdit,
  onIgnore,
  onIgnoreAndCancel,
  onOpenJob,
}) {
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

  const isCancelled = (insight?.outcome || "") === "cancelled";

  return (
    <PromptSurface title="Email understood" onClose={onIgnore} testId="email-insight-sheet">
      <SourceBadge insight={insight} />
      <InsightWhenBlock insight={insight} />
      <div className="rounded-xl border border-purple-200 bg-purple-50/80 px-3 py-3 mb-3">
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <IntelligentSuggestionBadge />
          <span className="text-xs font-bold text-purple-800 uppercase tracking-wide">
            {appointmentTypeLabel(insight?.appointmentType, insight?.agency)}
          </span>
        </div>
        <p className="text-sm text-purple-900/90 mb-1">{insight?.lead}</p>
        {insight?.skipReason === "missing_from_calendar" ? (
          <p className="text-xs font-semibold text-amber-800 mt-1">
            Email says this appointment is set, but it is not on your calendar yet — approve to add it.
          </p>
        ) : null}
        {insight?.skipReason === "needs_date" ? (
          <p className="text-xs font-semibold text-amber-800 mt-1">
            Could not read the appointment date from the email — edit the time, then approve.
          </p>
        ) : null}
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

      {!isCancelled ? (
        <Opt
          icon="✅"
          title="Approve"
          note="Apply the checked actions — only then is a new appointment created"
          onClick={() => onApprove([...selected])}
          testId="email-insight-approve"
        />
      ) : null}
      {!isCancelled ? (
        <Opt
          icon="✏️"
          title="Edit first"
          note="Tweak the appointment before saving"
          onClick={onEdit}
          testId="email-insight-edit"
        />
      ) : null}
      {job?.id ? (
        <Opt icon="📂" title="Open job" note={job.customer || job.title || job.id} onClick={onOpenJob} />
      ) : null}
      <Opt
        icon="🗑️"
        title="Ignore and cancel"
        note={
          hasExistingAppointment
            ? "Dismiss this email and cancel the appointment already on your calendar"
            : "Dismiss — cancels the calendar appointment if one is already set"
        }
        onClick={onIgnoreAndCancel}
        testId="email-insight-ignore-cancel"
      />
      <Opt icon="✋" title="Ignore" note="Dismiss only — leave the calendar alone" onClick={onIgnore} testId="email-insight-ignore" />
    </PromptSurface>
  );
}

/** Post-auto notice — already on calendar, or paperwork auto-updated. */
function EmailInsightDoneSheet({ insight, job, event, onAck, onOpenJob, onOpenCalendar, onIgnoreAndCancel }) {
  const lead = insight?.appliedLead || formatAppliedLead(insight, job);
  const outcome = insight?.outcome || "other";
  const hasWhen = !!(event?.start || insight?.dateTime || insight?.exactDateTime);
  const onCal = outcome !== "cancelled" && outcome !== "completed" && hasWhen;
  const isInsp = (insight?.appointmentType || "") === "inspection";
  const title =
    insight?.skipReason === "already_on_calendar" || outcome === "reminder"
      ? "Already on your calendar"
      : "Added to your calendar";
  return (
    <PromptSurface
      title={title}
      onClose={onAck}
      testId="email-insight-done-sheet"
      urgent={isInsp}
    >
      <SourceBadge insight={insight} />
      <InsightWhenBlock insight={insight} event={event} />
      <div
        className={
          isInsp
            ? "rounded-xl border border-red-300/40 bg-red-500/10 px-3 py-3 mb-3 animate-insp-heartbeat"
            : "rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-3 mb-3"
        }
        data-testid="email-insight-done-card"
      >
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <span
            className={
              isInsp
                ? "text-[10px] font-bold uppercase tracking-wide text-red-900 bg-red-500/15 border border-red-300/40 px-2 py-0.5 rounded-full"
                : "text-[10px] font-bold uppercase tracking-wide text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full"
            }
          >
            ✅ Done automatically
          </span>
          <span
            className={
              "text-xs font-bold uppercase tracking-wide " + (isInsp ? "text-red-900" : "text-emerald-900")
            }
          >
            {appointmentTypeLabel(insight?.appointmentType, insight?.agency)}
          </span>
        </div>
        <p
          className={"text-sm mb-1 " + (isInsp ? "text-red-950/90" : "text-emerald-950/90")}
          data-testid="email-insight-done-lead"
        >
          {lead}
        </p>
        {insight?.source?.subject ? (
          <p
            className={"text-xs truncate " + (isInsp ? "text-red-800/70" : "text-emerald-700/80")}
            title={insight.source.subject}
          >
            Re: {insight.source.subject}
          </p>
        ) : null}
      </div>
      {onCal ? (
        <p className="text-xs text-slate-500 mb-3">
          Open the appointment below to check or edit it — date, hours, and address are listed above.
        </p>
      ) : null}
      {onCal ? (
        <Opt
          icon="📅"
          title="Open & edit appointment"
          note="Opens this booking on your schedule so you can check or change it"
          onClick={onOpenCalendar}
          testId="email-insight-open-calendar"
        />
      ) : null}
      {job?.id ? (
        <Opt icon="📂" title="Open job" note={job.customer || job.title || job.id} onClick={onOpenJob} />
      ) : null}
      {onCal && onIgnoreAndCancel ? (
        <Opt
          icon="🗑️"
          title="Cancel this appointment"
          note="Remove it from your calendar and dismiss this notice"
          onClick={onIgnoreAndCancel}
          testId="email-insight-ignore-cancel"
        />
      ) : null}
      <Opt icon="👍" title="Got it" note="Dismiss this notice" onClick={onAck} testId="email-insight-ack" />
    </PromptSurface>
  );
}

export default function EmailInsightPrompts() {
  const {
    jobs,
    events,
    loading,
    emailInsights,
    refreshEmailInsights,
    patchEmailInsight,
    enqueue,
    patchAndSave,
    createJob,
    appendLocalEvent,
    removeLocalEvent,
    pullCalendarNow,
    showToast,
    effectiveJob,
  } = useStoreData();
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
  // Never surface past-day appointments (Levi 2026-07-22) — those auto-ignore.
  const pendingNeedsApprove = useMemo(() => {
    return enrichedAll.filter((x) => {
      if (x.status !== "pending" || seen.current.has(x.id)) return false;
      if (!shouldSurfaceInsight(x)) return false;
      const job = x.jobId ? effectiveJob(x.jobId) : null;
      return !canAutoApply(x, job);
    });
  }, [enrichedAll, effectiveJob]);

  const doneQueue = useMemo(() => {
    return enrichedAll.filter(
      (x) =>
        (x.status === "auto_applied" || (x.autoApplied && x.notified === false)) &&
        x.notified !== true &&
        !seen.current.has(x.id) &&
        // Past-day appointments: no "already on calendar" notice either.
        shouldSurfaceInsight(x)
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
      // Snappy: close the sheet first — never wait on the network (Levi 2026-07-30).
      setCurrent(null);
      setDoneNotice(null);
      try {
        await patchEmailInsight(insight.id, { status: "ignored" });
      } catch {
        showToast("Couldn't save — dismissed locally");
      }
      void refreshEmailInsights();
    },
    [dismiss, patchEmailInsight, refreshEmailInsights, showToast]
  );

  const ignoreAndCancel = useCallback(
    async (insight) => {
      if (!insight?.id) return dismiss();
      const job = insight?.jobId ? effectiveJob(insight.jobId) : null;
      seen.current.add(insight.id);
      // Close first so Cancel never feels stuck waiting on calendar delete.
      setCurrent(null);
      setDoneNotice(null);
      try {
        await cancelEmailInsightAppointment({
          insight,
          job,
          events,
          enqueue,
          patchAndSave,
          patchEmailInsight,
          removeLocalEvent,
          pullCalendarNow,
          showToast,
        });
      } catch (e) {
        showToast(String(e?.message || "Couldn't cancel appointment"));
      }
      void refreshEmailInsights();
    },
    [
      dismiss,
      effectiveJob,
      events,
      enqueue,
      patchAndSave,
      patchEmailInsight,
      removeLocalEvent,
      pullCalendarNow,
      refreshEmailInsights,
      showToast,
    ]
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
          events,
        });
        seen.current.add(insight.id);
        setCurrent(null);
        void refreshEmailInsights();
      } catch (e) {
        showToast(String(e?.message || "Couldn't apply"));
      }
    },
    [
      effectiveJob,
      events,
      enqueue,
      patchAndSave,
      patchEmailInsight,
      appendLocalEvent,
      pullCalendarNow,
      refreshEmailInsights,
      showToast,
    ]
  );

  /** "Got it" on auto-done notice — must feel instant (Levi 2026-07-30: 30s lag). */
  const ackDone = useCallback(
    async (insight) => {
      if (!insight?.id) {
        setDoneNotice(null);
        return;
      }
      seen.current.add(insight.id);
      // Close the sheet on the same tap — network save runs in the background.
      setDoneNotice(null);
      setCurrent(null);
      try {
        await patchEmailInsight(insight.id, {
          notified: true,
          status: insight.status || "auto_applied",
        });
      } catch {
        /* local dismiss is fine — sheet already closed */
      }
      void refreshEmailInsights();
    },
    [patchEmailInsight, refreshEmailInsights]
  );

  // Background housekeeping only — never auto-create calendar appointments
  // (Levi 2026-07-22: wait for Approve). Reminders: cross-check calendar only.
  // Completed inspections may still auto-update paperwork via canAutoApply.
  // Past-day / junk: silent ignore.
  useEffect(() => {
    if (skipBackgroundInTest() || loading || !jobs?.length) return;
    let cancelled = false;
    (async () => {
      for (const raw of emailInsights || []) {
        if (cancelled) break;
        // Also clear already-notified past "done" leftovers so they never reappear.
        if (
          (raw.status === "auto_applied" || raw.autoApplied) &&
          raw.notified !== true &&
          isPastAppointmentInsight(enrichInsight(raw, jobs))
        ) {
          if (autoRunning.current.has(raw.id) || seen.current.has(raw.id)) continue;
          autoRunning.current.add(raw.id);
          try {
            await patchEmailInsight(raw.id, {
              notified: true,
              status: "ignored",
              ignoreReason: "past_appointment",
              appliedAt: new Date().toISOString(),
            });
            seen.current.add(raw.id);
          } catch {
            /* leave */
          } finally {
            autoRunning.current.delete(raw.id);
          }
          continue;
        }
        if (raw.status !== "pending") continue;
        if (autoRunning.current.has(raw.id) || seen.current.has(raw.id)) continue;
        const enriched = enrichInsight(raw, jobs);
        const job = enriched.jobId ? effectiveJob(enriched.jobId) : null;
        const outcome = enriched.outcome || "other";

        // Appointment day already over → quiet dismiss (clears already-generated junk too).
        if (isPastAppointmentInsight(enriched)) {
          autoRunning.current.add(raw.id);
          try {
            await patchEmailInsight(raw.id, {
              status: "ignored",
              ignoreReason: "past_appointment",
              notified: true,
              appliedAt: new Date().toISOString(),
            });
            seen.current.add(raw.id);
          } catch {
            /* leave pending */
          } finally {
            autoRunning.current.delete(raw.id);
          }
          continue;
        }

        // Vague / test / no real facts (subject "x", no address or date) → never show.
        if (!hasRealInsightData(enriched)) {
          autoRunning.current.add(raw.id);
          try {
            await patchEmailInsight(raw.id, {
              status: "ignored",
              ignoreReason: "no_real_data",
              notified: true,
              appliedAt: new Date().toISOString(),
            });
            seen.current.add(raw.id);
          } catch {
            /* leave pending */
          } finally {
            autoRunning.current.delete(raw.id);
          }
          continue;
        }

        // To-Do list / status updates / inquiry acks: silent only — never calendar popup
        // (Levi 2026-08-05: notify only real appointments; to-do → Permits tab + last updated).
        if (outcome === "todo_update" || outcome === "acknowledgment") {
          autoRunning.current.add(raw.id);
          try {
            if (job && canAutoApply(enriched, job)) {
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
                events,
              });
              // To-Do list emails: refresh permit tab todos + last-updated stamp.
              if (outcome === "todo_update") {
                const todoPatch = updateTodoListFromInsights(job, [enriched, ...(emailInsights || [])]);
                if (todoPatch && Object.keys(todoPatch).length) {
                  await patchAndSave(job.id, {
                    ...todoPatch,
                    paperwork: {
                      ...(job.paperwork || {}),
                      ...(todoPatch.paperwork || {}),
                      coned: {
                        ...(job.paperwork?.coned || {}),
                        ...(todoPatch.paperwork?.coned || {}),
                        customerTodosSyncedAt: new Date().toISOString(),
                        todosLastUpdatedAt: new Date().toISOString(),
                      },
                    },
                  });
                } else {
                  // Still stamp last-updated so Levi sees when we last looked.
                  await patchAndSave(job.id, {
                    paperwork: {
                      ...(job.paperwork || {}),
                      coned: {
                        ...(job.paperwork?.coned || {}),
                        enabled: true,
                        todosLastUpdatedAt: new Date().toISOString(),
                        customerTodosSyncedAt: new Date().toISOString(),
                      },
                    },
                  });
                }
              }
              await patchEmailInsight(raw.id, {
                notified: true,
                status: "auto_applied",
                autoApplied: true,
                skipReason: "todo_or_ack_silent",
                appliedAt: new Date().toISOString(),
              });
            } else {
              await patchEmailInsight(raw.id, {
                status: "ignored",
                ignoreReason: outcome === "todo_update" ? "todo_list_no_popup" : "acknowledgment_no_popup",
                notified: true,
                appliedAt: new Date().toISOString(),
              });
            }
            seen.current.add(raw.id);
          } catch {
            /* leave */
          } finally {
            autoRunning.current.delete(raw.id);
          }
          continue;
        }

        // New appointment set that is already on the calendar → "already on calendar"
        // notice (no second create). Still never auto-create when missing.
        // Only real scheduled/rescheduled — NOT "other" (was false-matching To-Do mail).
        if (outcome === "scheduled" || outcome === "rescheduled") {
          const existing = findEventForInsight(enriched, job, events);
          if (existing) {
            autoRunning.current.add(raw.id);
            try {
              await patchEmailInsight(raw.id, {
                status: "auto_applied",
                autoApplied: true,
                notified: false,
                skipReason: "already_on_calendar",
                appliedEventId: existing.id || "",
                jobId: job?.id || enriched.jobId || null,
                appliedAt: new Date().toISOString(),
              });
            } catch {
              /* leave pending for approve */
            } finally {
              autoRunning.current.delete(raw.id);
            }
            continue;
          }
          // Missing on calendar → stay pending for Approve (do not create).
        }

        // Reminder-only mail: leave calendar alone.
        // If already on calendar (and still today/future), show a done notice with facts.
        if (outcome === "reminder") {
          autoRunning.current.add(raw.id);
          try {
            const existing = findEventForInsight(enriched, job, events);
            if (existing) {
              await patchEmailInsight(raw.id, {
                status: "auto_applied",
                autoApplied: true,
                notified: false,
                skipReason: "already_on_calendar",
                appliedEventId: existing.id || "",
                jobId: job?.id || enriched.jobId || null,
                appliedAt: new Date().toISOString(),
              });
            } else {
              await patchEmailInsight(raw.id, {
                status: "ignored",
                ignoreReason: "reminder_not_new_set",
                appliedAt: new Date().toISOString(),
              });
              seen.current.add(raw.id);
            }
          } catch {
            /* leave pending */
          } finally {
            autoRunning.current.delete(raw.id);
          }
          continue;
        }

        // Only completed-inspection paperwork may auto-apply (no calendar create).
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
            events,
          });
          autoApplyCalendarCount += 1;
        } catch {
          /* leave pending for manual approve */
        } finally {
          autoRunning.current.delete(raw.id);
        }
      }

      // Regular audit (Levi 2026-07-30): email said the appointment is set, but it's not
      // on the calendar (or was "approved" without a date). Re-open so LE Pro reminds.
      for (const raw of emailInsights || []) {
        if (cancelled) break;
        const st = raw.status || "";
        if (st !== "approved" && st !== "auto_applied") continue;
        if (autoRunning.current.has(raw.id) || seen.current.has(raw.id)) continue;
        const enriched = enrichInsight(raw, jobs);
        const outcome = enriched.outcome || "other";
        // Never re-open silence classes as missing appointments (Levi 2026-08-05).
        if (
          outcome === "reminder" ||
          outcome === "cancelled" ||
          outcome === "completed" ||
          outcome === "acknowledgment" ||
          outcome === "todo_update" ||
          outcome === "other"
        ) {
          continue;
        }
        if (!shouldSurfaceInsight(enriched)) continue;
        const job = enriched.jobId ? effectiveJob(enriched.jobId) : null;
        const existing = findEventForInsight(enriched, job, events);
        if (existing) {
          if (raw.skipReason !== "already_on_calendar" || !raw.appliedEventId) {
            autoRunning.current.add(raw.id);
            try {
              await patchEmailInsight(raw.id, {
                skipReason: "already_on_calendar",
                appliedEventId: existing.id || raw.appliedEventId || "",
                jobId: job?.id || enriched.jobId || null,
              });
            } catch {
              /* ignore */
            } finally {
              autoRunning.current.delete(raw.id);
            }
          }
          continue;
        }
        autoRunning.current.add(raw.id);
        try {
          await patchEmailInsight(raw.id, {
            status: "pending",
            notified: false,
            autoApplied: false,
            skipReason: "missing_from_calendar",
            healReason: "calendar_audit",
            ...(enriched.dateTime && !raw.dateTime
              ? {
                  dateTime: enriched.dateTime,
                  endDateTime: enriched.endDateTime || "",
                  exactDateTime: enriched.exactDateTime || "",
                  timeWindow: enriched.timeWindow || null,
                  appointmentType: enriched.appointmentType,
                  summary: enriched.summary,
                  lead: enriched.lead,
                }
              : {}),
            jobId: job?.id || enriched.jobId || null,
            updatedAt: new Date().toISOString(),
          });
        } catch {
          /* leave */
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
    events,
    emailInsights,
    effectiveJob,
    enqueue,
    patchAndSave,
    patchEmailInsight,
    appendLocalEvent,
    pullCalendarNow,
    refreshEmailInsights,
  ]);

  // Levi 2026-08-04: open Con Ed MC cases auto-link to matched jobs by address
  // (e.g. 1127 Lincoln Pl). If no job exists, create one and attach the case.
  const caseLinkRan = useRef(false);
  useEffect(() => {
    if (skipBackgroundInTest() || loading || !jobs?.length || !patchAndSave) return;
    if (caseLinkRan.current) return;
    if (!emailInsights?.length) return;
    let cancelled = false;
    (async () => {
      try {
        const cases = collectOpenConedCasesFromInsights(emailInsights);
        if (!cases.length) return;
        const plan = planConedCaseJobLinks({ jobs, cases });
        if (!plan.links.length && !plan.creates.length) return;
        caseLinkRan.current = true;
        for (const link of plan.links) {
          if (cancelled) break;
          await patchAndSave(link.jobId, link.patch);
        }
        if (typeof createJob === "function") {
          for (const c of plan.creates) {
            if (cancelled) break;
            try {
              await createJob(c.fields);
            } catch {
              /* leave unlinked — next open retries */
            }
          }
        }
        if (plan.links.length || plan.creates.length) {
          showToast?.(
            plan.links.length
              ? `Linked ${plan.links.length} Con Ed case${plan.links.length === 1 ? "" : "s"} to jobs`
              : `Created job for open Con Ed case`
          );
        }
      } catch {
        caseLinkRan.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, jobs, emailInsights, patchAndSave, createJob, showToast]);

  // One refresh on becoming ready; the store's own 60s email-insights poll
  // (t7) is the recurring one — the interval here doubled every fetch
  // (perf audit Batch C, 2026-08-11).
  useEffect(() => {
    if (skipBackgroundInTest() || loading) return;
    refreshEmailInsights();
  }, [loading, refreshEmailInsights]);

  // Re-evaluate when any sheet opens/closes so we can open once it clears.
  const [sheetTick, setSheetTick] = useState(0);
  useEffect(() => subscribeSheets(() => setSheetTick((t) => t + 1)), []);

  // Drop a sheet that became past / ignored while it was open.
  useEffect(() => {
    if (current && !shouldSurfaceInsight(current)) {
      seen.current.add(current.id);
      setCurrent(null);
    }
    if (doneNotice && !shouldSurfaceInsight(doneNotice)) {
      seen.current.add(doneNotice.id);
      setDoneNotice(null);
    }
  }, [current, doneNotice, enrichedAll]);

  useEffect(() => {
    if (skipSurfaceInTest() || shouldSuppressPrompts() || hidden || editSheet) return;
    if (current || doneNotice) return;
    if (isScreenCovered()) return;
    // Prefer "done" notices so Levi sees what already landed.
    // Re-check seen.current here — useMemo cache may still hold just-acked ids.
    const nextDone = doneQueue.find((x) => x?.id && !seen.current.has(x.id));
    if (nextDone) {
      setDoneNotice(nextDone);
      if (!sessionAlreadySeen()) markSessionSeen();
      return;
    }
    const nextPending = pendingNeedsApprove.find((x) => x?.id && !seen.current.has(x.id));
    if (nextPending) {
      setCurrent(nextPending);
      if (!sessionAlreadySeen()) markSessionSeen();
    }
  }, [pendingNeedsApprove, doneQueue, current, doneNotice, hidden, editSheet, sheetTick]);

  if (skipSurfaceInTest() || shouldSuppressPrompts() || hidden) return null;
  if (!current && !editSheet && !doneNotice) return null;

  if (doneNotice) {
    const ins = doneNotice;
    const job = ins?.jobId ? effectiveJob(ins.jobId) : null;
    const liveJob = job?.id ? effectiveJob(job.id) : job;
    const matchedEvent =
      findEventForInsight(ins, liveJob, events) ||
      findEventForInsight(ins, job, events) ||
      null;
    return (
      <EmailInsightDoneSheet
        insight={ins}
        job={job}
        event={matchedEvent}
        onAck={() => ackDone(ins)}
        onIgnoreAndCancel={() => ignoreAndCancel(ins)}
        onOpenJob={() => {
          if (!job?.id) return;
          dismiss();
          nav("/job/" + encodeURIComponent(job.id));
        }}
        onOpenCalendar={() => {
          // Open the appointment itself (expand under the week grid) so Levi can check/edit.
          const eid =
            matchedEvent?.id || liveJob?.calEventId || ins?.appliedEventId || "";
          const focusDate = (
            (matchedEvent ? evStart(matchedEvent) : "") ||
            ins?.exactDateTime ||
            ins?.dateTime ||
            ""
          )
            .replace(" ", "T")
            .slice(0, 10);
          stashCalendarPick(eid, { focusDate });
          dismiss();
          nav("/today");
        }}
      />
    );
  }

  const job = current?.jobId ? effectiveJob(current.jobId) : null;
  const currentExisting =
    current && job
      ? findEventForInsight(current, job, events)
      : current
        ? findEventForInsight(current, null, events)
        : null;

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
        guestNotifyDefault={selected.has("guest_email")}
        inspectionPreset={
          ins?.appointmentType === "inspection"
            ? { branch: "coned", step: "Inspection appointment", date: ins?.dateTime }
            : ins?.appointmentType === "meter_installation"
              ? { branch: "coned", step: "Meter installation date", date: ins?.dateTime }
              : null
        }
        onClose={() => {
          // Back out of Edit → restore the Approve card (do not mark seen/ignored).
          setEditSheet(null);
          setHidden(false);
          setCurrent(ins);
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
      hasExistingAppointment={!!currentExisting}
      onApprove={(keys) => approve(current, keys)}
      onEdit={() => {
        // Open the appointment editor — do NOT call dismiss().
        // dismiss() set hidden=true AND cleared editSheet, so "Edit first"
        // made the card vanish with no way back (Levi 2026-08-25).
        setEditSheet({
          insight: current,
          job,
          selected: [...(current?.proposedActions || []).filter((a) => a.defaultOn !== false).map((a) => a.key)],
        });
        setCurrent(null);
      }}
      onIgnore={() => ignore(current)}
      onIgnoreAndCancel={() => ignoreAndCancel(current)}
      onOpenJob={() => {
        if (!job?.id) return;
        dismiss();
        nav("/job/" + encodeURIComponent(job.id));
      }}
    />
  );
}
