// All job-level sheets — behaviors, command payloads and idempotency keys
// match app/sleek.html exactly.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sheet, { Fld, Opt } from "./Sheet.jsx";
import AddAppointmentSheet from "./AddAppointmentSheet.jsx";
import PickAppointmentSheet from "./PickAppointmentSheet.jsx";
import { customerSyncPayload } from "../lib/customerSync.js";
import { displayEventNotes, eventForJob, jobCalendarLinkState, unlinkAppointmentJob } from "../lib/calendarLink.js";
import { evStart } from "../lib/format.js";
import CustomerSearch from "./CustomerSearch.jsx";
import { enrichAndPatchCustomer } from "./NewJobFlow.jsx";
import { useStore } from "../state/store.jsx";
import { serviceAddressHint, serviceAddressLabel } from "../lib/customerSync.js";
import { fmt$, todayStr } from "../lib/format.js";
import { patchFromQboPaymentFetch } from "../lib/qboPayments.js";
import { clientKey, fmtAmountDue, invoiceTotal, jobsForCustomerKey, openBalance, amountPaid, paidPct } from "../lib/customers.js";
import { buildPaymentLinkEmail } from "../lib/paymentLinkEmail.js";
import { buildPayLandingUrl } from "../lib/payLanding.js";
import {
  appendPayment,
  canVoidInQbo,
  fmtPaymentLine,
  normalizePayments,
  removePayment,
  updatePayment,
} from "../lib/payments.js";
import { sortJobs } from "../lib/stages.js";
import { DATE_STEPS } from "../lib/paperwork.js";
import Toggle from "./Toggle.jsx";

export const PAY_METHODS = [
  "Credit card",
  "Check",
  "Cash",
  "Zelle",
  "Wells Fargo",
  "Martin Dorkin",
  "Barder",
  "ACH",
  "Other",
];

/** Shared "send invoice/estimate" action (sleek's doSend). */
export function useDoSend() {
  const { enqueue, logSend, showToast } = useStore();
  return (job, kind, opts = {}) => {
    const no = kind === "invoice" ? job.invoiceNo : job.estimateNo;
    const email = (opts.email || job.email || "").trim();
    const payload =
      kind === "invoice"
        ? {
            email,
            invoiceNo: no,
            customer: job.customer || "",
            amount: String(openBalance(job) || "").replace(/[$,]/g, ""),
            includePaymentLink: Boolean(opts.includePaymentLink && openBalance(job) > 0.01),
          }
        : { email, estimateNo: no };
    const idk =
      kind === "invoice" && payload.includePaymentLink
        ? "send_invoice_pay:" + no
        : "send_" + kind + ":" + no;
    enqueue("send_" + kind, job.id, payload, "deterministic", idk);
    logSend(
      job.id,
      (kind === "invoice" ? "Invoice" : "Estimate") +
        " #" +
        no +
        (payload.includePaymentLink ? " + payment link" : "") +
        " send queued",
      job.email
    );
    showToast(payload.includePaymentLink ? "Queued with payment link — Activity" : "Queued — status in Activity");
  };
}

/* ---------- 1. Mark as paid ---------- */
export function MarkPaidSheet({ job, onClose }) {
  const { patchJob, showToast, syncNow } = useStore();
  const due = openBalance(job);
  const alreadyPaid = due <= 0.01;
  const [amt, setAmt] = useState(due > 0 ? String(due) : String(job.amount || "").replace(/[$,]/g, ""));
  const [mth, setMth] = useState("");
  const [ref, setRef] = useState("");
  const [dt, setDt] = useState(todayStr());
  const save = () => {
    if (alreadyPaid) {
      showToast("Invoice already paid in LE Pro — sync from QuickBooks first");
      return;
    }
    const payAmt = parseFloat(String(amt).replace(/[$,]/g, "")) || 0;
    if (payAmt <= 0) {
      showToast("Enter a payment amount");
      return;
    }
    if (payAmt > due + 0.01) {
      showToast("Amount exceeds open balance " + fmt$(due));
      return;
    }
    const d = dt || todayStr();
    const patch = appendPayment(job, { amount: payAmt, method: mth, ref, date: d });
    const remaining = parseFloat(String(patch.openBalance)) || 0;
    if (patch.paid) {
      showToast("Payment staged — Save & sync to record in QuickBooks");
    } else {
      showToast("Partial payment staged — " + fmt$(remaining) + " remaining. Save & sync for QuickBooks.");
    }
    patchJob(job.id, patch);
    onClose();
  };
  return (
    <Sheet title={"Mark as paid — " + (job.customer || "")} onClose={onClose}>
      {alreadyPaid ? (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 mb-3 text-[12px] text-amber-900">
          <p className="font-semibold">Already paid (balance {fmt$(due)})</p>
          <p className="mt-1 text-amber-800">
            QuickBooks may already show this invoice as paid. Sync first so LE Pro matches QBO before recording another payment.
          </p>
          <button className="btn bg-brand text-white w-full mt-2" onClick={() => syncNow().then(onClose)}>
            Sync from QuickBooks
          </button>
        </div>
      ) : (
        <p className="text-[12px] text-slate-500 mb-2">
          Open balance: <span className="font-semibold text-slate-700">{fmt$(due)}</span>
          {job.invoiceNo ? <span> · Invoice #{job.invoiceNo}</span> : null}
        </p>
      )}
      <Fld label="Amount" hint="Recommended">
        <input className="input" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} aria-label="Amount" disabled={alreadyPaid} />
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
      <button className="btn bg-emerald-500 text-white w-full" onClick={save} disabled={alreadyPaid}>
        ✓ Record payment
      </button>
      <p className="text-[11px] text-slate-400 text-center mt-2">
        Staged now — QuickBooks records it when you hit Save &amp; sync.
      </p>
    </Sheet>
  );
}

