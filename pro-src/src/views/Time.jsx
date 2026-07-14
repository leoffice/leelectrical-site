// Time — employee clock in/out, job time, weekly timesheet, live board.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../data/adapter.js";
import { useStore } from "../state/store.jsx";
import Sheet, { Opt } from "../components/Sheet.jsx";
import {
  buildWeekGrid,
  elapsedMs,
  endOfWeek,
  filterEntries,
  fmtClock,
  fmtDay,
  fmtDuration,
  fromLocalInput,
  groupEntriesByDay,
  jobTimeLabel,
  liveEmployees,
  loadEmployeeId,
  saveEmployeeId,
  startOfWeek,
  toLocalInput,
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
            {session.note ? <p className="text-xs text-slate-500 mt-1">{session.note}</p> : null}
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

function EntryRow({ entry, manage, onEdit }) {
  const kind = entry.kind === "job" ? "Job" : "Shift";
  return (
    <button
      type="button"
      className="card px-3 py-2.5 w-full text-left active:bg-slate-50"
      data-testid="time-entry"
      onClick={() => manage && onEdit?.(entry)}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">
            {entry.employeeName} · {kind}
          </div>
          {entry.jobLabel ? (
            entry.jobId ? (
              <Link to={`/job/${encodeURIComponent(entry.jobId)}`} className="text-xs font-semibold text-brand" onClick={(e) => e.stopPropagation()}>
                {entry.jobLabel}
              </Link>
            ) : (
              <div className="text-xs text-slate-600">{entry.jobLabel}</div>
            )
          ) : null}
          {entry.note ? <div className="text-xs text-slate-500 mt-0.5">{entry.note}</div> : null}
          <div className="text-[11px] text-slate-500 mt-0.5">
            {fmtClock(entry.startedAt)} – {fmtClock(entry.endedAt)}
          </div>
        </div>
        <div className="text-sm font-extrabold text-slate-800 tabular-nums shrink-0">{fmtDuration(entry.durationMs)}</div>
      </div>
    </button>
  );
}

function WeekGrid({ grid }) {
  if (!grid.rows.length) return <div className="card px-4 py-6 text-sm text-slate-400 text-center">No employees yet.</div>;
  return (
    <div className="card overflow-x-auto" data-testid="week-grid">
      <table className="w-full text-xs min-w-[320px]">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-left py-2 px-2 font-bold text-slate-500">Person</th>
            {grid.labels.map((l) => (
              <th key={l} className="py-2 px-1 font-bold text-slate-500 text-center">
                {l}
              </th>
            ))}
            <th className="py-2 px-2 font-bold text-slate-700 text-right">Week</th>
          </tr>
        </thead>
        <tbody>
          {grid.rows.map(({ employee, days, weekMs }) => (
            <tr key={employee.id} className="border-b border-slate-50" data-testid={"week-row-" + employee.id}>
              <td className="py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">{employee.name}</td>
              {days.map((ms, i) => (
                <td key={i} className="py-2 px-1 text-center tabular-nums text-slate-600">
                  {ms ? fmtDuration(ms).replace(" ", "") : "—"}
                </td>
              ))}
              <td className="py-2 px-2 text-right font-bold tabular-nums text-slate-900">{fmtDuration(weekMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const [shiftNote, setShiftNote] = useState("");
  const [view, setView] = useState("recent");
  const [manage, setManage] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeek());
  const [filterEmp, setFilterEmp] = useState("");
  const [filterJobQ, setFilterJobQ] = useState("");
  const [editEntry, setEditEntry] = useState(null);
  const [addManual, setAddManual] = useState(false);
  const lastTs = useRef(0);

  const employee = useMemo(() => doc.employees.find((e) => e.id === employeeId) || null, [doc.employees, employeeId]);
  const mySession = employeeId ? doc.active[employeeId] : null;
  const live = useMemo(() => liveEmployees(doc.active, doc.employees), [doc.active, doc.employees, doc.ts]);

  const filteredEntries = useMemo(() => {
    let rows = doc.entries || [];
    if (view === "week") {
      rows = filterEntries(rows, { fromMs: weekStart, toMs: endOfWeek(weekStart) });
    }
    if (filterEmp) rows = filterEntries(rows, { employeeId: filterEmp });
    if (filterJobQ.trim()) {
      const needle = filterJobQ.trim().toLowerCase();
      rows = rows.filter((e) => (e.jobLabel || "").toLowerCase().includes(needle) || (e.jobId || "").toLowerCase().includes(needle));
    }
    return rows;
  }, [doc.entries, view, weekStart, filterEmp, filterJobQ]);

  const weekGrid = useMemo(() => buildWeekGrid(doc.entries, doc.employees, weekStart), [doc.entries, doc.employees, weekStart]);

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
      /* polling */
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

  const applyDoc = (d) => {
    lastTs.current = d.ts || Date.now();
    setDoc(d);
  };

  const selectEmployee = (id) => {
    setEmployeeId(id);
    saveEmployeeId(id);
  };

  const clockIn = async (kind, job, note = "") => {
    if (!employeeId) return;
    setBusy(true);
    try {
      const body = { op: "clock_in", employeeId, kind, note: String(note || "").trim() };
      if (kind === "job" && job) {
        body.jobId = job.id;
        body.jobLabel = jobTimeLabel(job);
      }
      applyDoc(await api.timeTrackOp(body));
      setJobPick(false);
      setShiftNote("");
      showToast(kind === "job" ? "Job timer started" : "Clocked in");
    } catch {
      showToast("Couldn't clock in — try again");
    } finally {
      setBusy(false);
    }
  };

  const clockOut = async () => {
    if (!employeeId) return;
    setBusy(true);
    try {
      applyDoc(await api.timeTrackOp({ op: "clock_out", employeeId }));
      showToast("Clocked out");
    } catch {
      showToast("Couldn't clock out");
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
      applyDoc(d);
      const added = d.employees.find((e) => e.name === name);
      if (added) selectEmployee(added.id);
      setNewName("");
      setAddEmp(false);
      showToast("Added " + name);
    } catch {
      showToast("Couldn't add employee");
    } finally {
      setBusy(false);
    }
  };

  const saveEntry = async (form) => {
    setBusy(true);
    try {
      const startedAt = fromLocalInput(form.startedAt);
      const endedAt = fromLocalInput(form.endedAt);
      if (!startedAt || !endedAt || endedAt <= startedAt) {
        showToast("End time must be after start");
        return;
      }
      let d;
      if (form.id) {
        d = await api.timeTrackOp({
          op: "patch_entry",
          id: form.id,
          patch: { startedAt, endedAt, note: form.note, kind: form.kind, jobId: form.jobId, jobLabel: form.jobLabel },
        });
      } else {
        d = await api.timeTrackOp({
          op: "add_entry",
          employeeId: form.employeeId,
          kind: form.kind,
          jobId: form.jobId,
          jobLabel: form.jobLabel,
          startedAt,
          endedAt,
          note: form.note,
        });
      }
      applyDoc(d);
      setEditEntry(null);
      setAddManual(false);
      showToast("Saved");
    } catch {
      showToast("Couldn't save entry");
    } finally {
      setBusy(false);
    }
  };

  const deleteEntry = async (id) => {
    setBusy(true);
    try {
      applyDoc(await api.timeTrackOp({ op: "delete_entry", id }));
      setEditEntry(null);
      showToast("Deleted");
    } catch {
      showToast("Couldn't delete");
    } finally {
      setBusy(false);
    }
  };

  const grouped = groupEntriesByDay(filteredEntries);

  return (
    <div className="space-y-5" data-testid="time-view">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-extrabold text-slate-900">Time</h1>
          <p className="text-sm text-slate-500 mt-0.5">Clock in, log job time, weekly timesheet.</p>
        </div>
        <button
          type="button"
          className={`pill text-xs font-bold px-3 py-1.5 shrink-0 ${manage ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          onClick={() => setManage((m) => !m)}
          data-testid="manage-toggle"
        >
          {manage ? "Done editing" : "Edit timesheet"}
        </button>
      </div>

      <section>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">You are</span>
          <button type="button" className="text-[11px] font-bold text-brand ml-auto" onClick={() => setAddEmp(true)} data-testid="add-employee-btn">
            + Add
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {doc.employees.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => selectEmployee(e.id)}
              className={`pill font-bold text-sm px-3 py-1.5 ${e.id === employeeId ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
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
          <input
            className="input w-full text-sm"
            placeholder="Shift note (optional)"
            value={shiftNote}
            onChange={(e) => setShiftNote(e.target.value)}
            data-testid="shift-note"
          />
          <button
            type="button"
            className="btn w-full bg-emerald-600 text-white !py-3.5 text-base font-bold"
            disabled={busy || !employeeId}
            onClick={() => clockIn("shift", null, shiftNote)}
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
        <div className="flex gap-2 mb-3">
          {[
            ["recent", "Recent"],
            ["week", "This week"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`pill text-sm font-bold px-3 py-1.5 ${view === id ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}
              onClick={() => setView(id)}
              data-testid={"view-" + id}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <select className="input text-sm !py-1.5 !w-auto" value={filterEmp} onChange={(e) => setFilterEmp(e.target.value)} data-testid="filter-employee">
            <option value="">All people</option>
            {doc.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <input
            className="input text-sm flex-1 min-w-[120px]"
            placeholder="Filter by job…"
            value={filterJobQ}
            onChange={(e) => setFilterJobQ(e.target.value)}
            data-testid="filter-job"
          />
          {view === "week" ? (
            <div className="flex gap-1 items-center">
              <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => setWeekStart((w) => w - 7 * 86400000)}>
                ‹
              </button>
              <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                {fmtDay(weekStart)} – {fmtDay(endOfWeek(weekStart))}
              </span>
              <button
                type="button"
                className="btn-ghost !py-1 text-xs"
                onClick={() => setWeekStart((w) => Math.min(w + 7 * 86400000, startOfWeek()))}
                disabled={weekStart >= startOfWeek()}
              >
                ›
              </button>
            </div>
          ) : null}
        </div>

        {manage ? (
          <button type="button" className="btn w-full mb-3 bg-slate-800 text-white font-bold !py-2" onClick={() => setAddManual(true)} data-testid="add-manual-entry">
            + Add time block
          </button>
        ) : null}

        {view === "week" ? (
          <WeekGrid grid={weekGrid} />
        ) : !grouped.length ? (
          <div className="card px-4 py-6 text-sm text-slate-400 text-center">No time logged yet.</div>
        ) : (
          grouped.map(([day, rows]) => (
            <div key={day} className="mb-4">
              <div className="text-xs font-bold text-slate-500 mb-2 px-1">{day}</div>
              <div className="space-y-2">
                {rows.map((e) => (
                  <EntryRow key={e.id} entry={e} manage={manage} onEdit={setEditEntry} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      {jobPick ? (
        <Sheet title="Pick a job" onClose={() => setJobPick(false)}>
          <input className="input w-full mb-3" placeholder="Search customer, job, invoice…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="job-pick-search" />
          {jobChoices.map((j) => (
            <Opt key={j.id} icon="🔧" title={j.customer || j.businessName || j.id} note={j.title || j.id} onClick={() => clockIn("job", j)} />
          ))}
          {!jobChoices.length ? <p className="text-sm text-slate-400 text-center py-4">No matching jobs.</p> : null}
        </Sheet>
      ) : null}

      {addEmp ? (
        <Sheet title="Add employee" onClose={() => setAddEmp(false)}>
          <input className="input w-full mb-3" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} data-testid="new-employee-name" />
          <button type="button" className="btn w-full bg-brand text-white font-bold" disabled={busy} onClick={addEmployee}>
            Save
          </button>
        </Sheet>
      ) : null}

      {editEntry || addManual ? (
        <EntryEditSheet
          entry={editEntry}
          employees={doc.employees}
          jobs={jobs}
          defaultEmployeeId={employeeId}
          busy={busy}
          onClose={() => {
            setEditEntry(null);
            setAddManual(false);
          }}
          onSave={saveEntry}
          onDelete={editEntry ? () => deleteEntry(editEntry.id) : null}
        />
      ) : null}
    </div>
  );
}

function EntryEditSheet({ entry, employees, jobs, defaultEmployeeId, busy, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(() => ({
    id: entry?.id || "",
    employeeId: entry?.employeeId || defaultEmployeeId,
    kind: entry?.kind || "job",
    jobId: entry?.jobId || "",
    jobLabel: entry?.jobLabel || "",
    startedAt: toLocalInput(entry?.startedAt || Date.now() - 3600000),
    endedAt: toLocalInput(entry?.endedAt || Date.now()),
    note: entry?.note || "",
  }));
  const [jobQ, setJobQ] = useState("");

  const jobChoices = useMemo(() => {
    const needle = jobQ.trim().toLowerCase();
    const liveJobs = (jobs || []).filter((j) => !j._deleted && !j._archived);
    if (!needle) return liveJobs.slice(0, 8);
    return liveJobs.filter((j) => [j.customer, j.businessName, j.title, j.id].join(" ").toLowerCase().includes(needle)).slice(0, 8);
  }, [jobs, jobQ]);

  const pickJob = (j) => {
    setForm((f) => ({ ...f, kind: "job", jobId: j.id, jobLabel: jobTimeLabel(j) }));
    setJobQ("");
  };

  return (
    <Sheet title={entry ? "Edit time block" : "Add time block"} onClose={onClose}>
      <label className="text-xs font-bold text-slate-500">Person</label>
      <select className="input w-full mb-3" value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      <label className="text-xs font-bold text-slate-500">Type</label>
      <select className="input w-full mb-3" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
        <option value="shift">Shift</option>
        <option value="job">Job</option>
      </select>
      {form.kind === "job" ? (
        <>
          <input className="input w-full mb-2 text-sm" placeholder="Search job…" value={jobQ} onChange={(e) => setJobQ(e.target.value)} />
          {form.jobLabel ? <p className="text-sm font-semibold text-brand mb-2">{form.jobLabel}</p> : null}
          {jobQ
            ? jobChoices.map((j) => (
                <button key={j.id} type="button" className="block w-full text-left text-sm py-1.5 text-slate-700" onClick={() => pickJob(j)}>
                  {j.customer || j.id}
                </button>
              ))
            : null}
        </>
      ) : null}
      <label className="text-xs font-bold text-slate-500">Start</label>
      <input type="datetime-local" className="input w-full mb-3" value={form.startedAt} onChange={(e) => setForm((f) => ({ ...f, startedAt: e.target.value }))} />
      <label className="text-xs font-bold text-slate-500">End</label>
      <input type="datetime-local" className="input w-full mb-3" value={form.endedAt} onChange={(e) => setForm((f) => ({ ...f, endedAt: e.target.value }))} />
      <label className="text-xs font-bold text-slate-500">Note</label>
      <input className="input w-full mb-3" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="What were you doing?" />
      <button type="button" className="btn w-full bg-brand text-white font-bold mb-2" disabled={busy} onClick={() => onSave(form)}>
        Save
      </button>
      {onDelete ? (
        <button type="button" className="btn w-full bg-red-100 text-red-700 font-bold" disabled={busy} onClick={onDelete} data-testid="delete-entry-btn">
          Delete block
        </button>
      ) : null}
    </Sheet>
  );
}