// Job detail — customer card (Call/Text/Email/Map), key-values, 5-phase
// progress accordion (tap a step -> Complete / Skip / Undo), follow-up +
// notes editors, and the activity feed from the command bus.
// All edits are STAGED via store.patchJob and only persist on Save.
import React, { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import { PHASES, currentStage, isPaid, phaseOfStage, progressPct, stepState, todayStr } from "../lib/stages.js";
import { PaidPill, StagePill } from "../components/JobCard.jsx";

const FOLLOWUP_TYPES = [
  "Acceptance",
  "Payment / collect",
  "Schedule the job",
  "Paperwork / permits",
  "Con Edison case",
  "Final inspection",
  "Other",
];

const CMD_TONES = {
  queued: "bg-amber-100 text-amber-700",
  working: "bg-sky-100 text-sky-700",
  done: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  needs_approval: "bg-violet-100 text-violet-700",
};

function ActionButton({ href, icon, label, disabled }) {
  return (
    <a
      href={disabled ? undefined : href}
      className={`flex-1 flex flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-semibold transition-colors ${
        disabled ? "bg-slate-50 text-slate-300" : "bg-brand-soft text-brand hover:bg-brand hover:text-white"
      }`}
      onClick={(e) => disabled && e.preventDefault()}
    >
      <span className="text-lg leading-none">{icon}</span>
      {label}
    </a>
  );
}

function Step({ job, stage, onSet }) {
  const [open, setOpen] = useState(false);
  const s = stepState(job, stage);
  const d = (job.status || {})[stage]?.d;
  const cur = currentStage(job) === stage;
  const mark =
    s === "done" ? ["✓", "bg-emerald-500 text-white"] :
    s === "skipped" ? ["–", "bg-slate-300 text-white"] :
    cur ? ["●", "bg-brand text-white"] : ["○", "bg-slate-100 text-slate-400"];

  return (
    <div className="border-t border-slate-100 first:border-t-0">
      <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(!open)}>
        <span className={`grid place-items-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${mark[1]}`}>
          {mark[0]}
        </span>
        <span
          className={`text-sm ${
            s === "done" ? "text-slate-700" : s === "skipped" ? "text-slate-400 line-through" : cur ? "font-semibold text-slate-900" : "text-slate-500"
          }`}
        >
          {stage}
        </span>
        {d && <span className="ml-auto text-[11px] text-slate-400">{d}</span>}
      </button>
      {open && (
        <div className="flex gap-2 px-4 pb-3">
          <button
            className="btn bg-emerald-500 text-white flex-1 !py-2"
            onClick={() => { onSet(stage, { s: "done", d: todayStr() }); setOpen(false); }}
          >
            ✓ Complete
          </button>
          <button
            className="btn bg-slate-200 text-slate-600 flex-1 !py-2"
            onClick={() => { onSet(stage, { s: "skipped" }); setOpen(false); }}
          >
            Skip
          </button>
          <button
            className="btn-ghost flex-1 !py-2"
            onClick={() => { onSet(stage, { s: "" }); setOpen(false); }}
          >
            ↺ Undo
          </button>
        </div>
      )}
    </div>
  );
}