/* ---------- 1b. Payment history ---------- */
function PaymentEditForm({ payment, onSave, onDelete, onVoid, onCancel }) {
  const [amt, setAmt] = useState(String(payment.amount || "").replace(/[$,]/g, ""));
  const [mth, setMth] = useState(payment.method || "");
  const [ref, setRef] = useState(payment.ref || "");
  const [dt, setDt] = useState(payment.date || todayStr());
  const voidable = canVoidInQbo(payment);
  return (
    <div className="space-y-3 border-t border-slate-100 pt-3 mt-2">
      <Fld label="Amount">
        <input className="input" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} aria-label="Edit amount" />
      </Fld>
      <Fld label="Payment method">
        <select className="input" value={mth} onChange={(e) => setMth(e.target.value)} aria-label="Edit method">
          <option value="">— choose —</option>
          {PAY_METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </Fld>
      <Fld label="Reference / check #">
        <input className="input" value={ref} onChange={(e) => setRef(e.target.value)} />
      </Fld>
      <Fld label="Date">
        <input className="input" type="date" value={dt} onChange={(e) => setDt(e.target.value)} />
      </Fld>
      <div className="flex gap-2">
        <button
          className="btn bg-brand text-white flex-1"
          onClick={() => onSave({ amount: amt, method: mth, ref, date: dt })}
        >
          Save edit
        </button>
        <button className="btn bg-slate-100 text-slate-700" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {voidable ? (
        <button className="btn bg-amber-50 text-amber-900 w-full border border-amber-200" onClick={onVoid}>
          Reverse in QuickBooks
        </button>
      ) : null}
      <button className="btn bg-red-50 text-red-700 w-full" onClick={onDelete}>
        Remove from LE Pro only
      </button>
      <p className="text-[10px] text-slate-400 text-center">
        {voidable
          ? "Reverse removes it in QuickBooks. Remove only clears it here."
          : "If this payment already synced to QuickBooks, fix QBO separately or ask Dispatch."}
      </p>
    </div>
  );
}

