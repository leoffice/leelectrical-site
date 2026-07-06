// + FAB flow: manual form OR pick a calendar appointment to prefill.
// Creates an overlay job (_new, local- id) exactly like sleek's createJob.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Sheet, { Fld, Opt } from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";
import { evStart, todayStr } from "../lib/format.js";

/** Prefill parser — copied from sleek's prefillFromEvent. */
export function prefillFromEvent(e) {
  const desc = e.description || "";
  const pick = (re) => {
    const m = desc.match(re);
    return m ? m[1].trim() : "";
  };
  return {
    customer:
      (e.summary || "").replace(/(service call|estimate|install.*?)[—\-:]/i, "").trim() || e.summary || "",
    title: e.summary || "",
    address: e.location || "",
    phone: pick(/(?:phone|tel|cell)[:\s]+([\d\-\+\(\) ]{7,})/i),
    email: pick(/([\w.+-]+@[\w-]+\.[\w.]+)/),
    date: evStart(e).slice(0, 10),
    calEventId: e.id || "",
  };
}

const FIELDS = [
  ["customer", "Customer name"],
  ["title", "Job title / scope"],
  ["amount", "Amount ($)"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["address", "Service address"],
  ["estimateNo", "Estimate #"],
  ["invoiceNo", "Invoice #"],
];

export default function NewJobFlow() {
  const { newJob, setNewJob, events, markSasHandled } = useStore();
  const nav = useNavigate();
  if (!newJob) return null;
  const close = () => setNewJob(null);

  if (newJob.step === "choose")
    return (
      <Sheet title="New job" onClose={close}>
        <Opt icon="✍️" title="Enter manually" note="Type the customer & details" onClick={() => setNewJob({ step: "form", prefill: {} })} />
        <Opt icon="📅" title="Choose from calendar" note="Prefill from an upcoming appointment" onClick={() => setNewJob({ step: "cal" })} />
      </Sheet>
    );

  if (newJob.step === "cal") {
    // Window: 2 weeks back through 1 week ahead, excluding "inspection" events.
    const fromD = new Date(); fromD.setDate(fromD.getDate() - 14);
    const toD = new Date(); toD.setDate(toD.getDate() + 7);
    const fromStr = fromD.toISOString().slice(0, 10);
    const toStr = toD.toISOString().slice(0, 10);
    const evs = (events || [])
      .filter((e) => {
        const d = evStart(e).slice(0, 10);
        return d >= fromStr && d <= toStr && !/inspection/i.test(e.summary || "");
      })
      .sort((a, b) => (evStart(a) > evStart(b) ? -1 : 1))
      .slice(0, 30);
    return (
      <Sheet title="Pick an appointment" onClose={close}>
        {evs.length ? (
          evs.map((e, i) => (
            <Opt
              key={e.id || i}
              icon="📅"
              title={e.summary || "Appointment"}
              note={evStart(e).replace("T", " ").slice(0, 16) + (e.location ? " · " + e.location : "")}
              onClick={() => setNewJob({ step: "form", prefill: prefillFromEvent(e) })}
            />
          ))
        ) : (
          <div className="text-sm text-slate-400 text-center py-6">No synced appointments yet.</div>
        )}
      </Sheet>
    );
  }

  return (
    <NewJobForm
      prefill={newJob.prefill || {}}
      onClose={close}
      onCreated={(id) => {
        // SAS lead ticket → job: mark the originating ticket handled + link it.
        if (newJob.sasCallId) markSasHandled(newJob.sasCallId, { handled: true, jobId: id });
        nav("/job/" + encodeURIComponent(id));
      }}
    />
  );
}

function NewJobForm({ prefill, onClose, onCreated }) {
  const { createJob } = useStore();
  const [f, setF] = useState(() => {
    const o = { date: prefill.date || "" };
    FIELDS.forEach(([k]) => (o[k] = prefill[k] || ""));
    return o;
  });
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e.target.value }));
  const create = async () => {
    const id = await createJob(f, prefill.calEventId || "");
    if (id) {
      onClose();
      onCreated && onCreated(id);
    }
  };
  return (
    <Sheet title="New job — details" onClose={onClose}>
      {FIELDS.map(([k, l]) => (
        <Fld key={k} label={l}>
          <input className="input" value={f[k]} onChange={set(k)} aria-label={l} />
        </Fld>
      ))}
      <Fld label="Scheduled date">
        <input className="input" type="date" value={f.date} onChange={set("date")} aria-label="Scheduled date" />
      </Fld>
      <button className="btn-brand w-full" onClick={create}>
        Create job
      </button>
    </Sheet>
  );
}
