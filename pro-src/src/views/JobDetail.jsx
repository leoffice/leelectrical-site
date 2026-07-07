// Job detail — customer card (Call/Text/Email/Map + edit + QBO sync), quick
// views (invoice/estimate/calendar), mark-as-paid, 5-phase progress accordion
// with paperwork branches + scheduled date, follow-up + reminder, notes,
// attachments, send history and the live activity feed (retry on failed).
// All edits are STAGED via store.patchJob and only persist on Save & sync.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import {
  FOLLOWUP_TYPES,
  PHASES,
  isCleared,
  phaseOfStage,
  progressPct,
  stageOf,
  stepState,
  todayStr,
} from "../lib/stages.js";
import { PAPER, isDatedStep } from "../lib/paperwork.js";
import { fmt$, ago } from "../lib/format.js";
import {
  customerSyncPayload,
  customerDisplayName,
  effectiveServiceAddress,
  serviceAddressLabel,
} from "../lib/customerSync.js";
import { PaidPill, StagePill } from "../components/JobCard.jsx";
import Toggle from "../components/Toggle.jsx";
import Jobs from "./Jobs.jsx";
import {
  AttachSheet,
  CalSheet,
  CombineSheet,
  CustEditSheet,
  DocSheet,
  InspectionSheet,
  MarkPaidSheet,
  MenuSheet,
  PaymentLinkSheet,
  ReminderSheet,
} from "../components/JobSheets.jsx";

const CMD_TONES = {
  queued: "bg-slate-100 text-slate-500",
  working: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  needs_approval: "bg-violet-100 text-violet-700",
};

function ActionButton({ href, icon, label, disabled, newTab }) {
  return (
    <a
      href={disabled ? undefined : href}
      target={newTab && !disabled ? "_blank" : undefined}
      rel="noreferrer"
      className={`flex-1 flex flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-semibold transition-colors ${
        disabled ? "bg-slate-50 text-slate-300" : "bg-brand-soft text-brand"
      }`}
      onClick={(e) => disabled && e.preventDefault()}
    >
      <span className="text-lg leading-none">{icon}</span>
      {label}
    </a>
  );
}

