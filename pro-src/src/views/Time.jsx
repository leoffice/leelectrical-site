// Time — employee clock in/out, job time, live who's-working board.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../data/adapter.js";
import { useStore } from "../state/store.jsx";
import Sheet, { Opt } from "../components/Sheet.jsx";
import {
  elapsedMs,
  fmtClock,
  fmtDay,
  fmtDuration,
  groupEntriesByDay,
  jobTimeLabel,
  liveEmployees,
  loadEmployeeId,
  saveEmployeeId,
} from "../lib/timeTrack.js";

const POLL_MS = 3500;

function ActiveCard({ session, employee, onClockOut, busy }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const kind = session.kind === "job" ? "Job time" : "On shift";
  return (
    <div className="card px-4 py-4 border-2 border-emerald-200 bg-emerald-50/60" data-testid="active-session">
      <div className="flex items-start gap-3">
        <span
          className="w-3 h-3 rounded-full mt-1.5 shrink-0 animate-pulse"
          style={{ backgroundColor: employee.color || "#059669" }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">{kind}</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-0.5 tabular-nums" data-testid="active-elapsed">
            {fmtDuration(elapsedMs(session.startedAt, now))}
          </div>
          <div className="text-sm text-slate-600 mt-1">
            Since {fmtClock(session.startedAt)}
            {session.jobLabel ? (
              <>
                {" "}
                · <span className="font-semibold text-slate-800">{session.jobLabel}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
      <button
        type="button"
        className="btn w-full mt-4 bg-red-600 text-white !py-3 text-base font-bold"
        disabled={busy}
        onClick={onClockOut}
        data-testid="clock-out-btn"
      >
        Clock out
      </button>
    </div>
  );
}

function LiveRow({ row }) {
  const label = row.session.kind === "job" && row.session.jobLabel ? row.session.jobLabel : row.session.kind === "job" ? "On a job" : "On shift";
  return (
    <div className="card px-3 py-2.5 flex items-center gap-2" data-testid="live-row">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-slate-900 truncate">{row.name}</div>
        <div className="text-[11px] text-slate-500 truncate">{label}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-bold tabular-nums text-slate-800">{fmtDuration(row.elapsed)}</div>
        {row.live ? (
          <span className="text-[10px] font-bold text-emerald-600">live</span>
        ) : (
          <span className="text-[10px] text-slate-400">idle</span>
        )}
      </div>
    </div>
  );
}

function EntryRow({ entry }) {
  const kind = entry.kind === "job" ? "Job" : "Shift";
  return (
    <div className="card px-3 py-2.5" data-testid="time-entry">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">
            {entry.employeeName} · {kind}
          </div>
          {entry.jobLabel ? (
            entry.jobId ? (
              <Link to={`/job/${encodeURIComponent(entry.jobId)}`} className="text-xs font-semibold text-brand">
                {entry.jobLabel}
              </Link>
            ) : (
              <div className="text-xs text-slate-600">{entry.jobLabel}</div>
            )
          ) : null}
          <div className="text-[11px] text-slate-500 mt-0.5">
            {fmtClock(entry.startedAt)} – {fmtClock(entry.endedAt)}
          </div>
        </div>
        <div className="text-sm font-extrabold text-slate-800 tabular-nums shrink-0">{fmtDuration(entry.durationMs)}</div>
      </div>
    </div>
  );
}

export default function Time() {
  const { jobs, showToast } = useStore();
  const [doc, setDoc] = useState({ employees: [], active: {}, entries: [], ts: 0 });
  const [employeeId, setEmployeeId] = useState(loadEmployeeId);
  const [busy, setBusy] = useState(false);
  const [jobPick, setJobPick] = useState(false);
  const [addEmp, setAddEmp] = useState(false);
  const [newName, setNewName] = useState("");
  const [q, setQ] = useState("");
  const lastTs = useRef(0);

  const employee = useMemo(() => doc.employees.find((e) => e.id === employeeId) || null, [doc.employees, employeeId]);
  const mySession = employeeId ? doc.active[employeeId] : null;
  const live = useMemo(() => liveEmployees(doc.active, doc.employees), [doc.active, doc.employees, doc.ts]);
  const jobChoices = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const liveJobs = (jobs || []).filter((j) => !j._deleted && !j._archived);
    if (!needle) return liveJobs.slice(0, 12);
    return liveJobs
      .filter((j) => {
        const hay = [j.customer, j.businessName, j.title, j.id, j.invoiceNo, j.estimateNo].join(" ").toLowerCase();
        return hay.includes(needle);
      })
      .slice(0, 12);
  }, [jobs, q]);

  const refresh = async () => {
    try {
      const d = await api.timeTrackGet();
      if ((d.ts || 0) !== lastTs.current) {
        lastTs.current = d.ts || 0;
        setDoc(d);
      }
    } catch {
      /* polling — ignore transient errors */
    }
  };

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, POLL_MS);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!employeeId && doc.employees.length) {
      const pick = doc.employees[0].id;
      setEmployeeId(pick);
      saveEmployeeId(pick);
    }
  }, [employeeId, doc.employees]);

  useEffect(() => {
    if (!employeeId || !mySession) return;
    const ping = () => api.timeTrackOp({ op: "heartbeat", employeeId }).catch(() => {});
    ping();
    const iv = setInterval(ping, POLL_MS);
    return () => clearInterval(iv);
  }, [employeeId, mySession]);

  const selectEmployee = (id) => {
    setEmployeeId(id);
    saveEmployeeId(id);
  };

  const clockIn = async (kind, job) => {
    if (!employeeId) return;
    setBusy(true);
    try {
      const body = { op: "clock_in", employeeId, kind };
      if (kind === "job" && job) {
        body.jobId = job.id;
        body.jobLabel = jobTimeLabel(job);
      }
      const d = await api.timeTrackOp(body);
      lastTs.current = d.ts || Date.now();
      setDoc(d);
      setJobPick(false);
      showToast(kind === "job" ? "Job timer started" : "Clocked in");
    } catch {
      showToast("Couldn’t clock in — try again");
    } finally {
      setBusy(false);
    }
  };

  const clockOut = async () => {
    if (!employeeId) return;
    setBusy(true);
    try {
      const d = await api.timeTrackOp({ op: "clock_out", employeeId });
      lastTs.current = d.ts || Date.now();
      setDoc(d);
      showToast("Clocked out");
    } catch {
      showToast("Couldn’t clock out");
    } finally {
      setBusy(false);
    }
  };

  const addEmployee = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const d = await api.timeTrackOp({ op: "add_employee", name });
      lastTs.current = d.ts || Date.now();
      setDoc(d);
      const added = d.employees.find((e) => e.name === name);
      if (added) selectEmployee(added.id);
      setNewName("");
      setAddEmp(false);
      showToast("Added " + name);
    } catch {
      showToast("Couldn’t add employee");
    } finally {
      setBusy(false);
    }
  };

  const grouped = groupEntriesByDay(doc.entries);

  return (
    <div className="space-y-5" data-testid="time-view">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">Time</h1>
        <p className="text-sm text-slate-500 mt-0.5">Clock in, log job time, see who’s working live.</p>
      </div>

      <section>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">You are</span>
          <button
            type="button"
            className="text-[11px] font-bold text-brand ml-auto"
            onClick={() => setAddEmp(true)}
            data-testid="add-employee-btn"
          >
            + Add
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {doc.employees.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => selectEmployee(e.id)}
              className={`pill font-bold text-sm px-3 py-1.5 ${
                e.id === employeeId ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
              }`}
              data-testid={"emp-" + e.id}
            >
              <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: e.color }} />
              {e.name}
            </button>
          ))}
        </div>
      </section>

      {mySession ? (
        <ActiveCard session={mySession} employee={employee || { name: "You" }} onClockOut={clockOut} busy={busy} />
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            className="btn w-full bg-emerald-600 text-white !py-3.5 text-base font-bold"
            disabled={busy || !employeeId}
            onClick={() => clockIn("shift")}
            data-testid="clock-in-btn"
          >
            Clock in — start shift
          </button>
          <button
            type="button"
            className="btn w-full bg-brand text-white !py-3.5 text-base font-bold"
            disabled={busy || !employeeId}
            onClick={() => setJobPick(true)}
            data-testid="job-time-btn"
          >
            Start job timer
          </button>
        </div>
      )}

      {live.length > 0 ? (
        <section>
          <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">Working now</h2>
          <div className="space-y-2">{live.map((row) => <LiveRow key={row.id} row={row} />)}</div>
        </section>
      ) : null}

      <section>
        <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">Recent time</h2>
        {!grouped.length ? (
          <div className="card px-4 py-6 text-sm text-slate-400 text-center">No time logged yet.</div>
        ) : (
          grouped.map(([day, rows]) => (
            <div key={day} className="mb-4">
              <div className="text-xs font-bold text-slate-500 mb-2 px-1">{day}</div>
              <div className="space-y-2">{rows.map((e) => <EntryRow key={e.id} entry={e} />)}</div>
            </div>
          ))
        )}
      </section>

      {jobPick ? (
        <Sheet title="Pick a job" onClose={() => setJobPick(false)}>
          <input
            className="input w-full mb-3"
            placeholder="Search customer, job, invoice…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="job-pick-search"
          />
          {jobChoices.map((j) => (
            <Opt
              key={j.id}
              icon="🔧"
              title={j.customer || j.businessName || j.id}
              note={j.title || j.id}
              onClick={() => clockIn("job", j)}
            />
          ))}
          {!jobChoices.length ? <p className="text-sm text-slate-400 text-center py-4">No matching jobs.</p> : null}
        </Sheet>
      ) : null}

      {addEmp ? (
        <Sheet title="Add employee" onClose={() => setAddEmp(false)}>
          <input
            className="input w-full mb-3"
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            data-testid="new-employee-name"
          />
          <button type="button" className="btn w-full bg-brand text-white font-bold" disabled={busy} onClick={addEmployee}>
            Save
          </button>
        </Sheet>
      ) : null}
    </div>
  );
}