export default function JobDetail() {
  const { id } = useParams();
  const { effectiveJob, patchJob, commands, pending, loading } = useStore();
  const job = effectiveJob(id);
  const [openPhase, setOpenPhase] = useState(null); // null = auto (phase of current stage)

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

  const setStep = (stage, st) => patchJob(id, { status: { [stage]: st } });
  const fu = job.followUp || {};
  const setFu = (patch) => patchJob(id, { followUp: { ...fu, ...patch } });
  const autoPhase = phaseOfStage(currentStage(job) || "Paid");
  const openIdx = openPhase !== null ? openPhase : PHASES.indexOf(autoPhase);
  const dirty = !!pending[id];
  const mapQ = encodeURIComponent(job.address || "");

  return (
    <div className="space-y-3.5">
      <Link to="/" className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
        ← Jobs
      </Link>

      {/* Customer card */}
      <div className="card px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br from-brand to-accent text-white font-bold shrink-0">
            {(job.customer || "?").trim().slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="font-extrabold text-slate-900 leading-tight">{job.customer || "(no customer)"}</div>
            <div className="text-sm text-slate-500">{job.title}</div>
            <div className="mt-1.5 flex gap-1.5 flex-wrap">
              <StagePill job={job} />
              <PaidPill job={job} />
              {dirty && <span className="pill bg-amber-100 text-amber-700">unsaved</span>}
            </div>
          </div>
          <div className="ml-auto text-right font-extrabold text-lg text-slate-900 shrink-0">{job.amount || "—"}</div>
        </div>
        <div className="flex gap-2 mt-4">
          <ActionButton href={`tel:${job.phone}`} icon="📞" label="Call" disabled={!job.phone} />
          <ActionButton href={`sms:${job.phone}`} icon="💬" label="Text" disabled={!job.phone} />
          <ActionButton href={`mailto:${job.email}`} icon="✉️" label="Email" disabled={!job.email} />
          <ActionButton
            href={`https://maps.google.com/?q=${mapQ}`}
            icon="📍"
            label="Map"
            disabled={!job.address || /not on file|TBD/i.test(job.address)}
          />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {[
            ["Job ID", job.id],
            ["Estimate #", job.estimateNo || "—"],
            ["Invoice #", job.invoiceNo || "—"],
            ["Phone", job.phone || "—"],
            ["Email", job.email || "—", "col-span-2"],
            ["Address", job.address || "—", "col-span-2"],
          ].map(([k, v, span]) => (
            <div key={k} className={span || ""}>
              <dt className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{k}</dt>
              <dd className="text-slate-800 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Progress — 5 phases */}
      <div className="card overflow-hidden">
        <div className="px-4 pt-4 pb-3 flex items-center gap-3">
          <h2 className="font-bold text-slate-900">Progress</h2>
          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand to-accent"
              style={{ width: `${progressPct(job)}%` }}
            />
          </div>
          <span className="text-xs font-bold text-slate-500">{progressPct(job)}%</span>
        </div>
        {PHASES.map((ph, i) => {
          const clearCount = ph.steps.filter(
            (s) => stepState(job, s) === "done" || stepState(job, s) === "skipped"
          ).length;
          const isOpen = openIdx === i;
          return (
            <div key={ph.nm} className="border-t border-slate-100">
              <button
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-left ${isOpen ? "bg-brand-soft/50" : ""}`}
                onClick={() => setOpenPhase(isOpen ? -1 : i)}
              >
                <span>{ph.ic}</span>
                <span className="font-semibold text-sm text-slate-800">{ph.nm}</span>
                <span className="pill bg-slate-100 text-slate-500 ml-1">
                  {clearCount}/{ph.steps.length}
                </span>
                <span className={`ml-auto text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
              </button>
              {isOpen && (
                <div className="bg-slate-50/50">
                  {ph.steps.map((st) => (
                    <Step key={st} job={job} stage={st} onSet={setStep} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Follow-up */}
      <div className="card px-4 py-4 space-y-2.5">
        <h2 className="font-bold text-slate-900">Follow-up</h2>
        <select className="input" value={fu.type || ""} onChange={(e) => setFu({ type: e.target.value })}>
          <option value="">(type…)</option>
          {FOLLOWUP_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input
          className="input"
          placeholder="What needs to happen?"
          value={fu.text || ""}
          onChange={(e) => setFu({ text: e.target.value })}
        />
        <div className="flex items-center gap-3">
          <input
            className="input flex-1"
            type="date"
            value={fu.date || ""}
            onChange={(e) => setFu({ date: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm text-slate-600 shrink-0">
            <input
              type="checkbox"
              className="w-4 h-4 accent-[--brand]"
              checked={!!fu.remind}
              onChange={(e) => setFu({ remind: e.target.checked })}
            />
            Remind
          </label>
        </div>
      </div>

      {/* Notes */}
      <div className="card px-4 py-4">
        <h2 className="font-bold text-slate-900 mb-2">Notes</h2>
        <textarea
          className="input min-h-[96px]"
          placeholder="Job notes…"
          value={job.notes || ""}
          onChange={(e) => patchJob(id, { notes: e.target.value })}
        />
      </div>

      {/* Activity feed (command bus) */}
      <div className="card px-4 py-4">
        <h2 className="font-bold text-slate-900 mb-2">Activity</h2>
        {!myCommands.length ? (
          <div className="text-sm text-slate-400">No activity yet for this job.</div>
        ) : (
          <ul className="space-y-2.5">
            {myCommands.map((c) => (
              <li key={c.id} className="flex items-start gap-2.5 text-sm">
                <span className={`pill shrink-0 ${CMD_TONES[c.status] || "bg-slate-100 text-slate-500"}`}>
                  {(c.status || "?").replace("_", " ")}
                </span>
                <div className="min-w-0">
                  <div className="font-medium text-slate-800">{(c.type || "").replace(/_/g, " ")}</div>
                  <div className="text-[11px] text-slate-400">
                    {c.createdAt ? new Date(c.createdAt).toLocaleString() : ""}
                    {c.error ? ` · ${c.error}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