export default function JobDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const fromCust = sp.get("from") || ""; // customer-group key when opened from CustomerView
  const goBack = () => (fromCust ? nav("/customer/" + encodeURIComponent(fromCust)) : nav("/"));
  const {
    effectiveJob,
    patchJob,
    commands,
    pending,
    loading,
    enqueue,
    retryCommand,
    guardNav,
    showToast,
  } = useStore();
  const job = effectiveJob(id);
  const [openPhase, setOpenPhase] = useState(null); // null = auto
  const [openStep, setOpenStep] = useState(null);
  const [showRemoved, setShowRemoved] = useState({}); // paperwork branch -> expanded
  const [sheet, setSheet] = useState(null); // {kind, ...}
  const stepTimer = useRef(null);

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

  const custSync = () => {
    enqueue(
      "customer_sync",
      id,
      customerSyncPayload(job),
      "deterministic",
      "custsync:" + id + ":" + Date.now()
    );
    showToast("Checking QuickBooks for matches…");
  };

  const schedDate = (d) => {
    patchJob(id, { status: { Scheduled: { s: "done", d } } });
    enqueue(
      "calendar_upsert",
      id,
      {
        calEventId: job.calEventId || "",
        summary: (job.title || "Job") + " — " + (job.customer || ""),
        start: d,
        location: effectiveServiceAddress(job),
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
    patchJob(id, { paperwork: { [k]: { steps: { [s]: on }, active: { [s]: true } } } });
    if (on && s === "Inspection scheduled") setSheet({ kind: "inspection", branch: k });
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
          {fromCust ? "‹ " + (job.customer || "Customer") : "‹ Jobs"}
        </button>
        <button className="btn-ghost !py-1.5 ml-auto" onClick={() => setSheet({ kind: "menu" })} aria-label="More">
          ⋮ More
        </button>
      </div>

      {/* Customer card */}
      <div className="card px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <div className="font-extrabold text-lg text-slate-900 leading-tight">{customerDisplayName(job) || "—"}</div>
            {job.personName ? <div className="text-sm text-slate-500">{job.personName}</div> : null}
            <div className="text-sm text-slate-500">{job.title}</div>
            <div className="mt-1.5 flex gap-1.5 flex-wrap">
              <StagePill job={job} />
              <PaidPill job={job} />
              {pending[id] && <span className="pill bg-amber-100 text-amber-700">unsaved</span>}
            </div>
          </div>
          <div className="ml-auto text-right font-extrabold text-lg text-slate-900 shrink-0">
            {fmt$(job.amount) || "—"}
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <ActionButton href={`tel:${job.phone}`} icon="📞" label="Call" disabled={!job.phone} />
          <ActionButton href={`sms:${job.phone}`} icon="💬" label="Text" disabled={!job.phone} />
          <ActionButton href={`mailto:${job.email}`} icon="✉️" label="Email" disabled={!job.email} />
          <ActionButton
            href={`https://maps.apple.com/?q=${encodeURIComponent(effectiveServiceAddress(job))}`}
            icon="📍"
            label="Map"
            disabled={!effectiveServiceAddress(job)}
            newTab
          />
        </div>
        <dl className="mt-4 space-y-1 text-sm">
          {[
            ["Phone", job.phone],
            ["Email", job.email],
            ["Billing address", job.billingAddress],
            [serviceAddressLabel(job), effectiveServiceAddress(job)],
            ["Estimate #", job.estimateNo],
            ["Invoice #", job.invoiceNo],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex gap-2 items-baseline">
                <dt className="font-semibold text-slate-800 shrink-0">{k}</dt>
                <dd className="text-slate-500 break-words min-w-0">{v}</dd>
              </div>
            ))}
        </dl>
        <div className="flex gap-2 mt-3">
          <button className="btn bg-brand-soft text-brand flex-1 !py-2" onClick={() => setSheet({ kind: "cust" })}>
            ✏️ Edit info
          </button>
          <button className="btn bg-brand-soft text-brand flex-1 !py-2" onClick={custSync}>
            ⇄ Sync to QuickBooks
          </button>
        </div>
      </div>

      {/* Quick views */}
      <div className="flex gap-2">
        {job.invoiceNo && (
          <button className="btn-ghost flex-1 !py-2" onClick={() => setSheet({ kind: "doc", doc: "invoice" })}>
            🧾 Invoice {job.invoiceNo}
          </button>
        )}
        {job.estimateNo && (
          <button className="btn-ghost flex-1 !py-2" onClick={() => setSheet({ kind: "doc", doc: "estimate" })}>
            📝 Estimate {job.estimateNo}
          </button>
        )}
        <button className="btn-ghost flex-1 !py-2" onClick={() => setSheet({ kind: "cal" })}>
          📅 Calendar
        </button>
      </div>

      {/* Money */}
      {!job.paid ? (
        <button className="btn bg-emerald-500 text-white w-full" onClick={() => setSheet({ kind: "paid" })}>
          💵 Mark as paid…
        </button>
      ) : job.payment ? (
        <div className="card !bg-emerald-50 !border-emerald-100 px-4 py-3 text-sm">
          <b>Paid</b> {fmt$(job.payment.amount)} · {job.payment.method || ""}
          {job.payment.ref ? " · ref " + job.payment.ref : ""}
          {job.payment.date ? " · " + job.payment.date : ""}
        </div>
      ) : null}

      {/* Biller Genie payment link — on jobs with an invoice # or amount */}
      {(job.invoiceNo || job.amount) && !job.paid && (
        <button
          className="btn bg-brand-soft text-brand w-full !py-2"
          onClick={() => setSheet({ kind: "paylink" })}
        >
          💳 Payment link
        </button>
      )}

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
                          <div className="flex gap-1.5 pl-10 pb-2">
                            {e.s === "done" || e.s === "skipped" ? (
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
                                      onChange={(on) => patchJob(id, { paperwork: { [k]: { enabled: on } } })}
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
                                                onClick={() => setOpenStep(openStep === rowKey ? null : rowKey)}
                                              >
                                                {on ? "✓ " : ""}
                                                {ps}
                                              </button>
                                              {isDatedStep(ps) && (
                                                <input
                                                  type="date"
                                                  className="input !w-[135px] !py-1 !px-1.5 !text-xs"
                                                  value={((br.dates && br.dates[ps]) || "").slice(0, 10)}
                                                  onChange={(ev) =>
                                                    patchJob(id, { paperwork: { [k]: { dates: { [ps]: ev.target.value } } } })
                                                  }
                                                  aria-label={ps + " date"}
                                                />
                                              )}
                                              <Toggle small on={on} label={ps} onChange={(v) => paperStep(k, ps, v)} />
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

      {/* Sheets */}
      {sheet?.kind === "menu" && (
        <MenuSheet job={job} onClose={() => setSheet(null)} onCombine={() => setSheet({ kind: "combine" })} />
      )}
      {sheet?.kind === "combine" && <CombineSheet job={job} onClose={() => setSheet(null)} />}
      {sheet?.kind === "paid" && <MarkPaidSheet job={job} onClose={() => setSheet(null)} />}
      {sheet?.kind === "paylink" && <PaymentLinkSheet job={job} onClose={() => setSheet(null)} />}
      {sheet?.kind === "cust" && <CustEditSheet job={job} onClose={() => setSheet(null)} />}
      {sheet?.kind === "doc" && <DocSheet job={job} kind={sheet.doc} onClose={() => setSheet(null)} />}
      {sheet?.kind === "cal" && <CalSheet job={job} onClose={() => setSheet(null)} />}
      {sheet?.kind === "reminder" && <ReminderSheet job={job} onClose={() => setSheet(null)} />}
      {sheet?.kind === "attach" && <AttachSheet job={job} onClose={() => setSheet(null)} />}
      {sheet?.kind === "inspection" && (
        <InspectionSheet job={job} branch={sheet.branch} onClose={() => setSheet(null)} />
      )}
    </div>
  );

  // Desktop: two-pane (job list | detail); mobile: detail only.
  return (
    <div className="lg:grid lg:grid-cols-[minmax(300px,360px)_1fr] lg:gap-5 lg:items-start">
      <div className="hidden lg:block sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1" data-testid="list-pane">
        <Jobs embedded />
      </div>
      {detail}
    </div>
  );
}
