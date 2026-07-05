// All job-level sheets — behaviors, command payloads and idempotency keys
// match app/sleek.html exactly.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Sheet, { Fld, Opt } from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";
import { fmt$, todayStr } from "../lib/format.js";
import { sortJobs } from "../lib/stages.js";

export const PAY_METHODS = ["Cash", "Wells Fargo", "Martin Dorkin", "Zelle", "Barder", "Other"];

/** Shared "send invoice/estimate" action (sleek's doSend). */
export function useDoSend() {
  const { enqueue, logSend, showToast } = useStore();
  return (job, kind) => {
    const no = kind === "invoice" ? job.invoiceNo : job.estimateNo;
    const payload =
      kind === "invoice" ? { email: job.email, invoiceNo: no } : { email: job.email, estimateNo: no };
    enqueue("send_" + kind, job.id, payload, "deterministic", "send_" + kind + ":" + no);
    logSend(job.id, (kind === "invoice" ? "Invoice" : "Estimate") + " #" + no + " send queued", job.email);
    showToast("Queued — status in Activity");
  };
}

/* ---------- 1. Mark as paid ---------- */
export function MarkPaidSheet({ job, onClose }) {
  const { patchJob, showToast } = useStore();
  const [amt, setAmt] = useState(String(job.amount || "").replace(/[$,]/g, ""));
  const [mth, setMth] = useState("");
  const [ref, setRef] = useState("");
  const [dt, setDt] = useState(todayStr());
  const save = () => {
    const d = dt || todayStr();
    patchJob(job.id, {
      paid: true,
      payment: { amount: amt, method: mth, ref, date: dt },
      status: { Paid: { s: "done", d }, "Follow-up": { s: "done", d } },
    });
    showToast("Payment staged — Save & sync to record in QuickBooks");
    onClose();
  };
  return (
    <Sheet title={"Mark as paid — " + (job.customer || "")} onClose={onClose}>
      <Fld label="Amount" hint="Recommended">
        <input className="input" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} aria-label="Amount" />
      </Fld>
      <Fld label="Payment method" hint="Recommended">
        <select className="input" value={mth} onChange={(e) => setMth(e.target.value)} aria-label="Payment method">
          <option value="">— choose —</option>
          {PAY_METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </Fld>
      <Fld label="Reference / check #">
        <input className="input" placeholder="Optional" value={ref} onChange={(e) => setRef(e.target.value)} />
      </Fld>
      <Fld label="Date">
        <input className="input" type="date" value={dt} onChange={(e) => setDt(e.target.value)} />
      </Fld>
      <button className="btn bg-emerald-500 text-white w-full" onClick={save}>
        ✓ Record payment
      </button>
      <p className="text-[11px] text-slate-400 text-center mt-2">
        Staged now — QuickBooks records it when you hit Save &amp; sync.
      </p>
    </Sheet>
  );
}

/* ---------- 2a. Invoice / Estimate quick view ---------- */
export function DocSheet({ job, kind, onClose }) {
  const doSend = useDoSend();
  const no = kind === "invoice" ? job.invoiceNo : job.estimateNo;
  return (
    <Sheet title={(kind === "invoice" ? "Invoice " : "Estimate ") + (no || "")} onClose={onClose}>
      <div className="text-sm space-y-1 mb-3">
        <div><b className="font-semibold">Customer</b> <span className="text-slate-600">{job.customer || ""}</span></div>
        <div><b className="font-semibold">Amount</b> <span className="text-slate-600">{fmt$(job.amount)}</span></div>
        {kind === "invoice" && (
          <div><b className="font-semibold">Status</b> <span className="text-slate-600">{job.paid ? "Paid" : "Open"}</span></div>
        )}
      </div>
      <Opt
        icon="🔗"
        title="Open in QuickBooks"
        onClick={() => window.open("https://qbo.intuit.com/app/" + (kind === "invoice" ? "invoices" : "estimates"))}
      />
      {job.email && (
        <Opt
          icon="📤"
          title={"Send to " + job.email}
          onClick={() => {
            doSend(job, kind);
            onClose();
          }}
        />
      )}
    </Sheet>
  );
}

/** Quick "send invoice" confirmation used from the jobs list. */
export function QuickSendSheet({ job, onClose }) {
  const doSend = useDoSend();
  return (
    <Sheet title={"Send invoice " + (job.invoiceNo || "")} onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">
        Send invoice <b>{job.invoiceNo}</b> to <b>{job.email}</b>?
      </p>
      <button
        className="btn-brand w-full"
        onClick={() => {
          doSend(job, "invoice");
          onClose();
        }}
      >
        📤 Send now
      </button>
    </Sheet>
  );
}

