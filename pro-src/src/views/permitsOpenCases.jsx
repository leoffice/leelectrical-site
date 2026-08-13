// Open Cases — the redesigned live-progress surface of the Permits tab.
//
// Approved design: LE-permits-redesign-v2 (Levi 2026-08-13). Two independent
// rails per job (Con Edison / DOB), friendly lighter status type (no heavy
// bold), always-visible last-update line, compact step trail, verification
// indicator, >7-day stale flagging, everything collapsible.
//
// Perf discipline: cards are memoized, expand/collapse is card-local state
// (never re-renders the list), all derivation happens once per board change
// in openCasesView.js.

import React, { memo, useState } from "react";

/* Friendly status tones — lighter font, soft chips (mockup palette). */
const STATUS_TONE = {
  pending: "bg-slate-100 text-slate-600",
  submitted: "bg-blue-50 text-blue-800",
  review: "bg-violet-50 text-violet-800",
  inspect: "bg-teal-50 text-teal-800",
  action: "bg-amber-50 text-amber-900",
  done: "bg-emerald-50 text-emerald-800",
};
const STATUS_ICO = {
  pending: "✏️",
  submitted: "📤",
  review: "📄",
  inspect: "🔎",
  action: "⚠️",
  done: "✅",
};
const VERIFY_TONE = {
  verified: "text-emerald-700",
  submitted: "text-blue-700",
  pending: "text-slate-400",
};
const VERIFY_ICO = { verified: "✓", submitted: "📤", pending: "•" };

/** Top-level Permits tabs: Open Cases · Actions to Deploy. */
export function PermitTopTabs({ active, onChange, casesCount = 0, deployCount = 0, deployAlert = false }) {
  const btn = (id, label, count, alert) => (
    <button
      type="button"
      className={
        "flex-1 flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[13.5px] transition-colors " +
        (active === id
          ? "bg-white text-slate-900 shadow-sm font-semibold"
          : "text-slate-600 font-medium")
      }
      aria-selected={active === id}
      role="tab"
      data-testid={`permits-tab-${id}`}
      onClick={() => onChange(id)}
    >
      {label}
      <span
        className={
          "text-[11px] font-bold min-w-[1.35rem] px-1.5 py-0.5 rounded-full text-center " +
          (alert
            ? "bg-red-600 text-white"
            : active === id
              ? "bg-slate-900 text-white"
              : "bg-slate-300/70 text-slate-700")
        }
      >
        {count}
      </span>
    </button>
  );
  return (
    <div
      className="flex gap-1.5 bg-slate-200/70 rounded-2xl p-1 mb-3"
      role="tablist"
      data-testid="permits-top-tabs"
    >
      {btn("cases", "Open Cases", casesCount, false)}
      {btn("deploy", "Actions to Deploy", deployCount, deployAlert)}
    </div>
  );
}

/** Counts strip: In progress / Needs attention / Completed. */
export function OpenCaseCounts({ counts }) {
  const tile = (n, label, alert) => (
    <div className="flex-1 card px-2 py-2.5 text-center" key={label}>
      <div className={"text-[21px] font-semibold leading-none " + (alert && n ? "text-red-600" : "text-slate-900")}>
        {n}
      </div>
      <div className="text-[11px] text-slate-500 mt-1">{label}</div>
    </div>
  );
  return (
    <div className="flex gap-2 mb-3" data-testid="open-cases-counts">
      {tile(counts.progress, "In progress", false)}
      {tile(counts.needs, "Needs attention", true)}
      {tile(counts.completed, "Completed", false)}
    </div>
  );
}

/** All / Needs-attention filter pills. */
export function OpenCaseFilter({ filter, onFilter, needsCount = 0 }) {
  const pill = (id, label) => (
    <button
      type="button"
      key={id}
      className={
        "px-3.5 py-1.5 rounded-full text-[13px] border transition-colors " +
        (filter === id
          ? "bg-slate-900 text-white border-slate-900 font-semibold"
          : "bg-white text-slate-600 border-slate-200 font-medium")
      }
      data-testid={`open-cases-filter-${id}`}
      onClick={() => onFilter(id)}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-2 mb-3 px-0.5" data-testid="open-cases-filter">
      {pill("all", "All")}
      {pill("needs", `Needs attention${needsCount ? ` (${needsCount})` : ""}`)}
    </div>
  );
}

