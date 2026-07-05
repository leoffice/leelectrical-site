// All job-level sheets — behaviors, command payloads and idempotency keys
// match app/sleek.html exactly.
import React, { useEffect, useRef, useState } from "react";
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

/* ---------- 2a-pdf. Live PDF viewer (docs store + fetch_pdf command) ---------- */
/** "View PDF": GET docs?key=… first; on a miss enqueue a fetch_pdf command
 *  (lane judgment, idempotencyKey pdf:<no>:<date>) and poll docs every 4s for
 *  up to 90s, then render the PDF inline with a full-screen option. */
export function PdfViewer({ job, kind, no }) {
  const { api, enqueue } = useStore();
  const [st, setSt] = useState({ phase: "idle" }); // idle|checking|fetching|ready|timeout
  const timer = useRef(null);
  const deadline = useRef(0);
  const objUrl = useRef(null);
  const docKey = (kind === "invoice" ? "inv-" : "est-") + no;

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (objUrl.current && typeof URL !== "undefined" && URL.revokeObjectURL) URL.revokeObjectURL(objUrl.current);
    },
    []
  );

  const show = (blob) => {
    const u = typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(blob) : "";
    objUrl.current = u;
    setSt({ phase: "ready", url: u });
  };

  const check = async () => {
    try {
      return (api.getDoc && (await api.getDoc(docKey))) || null;
    } catch {
      return null;
    }
  };

  const poll = async () => {
    const blob = await check();
    if (blob) return show(blob);
    if (Date.now() >= deadline.current) return setSt({ phase: "timeout" });
    timer.current = setTimeout(poll, 4000);
  };

  const view = async () => {
    setSt({ phase: "checking" });
    const blob = await check();
    if (blob) return show(blob);
    // Not stored yet — ask the host agent to pull it from QuickBooks.
    enqueue("fetch_pdf", job.id, { kind, no, docKey }, "judgment", "pdf:" + no + ":" + todayStr());
    deadline.current = Date.now() + 90_000;
    setSt({ phase: "fetching" });
    timer.current = setTimeout(poll, 4000);
  };

  if (st.phase === "ready")
    return (
      <div className="mb-2.5">
        <iframe src={st.url} title={"PDF " + docKey} className="w-full h-[55vh] rounded-2xl border border-slate-200 bg-white" />
        <button className="btn-ghost w-full mt-2 !py-2" onClick={() => window.open(st.url)}>
          ⛶ Full screen
        </button>
      </div>
    );
  if (st.phase === "checking" || st.phase === "fetching")
    return (
      <div className="border border-slate-200 rounded-2xl px-4 py-3 mb-2.5 text-sm text-slate-500 flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
        {st.phase === "checking" ? "Checking for the PDF…" : "Fetching from QuickBooks — a few seconds…"}
      </div>
    );
  if (st.phase === "timeout")
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-2xl px-4 py-3 mb-2.5 text-sm text-amber-800">
        Still not in yet — the Mac may be asleep. It'll appear under this button once fetched.
        <button className="btn-ghost w-full mt-2 !py-1.5" onClick={view}>↻ Try again</button>
      </div>
    );
  return <Opt icon="📄" title="View PDF" note="Live from QuickBooks" onClick={view} />;
}

/* ---------- 2a-link. Biller Genie payment link ---------- */
/** Parse the {url} the host listener stores on a payment_link command result.
 *  Stored as a JSON string ({"url":...}); tolerate a bare URL too. */
export function paylinkUrl(result) {
  if (!result) return "";
  if (typeof result === "object") return result.url || "";
  const s = String(result);
  try {
    const o = JSON.parse(s);
    if (o && o.url) return o.url;
  } catch {}
  return /^https?:\/\//.test(s.trim()) ? s.trim() : "";
}

/** "💳 Payment link": enqueue a payment_link command (lane deterministic,
 *  idempotencyKey paylink:<invoiceNo>) and poll the command result for a URL.
 *  On success shows the link with Copy + prefilled sms:/mailto: share. On
 *  failure shows a graceful "setup incomplete" note. */