/* ---------- 2b. Calendar quick view ---------- */
export function CalSheet({ job, onClose }) {
  const d =
    (job.status && job.status.Scheduled && job.status.Scheduled.d) ||
    (job.followUp && job.followUp.date) ||
    "";
  const url = "https://calendar.google.com/calendar/u/0/r/day" + (d ? "/" + d.replace(/-/g, "/") : "");
  return (
    <Sheet title="Calendar" onClose={onClose}>
      {d ? (
        <div className="text-sm mb-3"><b className="font-semibold">Job date</b> <span className="text-slate-600">{d}</span></div>
      ) : (
        <p className="text-sm text-slate-500 mb-3">No date set yet — set one under Progress → Job → Scheduled.</p>
      )}
      <Opt icon="📅" title="Open Google Calendar" note={d ? "Jumps to " + d : ""} onClick={() => window.open(url)} />
    </Sheet>
  );
}

/* ---------- 3. Customer edit ---------- */
export function CustEditSheet({ job, onClose }) {
  const { patchJob, showToast } = useStore();
  const [f, setF] = useState({
    customer: job.customer || "",
    phone: job.phone || "",
    email: job.email || "",
    address: job.address || "",
  });
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e.target.value }));
  return (
    <Sheet title="Edit customer" onClose={onClose}>
      {[["customer", "Name"], ["phone", "Phone"], ["email", "Email"], ["address", "Billing address"]].map(
        ([k, l]) => (
          <Fld key={k} label={l}>
            <input className="input" value={f[k]} onChange={set(k)} aria-label={l} />
          </Fld>
        )
      )}
      <button
        className="btn-brand w-full"
        onClick={() => {
          patchJob(job.id, f);
          showToast("Customer info staged");
          onClose();
        }}
      >
        Apply
      </button>
      <p className="text-[11px] text-slate-400 text-center mt-2">
        Applies to this job now; pushes to QuickBooks only via ⇄ Sync (with your approval).
      </p>
    </Sheet>
  );
}

/* ---------- 7. Payment reminder ---------- */
export function ReminderSheet({ job, onClose }) {
  const { enqueue, logSend, showToast } = useStore();
  const [msg, setMsg] = useState(
    `Hi ${(job.customer || "").split(" ")[0]}, just a friendly reminder about your ${
      job.title || "job"
    } (invoice ${job.invoiceNo ? "#" + job.invoiceNo : "pending"}). Please let us know if you have any questions. — LE Electric`
  );
  return (
    <Sheet title={"Payment reminder — " + (job.customer || "")} onClose={onClose}>
      <Fld label="Message">
        <textarea className="input min-h-[96px]" value={msg} onChange={(e) => setMsg(e.target.value)} aria-label="Reminder message" />
      </Fld>
      <button
        className="btn-brand w-full"
        onClick={() => {
          enqueue(
            "send_reminder",
            job.id,
            { email: job.email || "", invoiceNo: job.invoiceNo || "", message: msg },
            "judgment",
            "rem:" + job.id + ":" + todayStr()
          );
          logSend(job.id, "Payment reminder queued");
          showToast("Reminder queued — watch Activity");
          onClose();
        }}
      >
        🔔 Send via Dispatch
      </button>
      <p className="text-[11px] text-slate-400 text-center mt-2">
        Goes to Dispatch for review/send — status shows in Activity.
      </p>
    </Sheet>
  );
}

/* ---------- 8. Add attachment ---------- */
export function AttachSheet({ job, onClose }) {
  const { patchJob, enqueue, showToast } = useStore();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const add = () => {
    const n = name.trim(), u = url.trim();
    if (!n) return showToast("Give it a name");
    patchJob(job.id, { attachments: (job.attachments || []).concat([{ name: n, url: u }]) });
    if (u && job.invoiceNo) {
      enqueue(
        "attach_to_invoice",
        job.id,
        { invoiceNo: job.invoiceNo, name: n, url: u },
        "deterministic",
        "att:" + job.id + ":" + n
      );
      showToast("Added — attaching to the QuickBooks invoice too");
    } else {
      showToast("Attachment staged" + (u ? "" : " (add a link to also attach it in QuickBooks)"));
    }
    onClose();
  };
  return (
    <Sheet title="Add attachment" onClose={onClose}>
      <Fld label="Name">
        <input className="input" placeholder="e.g. Panel photo, blueprint" value={name} onChange={(e) => setName(e.target.value)} aria-label="Attachment name" />
      </Fld>
      <Fld label="Link" hint="With a link + invoice, it also attaches in QuickBooks">
        <input className="input" placeholder="Optional — paste a Drive/photo link" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Attachment link" />
      </Fld>
      <button className="btn-brand w-full" onClick={add}>Add</button>
    </Sheet>
  );
}

