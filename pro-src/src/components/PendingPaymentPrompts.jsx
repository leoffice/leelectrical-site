// Login notices for customer pay-page check photos (and bank Zelle alerts).
// Levi: see picture → zoom → Autofill → correct → Approve → stages payment on the job.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useStore, useStoreData } from "../state/store.jsx";
import { appendPayment } from "../lib/payments.js";
import { analyzePaymentImage, compressImageForVision } from "../lib/paymentVision.js";
import {
  hasStrongPaymentAutofill,
  hasUsefulPaymentAutofill,
  paymentAutofillPatch,
} from "../lib/paymentAutofill.js";
import { buildPaymentVisionLearningEntry } from "../lib/paymentVisionLearning.js";
import { getDepositBanks } from "../lib/chatPayment.js";
import { fmt$, todayStr } from "../lib/format.js";
import PaymentImageZoom from "./PaymentImageZoom.jsx";
import { Fld } from "./Sheet.jsx";

const IS_TEST = typeof process !== "undefined" && process.env && process.env.NODE_ENV === "test";

function collectPending(jobs, systemItems = []) {
  const out = [];
  const seen = new Set();
  for (const j of jobs || []) {
    const p = j?.pendingCheckPayment || j?.pendingZellePayment;
    if (!p || p.status === "dismissed" || p.status === "approved") continue;
    const id = p.id || `${j.id}-${p.proofKey || p.confirmationNumber || p.amount}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...p, jobId: j.id, job: j, id });
  }
  for (const p of systemItems || []) {
    if (!p || p.status === "dismissed" || p.status === "approved") continue;
    const id = p.id || `sys-${p.proofKey || p.confirmationNumber || p.amount}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const job = (jobs || []).find((j) => String(j.id) === String(p.jobId)) || null;
    out.push({ ...p, id, job });
  }
  // Newest first
  out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return out;
}