export function PaymentLinkSheet({ job, onClose }) {
  const { enqueue, commands, refreshCommands, showToast } = useStore();
  const inv = job.invoiceNo || "";
  const idk = "paylink:" + inv;
  const [phase, setPhase] = useState("idle"); // idle|working|ready|failed
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const deadline = useRef(0);

  // The matching command (by idempotencyKey) as the store re-polls it.
  const cmd = (commands || []).find((c) => c.idempotencyKey === idk);
  const cmdStatus = cmd && cmd.status;
  const cmdResult = cmd && cmd.result;

  // Resolve as it moves queued -> working -> done/failed. Depends on the
  // status/result VALUES (not the object identity, which stays stable across
  // in-place updates), so it re-runs whenever the command changes.
  useEffect(() => {
    if (phase !== "working") return;
    const link = paylinkUrl(cmdResult);
    if (cmdStatus === "done" && link) {
      setUrl(link);
      setPhase("ready");
    } else if (cmdStatus === "failed") {
      setErr(String((cmd && cmd.error) || "Biller Genie could not create the link"));
      setPhase("failed");
    }
  }, [phase, cmdStatus, cmdResult]); // eslint-disable-line react-hooks/exhaustive-deps

  // Self-perpetuating poll while working (an interval, so it never stalls when
  // a refresh returns no change), with a hard deadline.
  useEffect(() => {
    if (phase !== "working") return;
    const iv = setInterval(() => {
      if (Date.now() >= deadline.current) {
        setErr("Timed out waiting for Biller Genie — Dispatch has been notified.");
        setPhase("failed");
        return;
      }
      refreshCommands();
    }, 1500);
    return () => clearInterval(iv);
  }, [phase, refreshCommands]);

  const start = () => {
    if (!inv) return showToast("No invoice # on this job yet");
    setPhase("working");
    setErr("");
    deadline.current = Date.now() + 60_000;
    enqueue(
      "payment_link",
      job.id,
      { invoiceNo: inv, amount: String(job.amount || "").replace(/[$,]/g, ""), customer: job.customer || "", email: job.email || "" },
      "deterministic",
      idk
    );
    refreshCommands();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast("Payment link copied");
    } catch {
      showToast("Copy failed — long-press the link to copy");
    }
  };

  const first = (job.customer || "").split(" ")[0];
  const msg = `Hi ${first || "there"}, here's a secure link to pay ${
    inv ? "invoice #" + inv : "your invoice"
  }: ${url} — LE Electric`;

  return (
    <Sheet title={"Payment link" + (inv ? " — #" + inv : "")} onClose={onClose}>
      <div className="text-sm space-y-1 mb-3">
        <div><b className="font-semibold">Customer</b> <span className="text-slate-600">{job.customer || ""}</span></div>
        <div><b className="font-semibold">Amount</b> <span className="text-slate-600">{fmt$(job.amount) || "—"}</span></div>
      </div>

      {phase === "idle" && (
        <>
          <p className="text-sm text-slate-500 mb-3">
            Create a Biller Genie payment link for this invoice — then Copy it or text/email it to {job.customer || "the customer"}.
          </p>
          <button className="btn-brand w-full" onClick={start} disabled={!inv}>
            💳 Create payment link
          </button>
          {!inv && <p className="text-[11px] text-slate-400 text-center mt-2">Add an invoice # first.</p>}
        </>
      )}

      {phase === "working" && (
        <div className="border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-500 flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          Creating the link in Biller Genie…
        </div>
      )}

      {phase === "ready" && (
        <>
          <div className="card !bg-emerald-50 !border-emerald-100 px-3 py-2.5 mb-3">
            <a href={url} target="_blank" rel="noreferrer" className="text-brand font-semibold text-sm break-all">
              {url}
            </a>
          </div>
          <button className="btn-brand w-full mb-2" onClick={copy}>📋 Copy link</button>
          <div className="flex gap-2">
            <a
              className={`btn flex-1 !py-2 text-center ${job.phone ? "bg-brand-soft text-brand" : "bg-slate-50 text-slate-300 pointer-events-none"}`}
              href={job.phone ? `sms:${job.phone}?&body=${encodeURIComponent(msg)}` : undefined}
            >
              💬 Text
            </a>
            <a
              className={`btn flex-1 !py-2 text-center ${job.email ? "bg-brand-soft text-brand" : "bg-slate-50 text-slate-300 pointer-events-none"}`}
              href={job.email ? `mailto:${job.email}?subject=${encodeURIComponent("Payment link — LE Electric")}&body=${encodeURIComponent(msg)}` : undefined}
            >
              ✉️ Email
            </a>
          </div>
        </>
      )}

      {phase === "failed" && (
        <div className="border border-amber-200 bg-amber-50 rounded-2xl px-4 py-3 text-sm text-amber-800">
          <b>Biller Genie setup incomplete</b> — Dispatch notified.
          <div className="text-[12px] text-amber-700/90 mt-1 break-words">{err}</div>
          <button className="btn-ghost w-full mt-2 !py-1.5" onClick={start}>↻ Try again</button>
        </div>
      )}
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
      {no && <PdfViewer job={job} kind={kind} no={no} />}
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