/** Compact bead trail for one track. */
function TrackRail({ steps }) {
  return (
    <div className="flex items-start mt-3" aria-hidden>
      {steps.map((s, i) => (
        <div key={s.label + i} className="flex-1 flex flex-col items-center relative text-center">
          {i > 0 ? (
            <span
              className={
                "absolute top-[11px] right-1/2 w-full h-[2px] " +
                (s.state !== "todo" ? "bg-emerald-500" : "bg-slate-200")
              }
            />
          ) : null}
          <span
            className={
              "relative z-[1] w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-semibold border-2 " +
              (s.state === "done"
                ? "bg-emerald-500 border-emerald-500 text-white"
                : s.state === "current"
                  ? "bg-white border-blue-500 text-blue-600 ring-4 ring-blue-100"
                  : "bg-slate-100 border-slate-100 text-slate-400")
            }
          >
            {s.state === "done" ? "✓" : i + 1}
          </span>
          <span
            className={
              "text-[10px] mt-1.5 leading-tight max-w-[62px] " +
              (s.state === "current" ? "text-slate-800 font-medium" : "text-slate-400")
            }
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** One agency rail block on a card. */
function OpenCaseTrack({ track }) {
  const coned = track.agency === "coned";
  return (
    <div
      className={
        "rounded-xl border border-slate-200 border-l-4 px-3 pt-3 pb-2 mt-3 " +
        (coned ? "border-l-blue-500" : "border-l-violet-500")
      }
      data-testid="open-case-track"
      data-agency={track.agency}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={
            "text-[11.5px] font-semibold uppercase tracking-wider " +
            (coned ? "text-blue-700" : "text-violet-700")
          }
        >
          {track.agencyLabel}
        </span>
        {track.caseNumber ? (
          <span className="text-[12px] text-slate-400">{track.caseNumber}</span>
        ) : null}
      </div>

      {/* Big clear status — friendly, lighter font (Levi: NOT heavy bold) */}
      <div
        className={
          "flex items-center gap-2.5 mt-2.5 px-3 py-2.5 rounded-xl " +
          (STATUS_TONE[track.tone] || STATUS_TONE.pending)
        }
        data-testid="open-case-status"
      >
        <span className="text-[17px] leading-none" aria-hidden>
          {track.stale ? "🚩" : STATUS_ICO[track.tone] || "•"}
        </span>
        <span className="text-[16px] font-medium tracking-tight">{track.stageLabel}</span>
      </div>

      <TrackRail steps={track.railSteps} />

      {/* Last update + what was submitted — always visible */}
      {track.lastUpdate ? (
        <p className="text-[12.5px] text-slate-500 mt-2.5 mb-1 leading-snug" data-testid="open-case-last-update">
          {track.stale
            ? `No update in ${track.staleDays} days · last: `
            : "Last update: "}
          {track.lastUpdate.text}
          {track.lastUpdate.when ? ` · ${track.lastUpdate.when}` : ""}
        </p>
      ) : null}

      {/* Verification indicator */}
      <p
        className={"text-[12px] mt-0.5 mb-1 font-medium " + (VERIFY_TONE[track.verification.state] || "")}
        data-testid="open-case-verify"
        data-state={track.verification.state}
      >
        {VERIFY_ICO[track.verification.state]} {track.verification.label}
      </p>
    </div>
  );
}

/** Full-history timeline (expanded detail). */
function TrackTimeline({ track }) {
  return (
    <div className="mb-3">
      <h4 className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-2">
        {track.agencyLabel} · full history
      </h4>
      <ul className="space-y-0">
        {track.timeline.map((e, i) => (
          <li
            key={i}
            className={
              "relative pl-5 pb-3 text-[13.5px] leading-snug " +
              (e.state === "now" ? "text-slate-800 font-medium" : "text-slate-500")
            }
          >
            <span
              className={
                "absolute left-0 top-[5px] w-[9px] h-[9px] rounded-full " +
                (e.state === "now" ? "bg-blue-500 ring-4 ring-blue-100" : "bg-emerald-500")
              }
            />
            {e.text}
            {e.when ? <span className="block text-[11px] text-slate-400 mt-0.5">{e.when}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

const BUCKET_CHIP = {
  progress: ["In progress", "bg-blue-50 text-blue-800"],
  needs: ["Needs attention", "bg-red-50 text-red-700"],
  completed: ["Completed", "bg-emerald-50 text-emerald-800"],
};

/**
 * One job card — collapsible; summary always shows both rails with live status.
 * `manage` (optional render prop) supplies the per-track management surface
 * (to-dos, meter app, next-step actions) inside the expanded detail.
 */
export const OpenCaseCard = memo(function OpenCaseCard({ card, onOpenJob, manage }) {
  const [open, setOpen] = useState(false);
  const [chip, chipTone] = BUCKET_CHIP[card.bucket] || BUCKET_CHIP.progress;
  return (
    <div
      className={
        "card overflow-hidden mb-3 " +
        (card.bucket === "needs"
          ? "border border-red-200 ring-1 ring-red-100 bg-gradient-to-b from-white to-red-50/40"
          : card.bucket === "completed"
            ? "opacity-95"
            : "")
      }
      data-testid="open-case-card"
      data-bucket={card.bucket}
      data-job-id={card.jobId || ""}
    >
      <button
        type="button"
        className="w-full text-left px-4 pt-3.5 pb-3"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="open-case-toggle"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[18px] font-semibold text-slate-900 tracking-tight leading-snug truncate">
              {card.address || card.jobName}
            </div>
            <div className="text-[13px] text-slate-500 mt-0.5 truncate">
              {card.address ? card.jobName : ""}
            </div>
          </div>
          <span
            className={
              "shrink-0 w-7 h-7 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-[13px] transition-transform " +
              (open ? "rotate-90" : "")
            }
            aria-hidden
          >
            ›
          </span>
        </div>

        {card.bucket === "needs" ? (
          <div
            className="flex items-center gap-2 mt-2.5 bg-red-50 border border-red-200 text-red-800 rounded-xl px-3 py-2 text-[13.5px] font-medium"
            data-testid="open-case-needs-banner"
          >
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" aria-hidden />
            This needs to be addressed
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${chipTone}`}>{chip}</span>
          <span
            className={
              "text-[11px] font-semibold px-2 py-0.5 rounded-full " +
              (card.hasConed ? "bg-blue-50 text-blue-800" : "bg-slate-100 text-slate-400")
            }
          >
            Con Ed {card.hasConed ? "✓" : "—"}
          </span>
          <span
            className={
              "text-[11px] font-semibold px-2 py-0.5 rounded-full " +
              (card.hasDob ? "bg-violet-50 text-violet-800" : "bg-slate-100 text-slate-400")
            }
          >
            DOB {card.hasDob ? "✓" : "—"}
          </span>
        </div>

        {card.tracks.map((t) => (
          <OpenCaseTrack key={t.key} track={t} />
        ))}
      </button>

      {open ? (
        <div className="px-4 pb-4 pt-3 border-t border-slate-100" data-testid="open-case-detail">
          {card.tracks.map((t) => (
            <TrackTimeline key={`tl:${t.key}`} track={t} />
          ))}
          {manage ? card.tracks.map((t) => <div key={`mg:${t.key}`}>{manage(t)}</div>) : null}
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              className="btn bg-slate-900 text-white !py-2 !px-4 text-[13px] font-semibold"
              data-testid="open-case-open-job"
              onClick={() => onOpenJob?.(card.jobId)}
            >
              Open job
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
});