/* ---------- 5. Job menu: archive / combine / delete ---------- */
export function MenuSheet({ job, onClose, onCombine }) {
  const { patchAndSave, showToast } = useStore();
  const nav = useNavigate();
  const [confirmDel, setConfirmDel] = useState(false);
  if (confirmDel)
    return (
      <Sheet title="Delete this job?" onClose={onClose}>
        <p className="text-sm text-slate-500 mb-3">
          Removes it from the dashboard only — QuickBooks is never touched.
        </p>
        <button
          className="btn bg-red-100 text-red-600 w-full"
          onClick={() => {
            patchAndSave(job.id, { _deleted: true });
            showToast("Job deleted");
            onClose();
            nav("/");
          }}
        >
          Delete
        </button>
        <button className="btn-ghost w-full mt-2" onClick={onClose}>Cancel</button>
      </Sheet>
    );
  return (
    <Sheet title={job.customer || "Job"} onClose={onClose}>
      <Opt
        icon="📦"
        title="Archive job"
        note="Moves to the Archive tab; restore anytime"
        onClick={() => {
          patchAndSave(job.id, { _archived: true });
          showToast("Archived");
          onClose();
          nav("/");
        }}
      />
      <Opt icon="🔗" title="Combine with another job" note="Group multiple jobs under one client" onClick={onCombine} />
      <Opt icon="🗑️" danger title="Delete from dashboard" note="Never touches QuickBooks" onClick={() => setConfirmDel(true)} />
    </Sheet>
  );
}

export function CombineSheet({ job, onClose }) {
  const { jobs, patchAndSave, showToast } = useStore();
  const others = sortJobs(jobs.filter((x) => x.id !== job.id && !x._archived && !x._deleted));
  const combine = async (other) => {
    const grp = job.clientGroup || other.clientGroup || "grp" + Date.now();
    onClose();
    // sequential — both writes post the full ov, so they must not race
    await patchAndSave(job.id, { clientGroup: grp });
    await patchAndSave(other.id, { clientGroup: grp });
    showToast("Jobs grouped under one client");
  };
  return (
    <Sheet title="Combine — pick the other job" onClose={onClose}>
      {others.length ? (
        others.map((x) => (
          <Opt
            key={x.id}
            icon="🗂️"
            title={x.customer || "—"}
            note={`${x.title || ""} · ${fmt$(x.amount)}`}
            onClick={() => combine(x)}
          />
        ))
      ) : (
        <div className="text-sm text-slate-400 text-center py-6">No other jobs.</div>
      )}
    </Sheet>
  );
}

/* ---------- 6. Inspection scheduled (paperwork) ---------- */
export function InspectionSheet({ job, branch, onClose }) {
  const { patchJob, enqueue, showToast } = useStore();
  const [dt, setDt] = useState("");
  const confirm = () => {
    onClose();
    if (!dt) return showToast("No date picked");
    patchJob(job.id, { paperwork: { [branch]: { dates: { "Inspection scheduled": dt.slice(0, 10) } } } });
    enqueue(
      "calendar_upsert",
      job.id,
      {
        calEventId: job.calEventId || "",
        summary: "Inspection — " + (job.customer || ""),
        start: dt,
        location: job.address || "",
        description: "Scheduled from LE Pro",
      },
      "judgment",
      "insp:" + job.id + ":" + dt
    );
    showToast("Inspection queued to calendar");
  };
  return (
    <Sheet title="Inspection scheduled" onClose={onClose}>
      <Fld label="Date & time">
        <input className="input" type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} aria-label="Inspection date and time" />
      </Fld>
      <button className="btn-brand w-full" onClick={confirm}>Add to customer's calendar</button>
      <button className="btn-ghost w-full mt-2" onClick={onClose}>Just record it</button>
    </Sheet>
  );
}