export default function PendingPaymentPrompts() {
  const { jobs, loading } = useStoreData();
  // saveAll (not syncNow): approve must persist payments + queue QuickBooks record.
  const { patchJob, showToast, saveAll, appendPaymentVisionFeedback, getPaymentVisionLearning } = useStore();
  const [systemItems, setSystemItems] = useState([]);
  const [current, setCurrent] = useState(null);
  const [amt, setAmt] = useState("");
  const [ref, setRef] = useState("");
  const [memo, setMemo] = useState("");
  const [dt, setDt] = useState(todayStr());
  const [deposit, setDeposit] = useState(() => getDepositBanks()[0]);
  const [busy, setBusy] = useState(false);
  const [autofillBusy, setAutofillBusy] = useState(false);
  const [autofillDone, setAutofillDone] = useState(false);
  const [autofillExtracted, setAutofillExtracted] = useState(null);
  const depositBanks = useMemo(() => getDepositBanks(), []);

  // Load system queue (ov._pendingPayments) on boot + poll so bank/pay-page items appear without reload.
  useEffect(() => {
    if (IS_TEST) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { default: api } = await import("../data/adapter.js");
        if (!api.getPendingPayments) return;
        const items = await api.getPendingPayments();
        if (!cancelled) setSystemItems(Array.isArray(items) ? items : []);
      } catch {
        /* optional */
      }
    };
    load();
    const iv = setInterval(load, 45_000);
    const onVis = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const queue = useMemo(() => collectPending(jobs, systemItems), [jobs, systemItems]);

  useEffect(() => {
    if (loading) return;
    if (current) {
      // Keep current if still in queue
      if (queue.some((q) => q.id === current.id)) return;
    }
    setCurrent(queue[0] || null);
  }, [queue, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill fields when the card opens.
  useEffect(() => {
    if (!current) return;
    setAmt(String(current.amount || current.extracted?.amount || "").replace(/[$,*\s]/g, ""));
    setRef(String(current.checkNumber || current.confirmationNumber || current.ref || current.extracted?.checkNumber || current.extracted?.confirmationNumber || ""));
    setMemo(String(current.memo || current.extracted?.memo || ""));
    setDt(String(current.date || todayStr()).slice(0, 10));
    setAutofillExtracted(current.extracted || null);
    setAutofillDone(Boolean(current.extracted && hasStrongPaymentAutofill(current.extracted)));
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearPending = useCallback(
    async (item, status) => {
      if (item.jobId) {
        const key = item.kind === "zelle" ? "pendingZellePayment" : "pendingCheckPayment";
        patchJob(item.jobId, { [key]: { ...(item.job?.[key] || item), status, resolvedAt: Date.now() } });
      }
      setSystemItems((prev) => {
        const next = (prev || []).map((x) =>
          x.id === item.id ? { ...x, status, resolvedAt: Date.now() } : x
        );
        // Persist system queue best-effort
        import("../data/adapter.js")
          .then(({ default: api }) => api.savePendingPayments?.(next.filter((x) => x.status === "pending")))
          .catch(() => {});
        return next.filter((x) => x.status === "pending");
      });
    },
    [patchJob]
  );

  const onDismiss = async () => {
    if (!current) return;
    await clearPending(current, "dismissed");
    setCurrent(null);
    showToast("Payment notice dismissed");
  };

  const runAutofill = async () => {
    if (!current?.proofUrl && !current?.proofKey) {
      showToast("No check photo to read");
      return;
    }
    setAutofillBusy(true);
    try {
      const url = current.proofUrl || "";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load check photo");
      const blob = await res.blob();
      const file = new File([blob], current.fileName || "check.jpg", { type: blob.type || "image/jpeg" });
      const { b64, mime } = await compressImageForVision(file);
      const kindHint = current.kind === "zelle" ? "zelle" : "check";
      let learningEntries = [];
      try {
        learningEntries = (await getPaymentVisionLearning?.()) || [];
      } catch {
        learningEntries = [];
      }
      const { extracted } = await analyzePaymentImage(
        b64,
        mime || "image/jpeg",
        kindHint,
        file.name,
        { learningEntries }
      );
      setAutofillExtracted(extracted || null);
      if (!hasUsefulPaymentAutofill(extracted)) {
        showToast("Couldn't read amount or number yet — fill what it missed and Approve to train the reader");
        return;
      }
      const patch = paymentAutofillPatch(extracted);
      if (patch.amt) setAmt(patch.amt);
      if (patch.ref) setRef(patch.ref);
      if (patch.dt) setDt(patch.dt);
      if (patch.memo) setMemo(patch.memo);
      setAutofillDone(hasStrongPaymentAutofill(extracted));
      showToast("Fields filled from photo — fix anything wrong and Approve (trains the reader)");
    } catch (e) {
      showToast("Could not read photo — fill fields and Approve to train. " + String((e && e.message) || ""));
    } finally {
      setAutofillBusy(false);
    }
  };

  const onApprove = async () => {
    if (!current) return;
    let job =
      current.job ||
      (jobs || []).find((j) => String(j.id) === String(current.jobId));
    // Fall back: match invoice # when the system queue has no hard job id.
    if (!job && current.invoiceNo) {
      const inv = String(current.invoiceNo).trim();
      job = (jobs || []).find(
        (j) =>
          String(j.invoiceNo || "").trim() === inv ||
          String(j.estimateNo || "").trim() === inv
      );
    }
    if (!job) {
      showToast("Couldn’t find that job — open the invoice, then Approve again");
      return;
    }
    const payAmt = parseFloat(String(amt).replace(/[$,]/g, "")) || 0;
    if (payAmt <= 0) {
      showToast("Enter the payment amount");
      return;
    }
    setBusy(true);
    try {
      const method = current.kind === "zelle" ? "Zelle" : "Check";
      const payRef = String(ref || "").trim();
      // Train the reader from Levi's fixes before saving payment.
      try {
        const entry = buildPaymentVisionLearningEntry({
          kind: method === "Zelle" ? "zelle" : "check",
          extracted: autofillExtracted || current.extracted || null,
          finalFields: {
            amount: payAmt,
            ref: payRef,
            date: dt,
            memo,
            invoiceNo: job.invoiceNo || current.invoiceNo || "",
            payer: job.customer || current.customer || "",
            openBalanceDefault: current.amount || "",
          },
          jobId: job.id,
          invoiceNo: job.invoiceNo || current.invoiceNo || "",
          proofName: current.fileName || current.proofKey || "",
        });
        if (entry) await appendPaymentVisionFeedback?.(entry);
      } catch {
        /* never block approve */
      }
      const noteBits = [
        method,
        payRef ? (method === "Check" ? `Check #${payRef}` : `ref ${payRef}`) : "",
        memo ? `memo ${memo}` : "",
        current.proofKey ? `proof:${current.proofKey}` : "",
        deposit ? `Deposit: ${deposit}` : "",
        "Approved from pay-page notice",
      ].filter(Boolean);
      const patch = appendPayment(job, {
        amount: payAmt,
        method,
        ref: payRef,
        date: dt || todayStr(),
        note: noteBits.join(" · "),
        depositTo: deposit || undefined,
        paymentProofName: current.fileName || current.proofKey || undefined,
        paymentAutofilled: Boolean(autofillDone),
        zelleVerified: method === "Zelle" ? Boolean(payRef) : undefined,
      });
      const clearKey = method === "Zelle" ? "pendingZellePayment" : "pendingCheckPayment";
      patchJob(job.id, {
        ...patch,
        [clearKey]: { ...(job[clearKey] || current), status: "approved", resolvedAt: Date.now() },
      });
      await clearPending(current, "approved");
      setCurrent(null);
      // Persist + queue record_payment (same path as job Payment tab Save & sync).
      try {
        await saveAll?.();
        showToast(
          patch.paid
            ? "Payment approved and saved — recording in QuickBooks · fixes train the reader"
            : `Partial payment approved (${fmt$(payAmt)}) — saved · fixes train the reader`
        );
      } catch {
        showToast(
          patch.paid
            ? "Payment staged — tap Save & sync if the balance didn’t update"
            : `Partial payment staged (${fmt$(payAmt)}) — tap Save & sync to finish`
        );
      }
    } finally {
      setBusy(false);
    }
  };

  if (IS_TEST || loading || !current) return null;

  const job = current.job;
  const title =
    current.kind === "zelle" ? "Zelle payment received" : "Check photo from pay page";
  const inv = current.invoiceNo || job?.invoiceNo || "";
  const cust = current.customer || job?.customer || "";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 p-3"
      data-testid="pending-payment-prompt"
      role="dialog"
      aria-label={title}
    >
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-xl border border-slate-200">
        <div className="px-4 pt-4 pb-2 border-b border-slate-100">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-brand">
            Payment to approve
          </div>
          <h2 className="text-lg font-extrabold text-slate-900 leading-tight mt-0.5">{title}</h2>
          <p className="text-sm text-slate-600 mt-1">
            {cust ? <span className="font-semibold text-slate-800">{cust}</span> : null}
            {cust && inv ? " · " : null}
            {inv ? <>Invoice #{inv}</> : null}
            {!cust && !inv ? "Review the photo, Autofill, then Approve." : null}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Source: {current.source === "pay_page" ? "Customer pay link" : current.source || "Bank / email"}
          </p>
        </div>

        {current.proofUrl ? (
          <div className="px-4 pt-3">
            <PaymentImageZoom src={current.proofUrl} alt="Check or payment photo" />
          </div>
        ) : null}

        <div className="px-4 py-3 space-y-2.5">
          <div className="flex gap-2">
            <button
              type="button"
              className="btn bg-accent text-white flex-1 text-sm"
              onClick={runAutofill}
              disabled={autofillBusy || busy || !current.proofUrl}
              data-testid="pending-payment-autofill"
            >
              {autofillBusy ? "Reading…" : autofillDone ? "✓ Autofilled" : "Autofill from photo"}
            </button>
          </div>

          <Fld label="Amount">
            <input
              className="input"
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
              inputMode="decimal"
              disabled={busy}
              data-testid="pending-payment-amount"
            />
          </Fld>
          <Fld label={current.kind === "zelle" ? "Confirmation #" : "Check number"}>
            <input
              className="input"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              disabled={busy}
              data-testid="pending-payment-ref"
            />
          </Fld>
          <Fld label="Memo">
            <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} disabled={busy} />
          </Fld>
          <Fld label="Date">
            <input className="input" type="date" value={dt} onChange={(e) => setDt(e.target.value)} disabled={busy} />
          </Fld>
          <Fld label="Deposit to">
            <select className="input" value={deposit} onChange={(e) => setDeposit(e.target.value)} disabled={busy}>
              {depositBanks.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </Fld>
        </div>

        <div className="px-4 pb-4 flex flex-col gap-2">
          <button
            type="button"
            className="btn bg-brand text-white w-full font-bold"
            onClick={onApprove}
            disabled={busy || !job}
            data-testid="pending-payment-approve"
          >
            {busy ? "Saving…" : "Approve payment"}
          </button>
          <button type="button" className="btn-ghost w-full text-sm" onClick={onDismiss} disabled={busy}>
            Dismiss for now
          </button>
        </div>
      </div>
    </div>
  );
}
