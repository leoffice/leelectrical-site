// Clock in/out on a job + show logged labor hours.
import React, { useEffect, useMemo, useState } from "react";
import api from "../data/adapter.js";
import {
  elapsedMs,
  fmtDuration,
  jobTimeLabel,
  loadEmployeeId,
  sumMsForJob,
} from "../lib/timeTrack.js";

const POLL_MS = 3500;

export default function JobTimeCard({ job, showToast }) {
  const [doc, setDoc] = useState({ employees: [], active: {}, entries: [], ts: 0 });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const employeeId = loadEmployeeId() || doc.employees[0]?.id || "";

  const refresh = async () => {
    try {
      const d = await api.timeTrackGet();
      setDoc(d);
    } catch {
      /* ignore poll errors */
    }
  };

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, POLL_MS);
    return () => clearInterval(iv);
  }, [job?.id]);

  const totalMs = useMemo(() => sumMsForJob(doc.entries, job?.id), [doc.entries, job?.id]);
  const mySession = employeeId ? doc.active[employeeId] : null;
  const onThisJob = mySession?.kind === "job" && mySession?.jobId === job?.id;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!onThisJob) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [onThisJob]);

  const clockIn = async () => {
    if (!employeeId || !job) return;
    setBusy(true);
    try {
      const d = await api.timeTrackOp({
        op: "clock_in",
        employeeId,
        kind: "job",
        jobId: job.id,
        jobLabel: jobTimeLabel(job),
        note: note.trim(),
      });
      setDoc(d);
      setNote("");
      showToast?.("Job timer started");
    } catch {
      showToast?.("Couldn't start timer — pick your name on the Time tab first");
    } finally {
      setBusy(false);
    }
  };

  const clockOut = async () => {
    if (!employeeId) return;
    setBusy(true);
    try {
      const d = await api.timeTrackOp({ op: "clock_out", employeeId });
      setDoc(d);
      showToast?.("Clocked out");
    } catch {
      showToast?.("Couldn't clock out");
    } finally {
      setBusy(false);
    }
  };

  if (!job) return null;

  return (
    <div className="card px-4 py-3 space-y-2" data-testid="job-time-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-slate-900">⏱ Job time</span>
        <span className="text-sm font-extrabold text-slate-800 tabular-nums" data-testid="job-time-total">
          {fmtDuration(totalMs)} logged
        </span>
      </div>

      {onThisJob ? (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5">
          <div className="text-xs font-bold text-emerald-700 uppercase">Timer running</div>
          <div className="text-xl font-extrabold text-slate-900 tabular-nums mt-0.5" data-testid="job-time-elapsed">
            {fmtDuration(elapsedMs(mySession.startedAt, now))}
          </div>
          <button
            type="button"
            className="btn w-full mt-2 bg-red-600 text-white font-bold !py-2.5"
            disabled={busy}
            onClick={clockOut}
            data-testid="job-clock-out-btn"
          >
            Stop timer
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            className="input w-full text-sm"
            placeholder="Note (optional) — panel rough-in, travel…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            data-testid="job-time-note"
          />
          <button
            type="button"
            className="btn w-full bg-brand text-white font-bold !py-2.5"
            disabled={busy || !employeeId}
            onClick={clockIn}
            data-testid="job-clock-in-btn"
          >
            Start job timer
          </button>
          {!employeeId ? (
            <p className="text-[11px] text-slate-400 text-center">Pick your name on the Time tab first.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}