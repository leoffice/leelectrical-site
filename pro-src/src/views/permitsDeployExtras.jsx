// Phase-2 Permits UI: inquiry composer + lifecycle chip (Needs-Attention
// cards), renewal pipeline beads (Permits that Expired), and the new-account
// sequence card (stepwise confirmed deploys). Levi 2026-08-13 redesign.

import React, { memo, useState } from "react";
import { describeInquiryPhase } from "../lib/permitInquiry.js";
import { RENEW_PIPE_STEPS } from "../lib/renewPipeline.js";

const CHIP_TONE = {
  sent: "bg-blue-50 text-blue-800",
  confirmed: "bg-teal-50 text-teal-800",
  answered: "bg-emerald-50 text-emerald-800",
  flag: "bg-red-50 text-red-800 border border-red-200",
};

/**
 * Inline Con Ed inquiry surface for a Needs-Attention track: composer when
 * nothing is in flight, lifecycle chip (+ flag/nudge/confirm actions) after.
 * All writes go through the handlers — this component owns only the draft text.
 */
export const InquirySurface = memo(function InquirySurface({
  track,
  onSend,
  onConfirmSubmitted,
  onNudge,
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const iq = track.inquiry;
  if (!iq) return null;
  const phase = iq.phase;

  if (phase === "none") {
    return (
      <div
        className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
        data-testid="inquiry-composer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
          ✍️ Con Edison inquiry
        </div>
        <textarea
          className="input w-full min-h-[64px] text-[14px] bg-white"
          placeholder="Write the inquiry to submit at Energy Services…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          data-testid="inquiry-composer-text"
        />
        <button
          type="button"
          className="btn bg-blue-600 text-white w-full !py-2.5 mt-2 text-[14px] font-semibold disabled:opacity-50"
          disabled={busy || !draft.trim()}
          data-testid="inquiry-composer-send"
          onClick={async () => {
            setBusy(true);
            try {
              await onSend?.(track, draft.trim());
              setDraft("");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Sending…" : "Send inquiry"}
        </button>
        <p className="text-[11px] text-slate-400 text-center mt-1.5 leading-snug">
          Creates a task for Israel — nothing is marked done until Energy Services
          confirms it was submitted.
        </p>
      </div>
    );
  }

  const d = describeInquiryPhase(phase, iq.blob);
  if (!d) return null;
  const flagged = d.tone === "flag";
  return (
    <div
      className={`mt-2.5 rounded-xl px-3 py-2.5 text-[13.5px] ${CHIP_TONE[d.tone] || CHIP_TONE.sent}`}
      data-testid="inquiry-chip"
      data-phase={phase}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex gap-2 items-start">
        <span className="text-[16px] leading-tight" aria-hidden>
          {d.ico}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium leading-snug">{d.label}</div>
          {d.sub ? <div className="text-[12px] opacity-80 mt-0.5">{d.sub}</div> : null}
          {(flagged || phase === "sent") && (onConfirmSubmitted || onNudge) ? (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {flagged && onNudge ? (
                <button
                  type="button"
                  className="btn bg-amber-600 text-white !py-1 !px-2.5 text-[12px] font-semibold"
                  data-testid="inquiry-nudge"
                  onClick={() => onNudge(track)}
                >
                  Re-nudge Israel
                </button>
              ) : null}
              {phase !== "flagged_reply" && onConfirmSubmitted ? (
                <button
                  type="button"
                  className="btn bg-white border border-slate-300 text-slate-700 !py-1 !px-2.5 text-[12px] font-semibold"
                  data-testid="inquiry-confirm-submitted"
                  onClick={() => onConfirmSubmitted(track)}
                >
                  Mark submitted (agent confirmed)
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

/** Compact pipeline beads: Notified → Opted in → Invoiced → Paid → Renew deployed → Completed. */
export function RenewPipelineBeads({ state }) {
  if (!state) return null;
  return (
    <div className="flex gap-1 mt-2.5" data-testid="renew-pipeline" data-key={state.key}>
      {RENEW_PIPE_STEPS.map((label, i) => {
        const done = i < state.idx || state.key === "completed";
        const current = i === state.idx && state.key !== "completed";
        return (
          <div key={label} className="flex-1 text-center">
            <div
              className={
                "h-[5px] rounded-full mb-1 " +
                (done ? "bg-emerald-500" : current ? "bg-blue-500" : "bg-slate-200")
              }
            />
            <div
              className={
                "text-[9.5px] leading-tight " +
                (current
                  ? "text-slate-800 font-semibold"
                  : done
                    ? "text-slate-500"
                    : "text-slate-400")
              }
            >
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const SEQ_PHASE_LABEL = {
  done: ["✅", "Confirmed"],
  sent: ["📤", "Sent — awaiting confirmation"],
  flagged: ["🚩", "No confirmation >24h — flagged"],
  ready: ["●", "Ready to deploy"],
  locked: ["○", "Locked until the prior step is confirmed"],
};

/**
 * New-account stepwise sequence card. One concrete deploy per step; the next
 * unlocks only on confirmation. account_activated is manual-confirm
 * (LEVI-DEFAULT #2); final_checklist is an Israel-task stub (LEVI-DEFAULT #3).
 */
export const NewAccountSequenceCard = memo(function NewAccountSequenceCard({
  seqJob,
  seq,
  onDeployStep,
  onConfirmStep,
  onNudgeStep,
}) {
  return (
    <div
      className="card border border-blue-100 p-3.5 mb-3"
      data-testid="newacct-sequence"
      data-job-id={seqJob.id}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-slate-900 leading-snug truncate">
            {seqJob.serviceAddress || seqJob.address || seqJob.customer} · New meter account
          </div>
          <div className="text-[12.5px] text-slate-500 mt-0.5">
            {seqJob.customer || ""}
            {seqJob.paperwork?.coned?.caseNumber ? ` · Case ${seqJob.paperwork.coned.caseNumber}` : ""}
          </div>
        </div>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 shrink-0">
          Con Ed
        </span>
      </div>

      <div className="flex gap-1 mt-3">
        {seq.steps.map((s, i) => (
          <div key={s.id} className="flex-1 text-center">
            <div
              className={
                "h-[5px] rounded-full mb-1 " +
                (s.phase === "done"
                  ? "bg-emerald-500"
                  : i === seq.currentIndex
                    ? s.phase === "flagged"
                      ? "bg-red-500"
                      : "bg-blue-500"
                    : "bg-slate-200")
              }
            />
            <div
              className={
                "text-[9.5px] leading-tight " +
                (i === seq.currentIndex && s.phase !== "done"
                  ? "text-slate-800 font-semibold"
                  : s.phase === "done"
                    ? "text-slate-500"
                    : "text-slate-400")
              }
            >
              {s.title}
            </div>
          </div>
        ))}
      </div>

      {seq.complete ? (
        <div className="mt-3 rounded-xl bg-emerald-50 text-emerald-800 px-3 py-2.5 text-[13.5px] font-medium">
          ✅ Sequence complete — all four steps confirmed at the agency.
        </div>
      ) : (
        (() => {
          const step = seq.steps[seq.currentIndex];
          if (!step) return null;
          const [ico, phaseLabel] = SEQ_PHASE_LABEL[step.phase] || SEQ_PHASE_LABEL.ready;
          return (
            <div className="mt-3" data-testid="newacct-current-step" data-step={step.id} data-phase={step.phase}>
              <div className="text-[13.5px] text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                Step {seq.currentIndex + 1}: <b className="text-slate-900 font-semibold">{step.title}</b> — {step.what}
                {step.note ? <span className="block text-[11.5px] text-amber-700 mt-1">⚑ {step.note}</span> : null}
              </div>
              <div
                className={
                  "mt-2 text-[13px] px-3 py-2 rounded-lg " +
                  (step.phase === "flagged"
                    ? "bg-red-50 text-red-800 border border-red-200"
                    : step.phase === "sent"
                      ? "bg-blue-50 text-blue-800"
                      : "bg-slate-100 text-slate-600")
                }
              >
                {ico} {phaseLabel}
              </div>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {step.phase === "ready" && !step.manualConfirm ? (
                  <button
                    type="button"
                    className="btn bg-blue-600 text-white flex-1 !py-2.5 text-[13.5px] font-semibold"
                    data-testid="newacct-deploy-step"
                    onClick={() => onDeployStep?.(seqJob, step)}
                  >
                    Deploy — {step.title}
                  </button>
                ) : null}
                {(step.phase === "sent" || step.phase === "flagged" || step.manualConfirm) ? (
                  <button
                    type="button"
                    className="btn bg-white border border-slate-300 text-slate-700 !py-2 !px-3 text-[12.5px] font-semibold"
                    data-testid="newacct-confirm-step"
                    onClick={() => onConfirmStep?.(seqJob, step)}
                  >
                    Mark performed (agent confirmed)
                  </button>
                ) : null}
                {step.phase === "flagged" ? (
                  <button
                    type="button"
                    className="btn bg-amber-600 text-white !py-2 !px-3 text-[12.5px] font-semibold"
                    data-testid="newacct-nudge-step"
                    onClick={() => onNudgeStep?.(seqJob, step)}
                  >
                    Re-nudge Israel
                  </button>
                ) : null}
              </div>
              <p className="text-[11px] text-slate-400 text-center mt-1.5">
                Advances only when we&apos;re notified it actually happened — the next step stays locked until then.
              </p>
            </div>
          );
        })()
      )}
    </div>
  );
});