export function PaymentHistorySheet({ job, onClose, onAddPayment }) {
  const { patchJob, patchAndSave, showToast, enqueue, commands, refreshCommands, refreshJobs, effectiveJob } =
    useStore();
  const [editId, setEditId] = useState(null);
  const [fetchPhase, setFetchPhase] = useState("idle"); // idle | working | done | failed
  const [fetchErr, setFetchErr] = useState("");
  const [activeFetchKey, setActiveFetchKey] = useState("");
  const [voidPhase, setVoidPhase] = useState("idle");
  const [voidKey, setVoidKey] = useState("");
  const liveJob = effectiveJob(job.id) || job;
  const inv = liveJob.invoiceNo || "";
  const pays = normalizePayments(liveJob);
  const due = openBalance(liveJob);
  const paid = amountPaid(liveJob);
  const pct = paidPct(liveJob);

  const fetchCmd = useMemo(() => {
    if (!activeFetchKey) return null;
    return (commands || []).find((c) => c.idempotencyKey === activeFetchKey) || null;
  }, [commands, activeFetchKey]);
  const fetchStatus = fetchCmd?.status;

  const applyFetchResult = useCallback(
    (raw) => {
      const cur = effectiveJob(job.id) || job;
      const patch = patchFromQboPaymentFetch(cur, raw);
      if (patch) patchAndSave(job.id, patch);
      else refreshJobs(true);
    },
    [effectiveJob, job, patchAndSave, refreshJobs]
  );

  useEffect(() => {
    if (fetchPhase !== "working" || !activeFetchKey) return;
    if (fetchStatus === "done") {
      setFetchPhase("done");
      applyFetchResult(fetchCmd?.result);
      showToast("Payment history updated from QuickBooks");
    } else if (fetchStatus === "failed") {
      setFetchErr(String(fetchCmd?.error || "Could not pull payments from QuickBooks"));
      setFetchPhase("failed");
    }
  }, [fetchPhase, fetchStatus, fetchCmd?.error, fetchCmd?.result, activeFetchKey, applyFetchResult, showToast]);

  useEffect(() => {
    if (fetchPhase !== "working") return;
    const iv = setInterval(() => refreshCommands(), 1500);
    const timeout = setTimeout(() => {
      setFetchPhase((ph) => {
        if (ph === "working") {
          setFetchErr("Timed out waiting for QuickBooks. Try again or check Activity.");
          return "failed";
        }
        return ph;
      });
    }, 90000);
    return () => {
      clearInterval(iv);
      clearTimeout(timeout);
    };
  }, [fetchPhase, refreshCommands]);

  const voidCmd = useMemo(() => {
    if (!voidKey) return null;
    return (commands || []).find((c) => c.idempotencyKey === voidKey) || null;
  }, [commands, voidKey]);

  useEffect(() => {
    if (voidPhase !== "working" || !voidKey) return;
    if (voidCmd?.status === "done") {
      setVoidPhase("idle");
      setVoidKey("");
      setEditId(null);
      showToast("Payment reversed in QuickBooks — refreshing history");
      pullFromQboRef.current?.();
    } else if (voidCmd?.status === "failed") {
      setVoidPhase("idle");
      showToast(String(voidCmd?.error || "Could not reverse payment in QuickBooks"));
    }
  }, [voidPhase, voidKey, voidCmd?.status, voidCmd?.error, showToast]);

  useEffect(() => {
    if (voidPhase !== "working") return;
    const iv = setInterval(() => refreshCommands(), 1500);
    return () => clearInterval(iv);
  }, [voidPhase, refreshCommands]);

  const pullFromQboRef = useRef(null);
  const pullFromQbo = useCallback(async () => {
    if (!inv) return showToast("No invoice # on this job");
    setFetchErr("");
    const key = "fetch_payments:" + inv + ":" + Date.now();
    setActiveFetchKey(key);
    setFetchPhase("working");
    const cmd = await enqueue("fetch_payments", job.id, { invoiceNo: inv }, "deterministic", key);
    if (!cmd) {
      setFetchPhase("failed");
      setFetchErr("Could not queue payment fetch");
      return;
    }
    if (cmd.status === "done" && cmd.result) {
      applyFetchResult(cmd.result);
      setFetchPhase("done");
      showToast("Payment history updated from QuickBooks");
      return;
    }
    refreshCommands();
    showToast("Pulling payment history from QuickBooks…");
  }, [inv, enqueue, job.id, applyFetchResult, refreshCommands, showToast]);
  pullFromQboRef.current = pullFromQbo;

  const voidInQbo = (payment) => {
    if (!canVoidInQbo(payment)) return;
    if (!window.confirm("Reverse this payment in QuickBooks? The invoice balance will increase.")) return;
    const key = "void_payment:" + payment.qboPaymentId;
    setVoidKey(key);
    setVoidPhase("working");
    enqueue(
      "void_payment",
      job.id,
      {
        qboPaymentId: payment.qboPaymentId,
        syncToken: payment.syncToken,
        invoiceNo: inv,
      },
      "deterministic",
      key
    );
    refreshCommands();
    showToast("Reversing payment in QuickBooks…");
  };

  const saveEdit = (entry) => {
    const payAmt = parseFloat(String(entry.amount).replace(/[$,]/g, "")) || 0;
    if (payAmt <= 0) {
      showToast("Enter a payment amount");
      return;
    }
    patchJob(job.id, updatePayment(liveJob, editId, entry));
    showToast("Payment updated — Save & sync");
    setEditId(null);
  };

  const deletePay = (id) => {
    patchJob(job.id, removePayment(liveJob, id));
    showToast("Payment removed — Save & sync");
    setEditId(null);
  };

  return (
    <Sheet title={"Payment history — " + (job.customer || "")} onClose={onClose}>
      <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 mb-3 text-[12px] text-slate-700">
        <div className="flex justify-between gap-2">
          <span>
            Paid so far: <b>{fmt$(paid) || "$0"}</b>
            {pct ? <span className="text-slate-500"> ({pct}%)</span> : null}
          </span>
          <span>
            Open: <b>{due > 0 ? fmt$(due) : "Paid"}</b>
          </span>
        </div>
        {liveJob.invoiceNo ? <div className="text-slate-500 mt-1">Invoice #{liveJob.invoiceNo}</div> : null}
      </div>

      <button
        type="button"
        className="btn-ghost w-full !py-2 mb-3 text-sm"
        onClick={pullFromQbo}
        disabled={!inv || fetchPhase === "working"}
        data-testid="refresh-payment-history"
      >
        {fetchPhase === "working" ? "↻ Updating from QuickBooks…" : "↻ Update payment history"}
      </button>
      {fetchErr ? (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3">{fetchErr}</p>
      ) : null}

      {!pays.length ? (
        <p className="text-sm text-slate-400 text-center py-4">No payments recorded yet.</p>
      ) : (
        <div className="space-y-2" data-testid="payment-history-list">
          {pays.map((p) => (
            <div key={p.id} className="card px-3 py-2.5">
              {editId === p.id ? (
                <PaymentEditForm
                  payment={p}
                  onSave={saveEdit}
                  onDelete={() => deletePay(p.id)}
                  onVoid={() => voidInQbo(p)}
                  onCancel={() => setEditId(null)}
                />
              ) : (
                <button type="button" className="w-full text-left" onClick={() => setEditId(p.id)}>
                  <div className="text-sm font-semibold text-slate-900">{fmtPaymentLine(p)}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Tap to edit or remove</div>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {due > 0.01 ? (
        <button className="btn bg-emerald-500 text-white w-full mt-3" onClick={onAddPayment}>
          ＋ Record another payment
        </button>
      ) : null}
    </Sheet>
  );
}

/* ---------- 2a-pdf. Live PDF viewer (docs store + fetch_pdf command) ---------- */
// The document pipeline stages we surface as plain wording (#45). "Requesting"
// covers the initial docs-store check + enqueue; "Fetching from QuickBooks" is
// the host agent pulling the PDF; "Ready" means it's rendered full screen.
export const PDF_STAGES = ["Requesting", "Fetching from QuickBooks", "Ready"];

/** Horizontal stage indicator: Requesting → Fetching from QuickBooks → Ready. */
export function PdfStages({ active }) {
  return (
    <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1 text-[11px] font-semibold mb-2" aria-label="Document status">
      {PDF_STAGES.map((s, i) => (
        <React.Fragment key={s}>
          {i > 0 && <span className={i <= active ? "text-brand" : "text-slate-300"}>→</span>}
          <span className={i < active ? "text-emerald-600" : i === active ? "text-brand" : "text-slate-400"}>
            {i < active ? "✓ " : ""}
            {s}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

/** "View PDF": GET docs?key=… first; on a miss enqueue a fetch_pdf command
 *  (lane judgment, idempotencyKey pdf:<no>:<date>) and poll docs every 4s for
 *  up to 90s. Once the blob is in hand it renders full screen automatically —
 *  no separate "go full screen" step (#44) — with plain stage wording (#45). */
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

  // Ready → auto full-screen inline viewer (fixed overlay above the sheet).
  if (st.phase === "ready")
    return (
      <div className="fixed inset-0 z-[70] bg-slate-900 flex flex-col" data-fullscreen-pdf>
        <div className="flex items-center gap-2 px-4 py-2.5 text-white shrink-0 pt-safe">
          <span className="font-bold text-sm flex-1 truncate">
            {(kind === "invoice" ? "Invoice " : "Estimate ") + no}
          </span>
          <button className="text-xs font-bold bg-white/15 rounded-lg px-3 py-1.5" onClick={() => window.open(st.url)}>
            ⤢ Open in new tab
          </button>
          <button
            aria-label="Close PDF"
            className="w-8 h-8 rounded-full bg-white/15 text-white font-bold text-sm shrink-0"
            onClick={() => setSt({ phase: "idle" })}
          >
            ✕
          </button>
        </div>
        <iframe src={st.url} title={"PDF " + docKey} className="flex-1 w-full bg-white border-0" />
      </div>
    );
  if (st.phase === "checking" || st.phase === "fetching")
    return (
      <div className="border border-slate-200 rounded-2xl px-4 py-3 mb-2.5">
        <PdfStages active={st.phase === "checking" ? 0 : 1} />
        <div className="text-sm text-slate-500 flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          {st.phase === "checking"
            ? "Requesting the document…"
            : "Fetching from QuickBooks — a few seconds…"}
        </div>
      </div>
    );
  if (st.phase === "timeout")
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-2xl px-4 py-3 mb-2.5 text-sm text-amber-800">
        Still not in yet — the Mac may be asleep. It'll appear under this button once fetched.
        <button className="btn-ghost w-full mt-2 !py-1.5" onClick={view}>↻ Try again</button>
      </div>
    );
  return <Opt icon="📄" title="View PDF" note="Opens full screen · live from QuickBooks" onClick={view} />;
}

/* ---------- 2a-pay. Payment menu (record vs link) ---------- */
export function PaymentMenuSheet({ job, onClose, onRecord, onLink }) {
  return (
    <Sheet title={"Payment — " + (job.customer || "")} onClose={onClose}>
      <Opt icon="💵" title="Record a payment" note="Cash, check, Zelle, etc." onClick={onRecord} />
      <Opt
        icon="💳"
        title="Payment link"
        note="Customer View & Pay page with invoice PDF"
        onClick={onLink}
      />
    </Sheet>
  );
}

/* ---------- 2a-link. Sola PaymentSITE payment link ---------- */
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

/** Normalize dollars for the payment_link payload / idempotency key. */
function paylinkAmountRaw(raw) {
  const s = String(raw ?? "").trim().replace(/[$,]/g, "");
  const n = parseFloat(s);
  if (!s || Number.isNaN(n) || n <= 0) return "";
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(2);
}

/** "💳 Payment link": enqueue a payment_link command (lane deterministic,
 *  idempotencyKey paylink:<invoiceNo>:<amount>) and poll for a URL.
 *  Defaults to amount due; Levi can override before generating. Customer may
 *  also edit xamount on Sola PaymentSITE if that field is enabled in portal. */
export function PaymentLinkSheet({ job, onClose }) {
  const { enqueue, commands, refreshCommands, showToast } = useStore();
  const inv = job.invoiceNo || "";
  const dueAmt = openBalance(job);
  const dueLabel = fmtAmountDue(job) || fmt$(dueAmt) || "";
  const [linkAmount, setLinkAmount] = useState(() => paylinkAmountRaw(dueAmt) || "");
  const [idk, setIdk] = useState("");
  const [phase, setPhase] = useState("idle"); // idle|working|ready|failed
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [includeFee, setIncludeFee] = useState(true);
  const [emailTo, setEmailTo] = useState(job.email || "");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const deadline = useRef(0);
  const doSend = useDoSend();

  useEffect(() => {
    setLinkAmount(paylinkAmountRaw(openBalance(job)) || "");
    setEmailTo(job.email || "");
    setPhase("idle");
    setUrl("");
    setErr("");
    setIdk("");
    setEmailOpen(false);
  }, [job.id, job.invoiceNo, job.openBalance, job.paid, job.amount, job.email]); // eslint-disable-line react-hooks/exhaustive-deps

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
      let siteSlug = "blzelectric";
      try {
        const parsed = typeof cmdResult === "string" ? JSON.parse(cmdResult) : cmdResult;
        if (parsed?.siteSlug) siteSlug = parsed.siteSlug;
      } catch {}
      const landing = buildPayLandingUrl({ job, cardknoxUrl: link, linkAmount, inv, siteSlug, includeFee });
      setUrl(landing);
      const draft = buildPaymentLinkEmail({ job, url: landing, linkAmount, inv });
      setEmailSubject(draft.subject);
      setEmailBody(draft.body);
      setPhase("ready");
    } else if (cmdStatus === "failed") {
      setErr(String((cmd && cmd.error) || "Sola could not create the payment link"));
      setPhase("failed");
    }
  }, [phase, cmdStatus, cmdResult]); // eslint-disable-line react-hooks/exhaustive-deps

  // Self-perpetuating poll while working (an interval, so it never stalls when
  // a refresh returns no change), with a hard deadline.
  useEffect(() => {
    if (phase !== "working") return;
    const iv = setInterval(() => {
      if (Date.now() >= deadline.current) {
        setErr("Timed out waiting for Sola — Dispatch has been notified.");
        setPhase("failed");
        return;
      }
      refreshCommands();
    }, 1500);
    return () => clearInterval(iv);
  }, [phase, refreshCommands]);

  const resetToDue = () => setLinkAmount(paylinkAmountRaw(dueAmt) || "");

  const start = () => {
    if (!inv) return showToast("No invoice # on this job yet");
    const amt = paylinkAmountRaw(linkAmount);
    if (!amt) return showToast("Enter a valid payment amount");
    const key = "paylink:" + inv + ":" + amt;
    setIdk(key);
    setPhase("working");
    setErr("");
    setUrl("");
    deadline.current = Date.now() + 60_000;
    enqueue(
      "payment_link",
      job.id,
      {
        invoiceNo: inv,
        amount: amt,
        customer: job.customer || "",
        email: job.email || "",
        phone: job.phone || "",
        address: job.address || job.serviceAddress || "",
        billingAddress: job.billingAddress || job.address || "",
      },
      "deterministic",
      key
    );
    // Pre-fetch invoice PDF so customer "View invoice" works on the pay page.
    enqueue(
      "fetch_pdf",
      job.id,
      { kind: "invoice", no: inv, docKey: "inv-" + inv },
      "judgment",
      "pdf:" + inv + ":" + todayStr()
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

  const smsMsg = emailBody
    ? emailBody.split("\n").slice(0, 6).join(" ") + (url ? " " + url : "")
    : `Hi, pay invoice #${inv}: ${url} — LE Electric`;

  const openMailApp = () => {
    const to = (emailTo || "").trim();
    if (!to) return showToast("Enter an email address");
    const href = `mailto:${to}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = href;
  };

  const sendViaQbo = () => {
    const to = (emailTo || "").trim();
    if (!to) return showToast("Enter an email address");
    doSend(job, "invoice", { includePaymentLink: true, email: to });
    showToast("Sending invoice + payment link via QuickBooks…");
    onClose();
  };

  return (
    <Sheet title={"Payment link" + (inv ? " — #" + inv : "")} onClose={onClose}>
      <div className="text-sm space-y-1 mb-3">
        <div><b className="font-semibold">Customer</b> <span className="text-slate-600">{job.customer || ""}</span></div>
        <div><b className="font-semibold">Amount due</b> <span className="text-slate-600">{fmtAmountDue(job) || fmt$(openBalance(job)) || "—"}</span></div>
      </div>

      {phase === "idle" && (
        <>
          <p className="text-sm text-slate-500 mb-3">
            Creates a <b>View &amp; Pay</b> page with invoice PDF and secure payment. Customer edits amount on
            that page (✏️) before Pay. Default: <b>amount due</b> ({dueLabel || "—"}).
          </p>
          <div className="flex items-center justify-between gap-3 mb-3 py-2 border-y border-slate-100">
            <div>
              <div className="text-sm font-semibold text-slate-800">Add 3.5% processing fee</div>
              <div className="text-[11px] text-slate-500">Fee on top of payment (usually on)</div>
            </div>
            <Toggle on={includeFee} label="Processing fee" onChange={setIncludeFee} />
          </div>
          <label className="block text-sm mb-3">
            <span className="font-semibold text-slate-700">Link amount ($)</span>
            <input
              type="text"
              inputMode="decimal"
              className="input mt-1 w-full"
              aria-label="Payment link amount"
              value={linkAmount}
              onChange={(e) => setLinkAmount(e.target.value)}
              placeholder={dueLabel ? dueLabel.replace(/^\$/, "") : "0.00"}
            />
          </label>
          {dueAmt > 0 && linkAmount !== paylinkAmountRaw(dueAmt) && (
            <button type="button" className="btn-ghost w-full !py-1.5 mb-2 text-sm" onClick={resetToDue}>
              ↺ Reset to amount due ({dueLabel})
            </button>
          )}
          <button className="btn-brand w-full" onClick={start} disabled={!inv || !paylinkAmountRaw(linkAmount)}>
            💳 Create payment link
          </button>
          {!inv && <p className="text-[11px] text-slate-400 text-center mt-2">Add an invoice # first.</p>}
        </>
      )}

      {phase === "working" && (
        <div className="border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-500 flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          Creating the Sola payment link…
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
          <div className="flex gap-2 mb-2">
            <a
              className={`btn flex-1 !py-2 text-center ${job.phone ? "bg-brand-soft text-brand" : "bg-slate-50 text-slate-300 pointer-events-none"}`}
              href={job.phone ? `sms:${job.phone}?&body=${encodeURIComponent(smsMsg)}` : undefined}
            >
              💬 Text
            </a>
            <button
              type="button"
              className="btn flex-1 !py-2 bg-brand-soft text-brand"
              onClick={() => setEmailOpen((v) => !v)}
            >
              ✉️ Email
            </button>
          </div>
          {emailOpen && (
            <div className="border border-slate-200 rounded-2xl p-3 mb-2 space-y-2 text-sm">
              <label className="block">
                <span className="font-semibold text-slate-700">To</span>
                <input
                  type="email"
                  className="input mt-1 w-full"
                  aria-label="Payment link email recipient"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder={job.email || "customer@email.com"}
                />
              </label>
              {job.email && emailTo !== job.email && (
                <button type="button" className="btn-ghost w-full !py-1 text-xs" onClick={() => setEmailTo(job.email)}>
                  ↺ Reset to customer email ({job.email})
                </button>
              )}
              <label className="block">
                <span className="font-semibold text-slate-700">Subject</span>
                <input className="input mt-1 w-full" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
              </label>
              <label className="block">
                <span className="font-semibold text-slate-700">Message</span>
                <textarea className="input mt-1 w-full min-h-[140px]" value={emailBody} onChange={(e) => setEmailBody(e.target.value)} />
              </label>
              <p className="text-[11px] text-slate-400">
                Invoice total {fmt$(invoiceTotal(job)) || "—"} · balance due {fmtAmountDue(job) || fmt$(openBalance(job)) || "—"} · link amount {fmt$(parseFloat(linkAmount) || openBalance(job))}
              </p>
              <button type="button" className="btn-brand w-full !py-2" onClick={openMailApp}>
                Open in Mail (review &amp; send)
              </button>
              <button type="button" className="btn w-full !py-2 bg-slate-100 text-slate-800" onClick={sendViaQbo}>
                Send via QuickBooks (invoice PDF + payment link)
              </button>
              <p className="text-[11px] text-slate-400 text-center">
                QuickBooks emails the official invoice PDF with the pay link in the message. Mail app cannot attach the PDF automatically.
              </p>
            </div>
          )}
        </>
      )}

      {phase === "failed" && (
        <div className="border border-amber-200 bg-amber-50 rounded-2xl px-4 py-3 text-sm text-amber-800">
          <b>Sola payment link unavailable</b> — Dispatch notified.
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
      {job.email && kind === "invoice" && openBalance(job) > 0.01 && (
        <Opt
          icon="💳"
          title={"Send to " + job.email + " + payment link"}
          note="Adds Sola pay link to email and invoice memo"
          onClick={() => {
            doSend(job, kind, { includePaymentLink: true });
            onClose();
          }}
        />
      )}
      {job.email && (
        <Opt
          icon="📤"
          title={kind === "invoice" && openBalance(job) > 0.01 ? "Send invoice only (no pay link)" : "Send to " + job.email}
          onClick={() => {
            doSend(job, kind);
            onClose();
          }}
        />
      )}
    </Sheet>
  );
}

/** Quick invoice actions from the jobs list — View (full-screen PDF) or Send. */
export function QuickSendSheet({ job, onClose }) {
  const doSend = useDoSend();
  const due = openBalance(job);
  return (
    <Sheet title={"Invoice " + (job.invoiceNo || "")} onClose={onClose}>
      <div className="text-sm space-y-1 mb-3">
        <div><b className="font-semibold">Customer</b> <span className="text-slate-600">{job.customer || ""}</span></div>
        <div><b className="font-semibold">Amount due</b> <span className="text-slate-600">{fmtAmountDue(job) || fmt$(due) || "—"}</span></div>
      </div>
      {job.invoiceNo && <PdfViewer job={job} kind="invoice" no={job.invoiceNo} />}
      {job.email ? (
        <>
          {due > 0.01 && (
            <Opt
              icon="💳"
              title={"Send to " + job.email + " + payment link"}
              note="Sola link in email body and on the QBO invoice"
              onClick={() => {
                doSend(job, "invoice", { includePaymentLink: true });
                onClose();
              }}
            />
          )}
          <Opt
            icon="📤"
            title={due > 0.01 ? "Send invoice only" : "Send to " + job.email}
            note="Emails via QuickBooks"
            onClick={() => {
              doSend(job, "invoice");
              onClose();
            }}
          />
        </>
      ) : (
        <p className="text-[11px] text-slate-400 text-center mt-2">Add an email to send this invoice.</p>
      )}
    </Sheet>
  );
}

/* ---------- 2b. Calendar quick view ---------- */
// The office account every LE calendar link must open under. Google keys the
// account off the /u/<index> segment for the *current* sign-in order (which
// varies per device) and off ?authuser=<email> as an explicit hint — so we set
// both and let authuser win, landing reliably on office@leelectrical.us.
export const CAL_ACCOUNT = "office@leelectrical.us";
export function CalSheet({ job, onClose }) {
  const { events, commands, patchJob, patchAndSave, enqueue, patchLocalEvent, showToast } = useStore();
  const [mode, setMode] = useState("menu"); // menu | add | pick | unlink
  const [unlinking, setUnlinking] = useState(false);
  const event = useMemo(() => eventForJob(job, events), [job, events]);
  const cal = useMemo(() => jobCalendarLinkState(job, events, commands), [job, events, commands]);
  const linked = cal.confirmed || cal.pending;
  const d =
    (job.status && job.status.Scheduled && job.status.Scheduled.d) ||
    (job.followUp && job.followUp.date) ||
    (event ? evStart(event).slice(0, 10) : "");
  const url =
    "https://calendar.google.com/calendar/u/0/r/day" +
    (d ? "/" + d.replace(/-/g, "/") : "") +
    "?authuser=" + encodeURIComponent(CAL_ACCOUNT);

  if (mode === "add") return <AddAppointmentSheet job={job} onClose={() => setMode("menu")} />;
  if (mode === "pick") return <PickAppointmentSheet job={job} onClose={() => setMode("menu")} onLinked={onClose} />;

  if (mode === "unlink") {
    return (
      <Sheet title="Unlink appointment" onClose={() => setMode("menu")}>
        <p className="text-sm text-slate-500 mb-4">
          Remove the calendar link from this job? The appointment stays on Google Calendar.
        </p>
        <button
          type="button"
          className="btn-brand w-full"
          disabled={unlinking}
          onClick={async () => {
            setUnlinking(true);
            try {
              await unlinkAppointmentJob({
                event: event || { id: job.calEventId, description: "" },
                job,
                jobId: job.id,
                patchJob,
                patchAndSave,
                enqueue,
                patchLocalEvent,
              });
              showToast("Appointment unlinked");
              onClose();
            } finally {
              setUnlinking(false);
            }
          }}
        >
          {unlinking ? "Unlinking…" : "Unlink now"}
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet title="Calendar" onClose={onClose}>
      {linked ? (
        <div
          className={`rounded-xl border px-3 py-2.5 mb-3 text-sm ${
            cal.confirmed
              ? "border-emerald-200 bg-emerald-50"
              : cal.pending
              ? "border-orange-200 bg-orange-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <div
            className={`font-semibold mb-1 ${
              cal.confirmed ? "text-emerald-900" : cal.pending ? "text-orange-900" : "text-red-800"
            }`}
          >
            {cal.confirmed ? "Linked appointment" : cal.pending ? "Linking appointment…" : "Linked appointment"}
          </div>
          {event ? (
            <>
              <div className="text-slate-700">{event.summary || "—"}</div>
              <div className="text-slate-500 text-xs mt-0.5">{evStart(event).replace("T", " ").slice(0, 16)}</div>
              {displayEventNotes(event.description) ? (
                <p className="text-slate-600 text-xs mt-1 whitespace-pre-wrap">{displayEventNotes(event.description)}</p>
              ) : null}
            </>
          ) : (
            <div className="text-slate-500 text-xs">Pull calendar sync to see details.</div>
          )}
        </div>
      ) : (
        <p className="text-sm text-red-600 font-semibold mb-3">No linked appointment</p>
      )}
      <Opt
        icon="＋"
        title="Create appointment"
        note="Syncs to office@leelectrical.us & links to this job"
        onClick={() => setMode("add")}
      />
      <Opt
        icon="🔗"
        title="Link existing appointment"
        note="Search this year's calendar"
        onClick={() => setMode("pick")}
      />
      {linked ? (
        <Opt icon="⛓️‍💥" title="Unlink appointment" note="Keeps the event on Google Calendar" onClick={() => setMode("unlink")} />
      ) : null}
      <Opt icon="📅" title="Open Google Calendar" note={d ? "Jumps to " + d : ""} onClick={() => window.open(url)} />
    </Sheet>
  );
}

/* ---------- 2c. Paperwork inspection — create or link appointment ---------- */
export function PaperworkApptSheet({ job, branch, step, initialDt = "", onClose }) {
  const { patchJob } = useStore();
  const [mode, setMode] = useState("menu"); // menu | add | pick
  const br = (job.paperwork || {})[branch] || {};
  const savedDt = (br.dates && br.dates[step]) || "";
  const defaultDt = initialDt || savedDt || "";

  if (mode === "add") {
    return (
      <AddAppointmentSheet
        job={job}
        defaultDate={defaultDt}
        inspectionPreset={{ branch, step, date: defaultDt }}
        onClose={() => setMode("menu")}
        onSaved={onClose}
      />
    );
  }
  if (mode === "pick") {
    return (
      <PickAppointmentSheet
        job={job}
        onClose={() => setMode("menu")}
        onLinked={() => {
          if (defaultDt) {
            const kind = DATE_STEPS[step] || "date";
            const dateVal = kind === "datetime" ? defaultDt : defaultDt.slice(0, 10);
            patchJob(job.id, { paperwork: { [branch]: { dates: { [step]: dateVal } } } });
          }
          onClose();
        }}
      />
    );
  }

  return (
    <Sheet title="Schedule appointment" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">
        Create a new calendar event or link one already on Google Calendar. Inspection appointments sync as{" "}
        <span className="text-red-600 font-semibold">red</span> with customer guest + reminders.
      </p>
      <Opt
        icon="＋"
        title="Create appointment"
        note="Pre-filled title, guest email, 1h & 1 day reminders"
        onClick={() => setMode("add")}
        data-testid="paper-appt-create"
      />
      <Opt
        icon="🔗"
        title="Link existing appointment"
        note="Search this year's calendar"
        onClick={() => setMode("pick")}
        data-testid="paper-appt-link"
      />
    </Sheet>
  );
}

/* ---------- 3. Customer + job location edit ---------- */
export function CustEditSheet({ job, onClose }) {
  const { patchAndSave, enqueue, showToast, jobs, api } = useStore();
  const [f, setF] = useState({
    businessName: job.businessName || job.customer || "",
    personName: job.personName || "",
    phone: job.phone || "",
    email: job.email || "",
    billingAddress: job.billingAddress || "",
    serviceAddress: job.serviceAddress || job.address || "",
    apartment: job.apartment || "",
    qboCustomerId: job.qboCustomerId || "",
  });
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e.target.value }));

  const pickCustomer = useCallback(
    async (customer) => {
      if (customer && customer._newCustomer) {
        setF((o) => ({
          ...o,
          businessName: customer.name || "",
          qboCustomerId: "",
        }));
        return;
      }
      const patch = await enrichAndPatchCustomer(customer, jobs, api);
      setF((o) => ({
        ...o,
        businessName: patch.businessName || patch.customer || o.businessName,
        personName: patch.personName || o.personName || "",
        phone: patch.phone || o.phone || "",
        email: patch.email || o.email || "",
        billingAddress: patch.billingAddress || o.billingAddress || "",
        qboCustomerId: patch.qboCustomerId || o.qboCustomerId || "",
      }));
    },
    [api, jobs]
  );

  const buildPatch = () => {
    const business = (f.businessName || "").trim();
    return {
      businessName: business,
      personName: f.personName || "",
      customer: business,
      phone: f.phone || "",
      email: f.email || "",
      billingAddress: f.billingAddress || "",
      serviceAddress: f.serviceAddress || "",
      address: f.serviceAddress || "",
      apartment: f.apartment || "",
      qboCustomerId: f.qboCustomerId || "",
    };
  };

  const saveAndSync = async () => {
    const patch = buildPatch();
    try {
      await patchAndSave(job.id, patch);
      const updated = { ...job, ...patch };
      enqueue(
        "customer_sync",
        job.id,
        customerSyncPayload(updated),
        "deterministic",
        "custsync:" + job.id + ":" + Date.now()
      );
      showToast("Saved & syncing to QuickBooks…");
      onClose();
    } catch (e) {
      showToast("Save failed — " + ((e && e.message) || "try again"));
    }
  };

  return (
    <Sheet title="Edit customer & service location" onClose={onClose}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Customer (QuickBooks)</p>
      <Fld label="Business name" hint="Search QuickBooks customers — phone, email & billing fill from QB">
        <CustomerSearch
          label="Business name"
          testId="custedit-business-name"
          value={f.businessName}
          onChangeText={(v) => setF((o) => ({ ...o, businessName: v, qboCustomerId: "" }))}
          onPick={pickCustomer}
        />
      </Fld>
      {[["personName", "Person name"], ["phone", "Phone"], ["email", "Email"], ["billingAddress", "Billing address"]].map(
        ([k, l]) => (
          <Fld key={k} label={l}>
            <input className="input" value={f[k]} onChange={set(k)} aria-label={l} />
          </Fld>
        )
      )}
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mt-3 mb-2">
        {job.invoiceNo || job.estimateNo ? "Invoice / estimate — service location" : "Service location (for next invoice/estimate)"}
      </p>
      <Fld label={serviceAddressLabel(job)} hint={serviceAddressHint(job)}>
        <input className="input" value={f.serviceAddress} onChange={set("serviceAddress")} aria-label={serviceAddressLabel(job)} />
      </Fld>
      <Fld label="Apartment #">
        <input className="input" value={f.apartment} onChange={set("apartment")} aria-label="Apartment #" />
      </Fld>
      <button className="btn-brand w-full" onClick={saveAndSync} data-testid="cust-save-sync">
        Save &amp; sync
      </button>
      <p className="text-[11px] text-slate-400 text-center mt-2">
        Saves customer info and syncs to QuickBooks. Service address stays on this invoice/estimate only.
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
        "att:inv:" + job.id + ":" + n
      );
      showToast("Added — attaching to the QuickBooks invoice too");
    } else if (u && job.estimateNo) {
      enqueue(
        "attach_to_estimate",
        job.id,
        { estimateNo: job.estimateNo, name: n, url: u },
        "deterministic",
        "att:est:" + job.id + ":" + n
      );
      showToast("Added — attaching to the QuickBooks estimate too");
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
      <Fld label="Link" hint="With a link + invoice/estimate #, it also attaches in QuickBooks">
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
      <Opt icon="🔗" title="Combine with another customer" note="Merge all jobs and open invoices from both customers" onClick={onCombine} />
      <Opt icon="🗑️" danger title="Delete from dashboard" note="Never touches QuickBooks" onClick={() => setConfirmDel(true)} />
    </Sheet>
  );
}

export function CombineSheet({ job, onClose }) {
  const { jobs, patchAndSave, showToast } = useStore();
  const myKey = clientKey(job);
  const myJobs = jobsForCustomerKey(jobs, myKey);

  const groups = useMemo(() => {
    const map = new Map();
    for (const x of jobs) {
      if (!x || x._archived || x._deleted) continue;
      const k = clientKey(x);
      if (k === myKey) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(x);
    }
    return [...map.entries()]
      .map(([key, list]) => ({ key, list: sortJobs(list), name: list[0]?.customer || "—" }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [jobs, myKey]);

  const invoiceNote = (list) =>
    list
      .map((j) => {
        if (j.invoiceNo) {
          const due = j.paid ? "paid" : fmtAmountDue(j) || fmt$(openBalance(j));
          return `Inv #${j.invoiceNo}${due ? " · " + due : ""}`;
        }
        return j.title || "Job";
      })
      .join(" · ");

  const combine = async (targetKey) => {
    const theirs = jobsForCustomerKey(jobs, targetKey);
    const all = [...myJobs, ...theirs];
    const byId = new Map(all.map((j) => [j.id, j]));
    const grp =
      myJobs.find((j) => j.clientGroup)?.clientGroup ||
      theirs.find((j) => j.clientGroup)?.clientGroup ||
      "grp" + Date.now();
    onClose();
    for (const j of byId.values()) {
      await patchAndSave(j.id, { clientGroup: grp });
    }
    showToast(`Grouped ${byId.size} job${byId.size === 1 ? "" : "s"} under one client`);
  };

  return (
    <Sheet title="Combine — pick a customer" onClose={onClose}>
      {groups.length ? (
        groups.map(({ key, list, name }) => (
          <Opt
            key={key}
            icon="🗂️"
            title={name}
            note={invoiceNote(list)}
            onClick={() => combine(key)}
          />
        ))
      ) : (
        <div className="text-sm text-slate-400 text-center py-6">No other customers to combine with.</div>
      )}
    </Sheet>
  );
}

/* ---------- 6. Inspection scheduled / appointment (paperwork) ---------- */
export function InspectionSheet(props) {
  return <PaperworkApptSheet {...props} />;
}
