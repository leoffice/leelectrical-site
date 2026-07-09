// All job-level sheets — behaviors, command payloads and idempotency keys
// match app/sleek.html exactly.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sheet, { Fld, Opt } from "./Sheet.jsx";
import AddAppointmentSheet from "./AddAppointmentSheet.jsx";
import PickAppointmentSheet from "./PickAppointmentSheet.jsx";
import { customerSyncPayload } from "../lib/customerSync.js";
import {
  displayEventNotes,
  eventForJob,
  googleCalendarOpenUrl,
  jobCalendarLinkState,
  unlinkAppointmentJob,
} from "../lib/calendarLink.js";
import AppointmentDetailSheet from "./AppointmentDetailSheet.jsx";
import { evStart } from "../lib/format.js";
import CustomerSearch from "./CustomerSearch.jsx";
import { enrichAndPatchCustomer } from "./NewJobFlow.jsx";
import { useStore } from "../state/store.jsx";
import { serviceAddressHint, serviceAddressLabel } from "../lib/customerSync.js";
import { fmt$, todayStr } from "../lib/format.js";
import { chargeCardInApp, fetchSolaIfieldsConfig } from "../lib/solaCharge.js";
import SolaCardForm, { tokenizeSolaCard } from "./SolaCardForm.jsx";
import { fmtMoneyPrecise, totalWithFee } from "../lib/payFees.js";
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
import { reconcileZellePayment } from "../lib/zelleReconcile.js";
import { analyzeZelleScreenshot, fileToBase64 } from "../lib/zelleVision.js";
import ZelleReconcileSheet from "./ZelleReconcileSheet.jsx";
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
  const { patchJob, showToast, syncNow, refreshJobs, jobs } = useStore();
  const due = openBalance(job);
  const alreadyPaid = due <= 0.01;
  const [amt, setAmt] = useState(due > 0 ? String(due) : String(job.amount || "").replace(/[$,]/g, ""));
  const [mth, setMth] = useState("");
  const [ref, setRef] = useState("");
  const [dt, setDt] = useState(todayStr());
  const [includeFee, setIncludeFee] = useState(true);
  const [saveOnFile, setSaveOnFile] = useState(true);
  const [useSavedCard, setUseSavedCard] = useState(Boolean(job.solaCardToken));
  const [cardReady, setCardReady] = useState(false);
  const [payPhase, setPayPhase] = useState("idle"); // idle | tokenizing | charging
  const [payErr, setPayErr] = useState("");
  const [achRouting, setAchRouting] = useState("");
  const [achAccount, setAchAccount] = useState("");
  const [achName, setAchName] = useState(job.customer || "");
  const [achEnabled, setAchEnabled] = useState(false);
  const [zelleFile, setZelleFile] = useState(null);
  const [zelleB64, setZelleB64] = useState("");
  const [zelleAnalyzing, setZelleAnalyzing] = useState(false);
  const [zelleVerified, setZelleVerified] = useState(false);
  const [zelleReconcile, setZelleReconcile] = useState(null);
  const zelleInputRef = useRef(null);
  const isCard = mth === "Credit card";
  const isCheck = mth === "Check";
  const isAch = mth === "ACH";
  const isZelle = mth === "Zelle";

  useEffect(() => {
    let cancelled = false;
    fetchSolaIfieldsConfig()
      .then((cfg) => {
        if (!cancelled) setAchEnabled(Boolean(cfg.achEnabled));
      })
      .catch(() => {
        if (!cancelled) setAchEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const inv = job.invoiceNo || "";
  const payAmt = parseFloat(String(amt).replace(/[$,]/g, "")) || 0;
  const chargeTotal = isCard ? totalWithFee(payAmt, includeFee) : payAmt;
  const processing = payPhase !== "idle" || zelleAnalyzing;

  const validateManual = () => {
    if (alreadyPaid) {
      showToast("Invoice already paid in LE Pro — sync from QuickBooks first");
      return false;
    }
    if (payAmt <= 0) {
      showToast("Enter a payment amount");
      return false;
    }
    if (payAmt > due + 0.01) {
      showToast("Amount exceeds open balance " + fmt$(due));
      return false;
    }
    return true;
  };

  const buildPaymentNote = (payRef, proofName) => {
    if (isCheck && payRef) return "Check #" + payRef;
    if (isZelle) {
      const bits = [payRef ? "Zelle ref " + payRef : "", proofName ? "proof: " + proofName : ""].filter(Boolean);
      return bits.length ? bits.join(" · ") : "";
    }
    if (isAch) {
      const bits = [achName, achRouting ? "routing " + achRouting : "", achAccount ? "acct …" + achAccount.slice(-4) : ""]
        .filter(Boolean)
        .join(" · ");
      return bits;
    }
    return "";
  };

  const stagePaymentOnJob = (targetJob, entry) => {
    const patch = appendPayment(targetJob, entry);
    const remaining = parseFloat(String(patch.openBalance)) || 0;
    if (patch.paid) {
      showToast("Payment staged — Save & sync to record in QuickBooks");
    } else {
      showToast("Partial payment staged — " + fmt$(remaining) + " remaining. Save & sync for QuickBooks.");
    }
    patchJob(targetJob.id, patch);
    onClose();
  };

  const commitZellePayment = (targetJob, { amount: useAmt, ref: useRef, zelleVerified: verified }) => {
    const d = dt || todayStr();
    const proofName = zelleFile?.name || "";
    const payRef = useRef || ref;
    const note = buildPaymentNote(payRef, proofName);
    stagePaymentOnJob(targetJob, {
      amount: useAmt ?? payAmt,
      method: mth,
      ref: payRef,
      date: d,
      note: note || undefined,
      zelleVerified: Boolean(verified),
      zelleProofName: proofName,
    });
  };

  const saveManual = () => {
    if (!validateManual()) return;
    const d = dt || todayStr();
    const note = buildPaymentNote(ref, zelleFile?.name || "");
    stagePaymentOnJob(job, {
      amount: payAmt,
      method: mth,
      ref,
      date: d,
      note: note || undefined,
      zelleVerified: zelleVerified,
      zelleProofName: zelleFile?.name || "",
    });
  };

  const recordZelleWithScreenshot = async () => {
    if (!validateManual()) return;
    setZelleAnalyzing(true);
    try {
      const extracted = await analyzeZelleScreenshot(zelleB64, zelleFile?.type || "image/jpeg");
      const result = reconcileZellePayment({
        extracted,
        entered: { amount: payAmt, ref, date: dt, invoiceNo: inv },
        job,
        jobs,
      });
      if (result.status === "full_match") {
        setZelleVerified(true);
        setRef(result.confirmationRef || ref);
        commitZellePayment(job, {
          ref: result.confirmationRef,
          zelleVerified: true,
        });
        return;
      }
      setZelleReconcile(result);
    } catch (e) {
      showToast("Screenshot read failed — " + String((e && e.message) || "enter reference manually"));
    } finally {
      setZelleAnalyzing(false);
    }
  };

  const onRecordPayment = () => {
    if (isZelle && zelleB64) {
      recordZelleWithScreenshot();
      return;
    }
    saveManual();
  };

  const onZelleReconcileAction = (action) => {
    if (action === "cancel") {
      setZelleReconcile(null);
      return;
    }
    if (action === "replace_photo") {
      setZelleReconcile(null);
      setZelleFile(null);
      setZelleB64("");
      setZelleVerified(false);
      if (zelleInputRef.current) zelleInputRef.current.value = "";
      zelleInputRef.current?.click();
      return;
    }
    if (action === "manual") {
      setZelleReconcile(null);
      saveManual();
      return;
    }
    const ex = zelleReconcile?.extracted || {};
    const target = zelleReconcile?.targetJob || job;
    const confRef = String(ex.confirmationNumber || ref || "").trim();
    if (action === "use_screenshot_amount") {
      setAmt(String(ex.amount));
      commitZellePayment(job, { amount: ex.amount, ref: confRef, zelleVerified: true });
    } else if (action === "keep_amount") {
      commitZellePayment(job, { ref: confRef, zelleVerified: Boolean(confRef) });
    } else if (action === "move_invoice") {
      if (!target?.id || String(target.invoiceNo) !== String(zelleReconcile?.fields?.invoice?.extracted)) {
        showToast("No matching invoice for #" + (zelleReconcile?.fields?.invoice?.extracted || ""));
        return;
      }
      commitZellePayment(target, { ref: confRef, zelleVerified: true });
    } else if (action === "keep_invoice") {
      commitZellePayment(job, { ref: confRef, zelleVerified: Boolean(confRef) });
    } else if (action === "move_address") {
      if (!target?.id) {
        showToast("No matching job for memo address");
        return;
      }
      commitZellePayment(target, { ref: confRef, zelleVerified: true });
    } else if (action === "keep_here") {
      commitZellePayment(job, { ref: confRef, zelleVerified: Boolean(confRef) });
    }
    setZelleReconcile(null);
  };

  const processCard = async () => {
    if (alreadyPaid) return;
    if (!inv) {
      showToast("Invoice # required to charge a card");
      return;
    }
    if (payAmt <= 0) {
      showToast("Enter a payment amount");
      return;
    }
    if (payAmt > due + 0.01) {
      showToast("Amount exceeds open balance " + fmt$(due));
      return;
    }
    if (!useSavedCard && !cardReady) {
      showToast("Card fields still loading — wait a moment");
      return;
    }
    if (useSavedCard && !job.solaCardToken) {
      showToast("No card on file — enter card details");
      return;
    }
    setPayErr("");
    setPayPhase("tokenizing");
    try {
      let tokens = {};
      if (!useSavedCard) {
        tokens = await tokenizeSolaCard();
      }
      setPayPhase("charging");
      const res = await chargeCardInApp({
        job,
        principalAmount: payAmt,
        includeFee,
        saveOnFile: saveOnFile && !useSavedCard,
        xToken: useSavedCard ? job.solaCardToken : "",
        ...tokens,
      });
      await refreshJobs(true);
      showToast(
        res.ref
          ? `Card approved — ${fmt$(res.amount)} recorded (ref ${res.ref})`
          : `Card approved — ${fmt$(res.amount)} recorded`
      );
      onClose();
    } catch (e) {
      setPayErr(String((e && e.message) || "Payment failed"));
      showToast(String((e && e.message) || "Payment failed"));
    } finally {
      setPayPhase("idle");
    }
  };
  const onZelleProof = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setZelleFile(file);
    setZelleVerified(false);
    try {
      const b64 = await fileToBase64(file);
      setZelleB64(b64);
      showToast("Screenshot attached — will verify on Record");
    } catch {
      showToast("Could not read image file");
      setZelleFile(null);
      setZelleB64("");
    }
  };

  return (
    <>
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
        <select
          className="input"
          value={mth}
          onChange={(e) => {
            setMth(e.target.value);
            setPayErr("");
          }}
          aria-label="Payment method"
          disabled={processing}
        >
          <option value="">— choose —</option>
          {PAY_METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </Fld>

      {isCard ? (
        <>
          {!inv ? (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-2">
              This job needs an invoice # before you can charge a card in the app.
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3 mb-2 py-1">
            <span className="text-sm text-slate-600">Add 3.5% processing fee</span>
            <Toggle small on={includeFee} onChange={setIncludeFee} label="Add processing fee" />
          </div>
          {job.solaCardToken ? (
            <div className="flex items-center justify-between gap-3 mb-2 py-1">
              <span className="text-sm text-slate-600">
                Use card on file{job.solaCardMasked ? " (" + job.solaCardMasked + ")" : ""}
              </span>
              <Toggle small on={useSavedCard} onChange={setUseSavedCard} label="Use saved card" />
            </div>
          ) : null}
          {!useSavedCard ? (
            <div className="flex items-center justify-between gap-3 mb-2 py-1">
              <span className="text-sm text-slate-600">Save card on file</span>
              <Toggle small on={saveOnFile} onChange={setSaveOnFile} label="Save card on file" />
            </div>
          ) : null}
          {payAmt > 0 && includeFee ? (
            <p className="text-xs text-slate-500 mb-2">
              Charge <b>{fmtMoneyPrecise(chargeTotal)}</b> · credit <b>{fmt$(payAmt)}</b>
            </p>
          ) : null}
          {!useSavedCard ? (
            <SolaCardForm disabled={processing || alreadyPaid || !inv} onReadyChange={setCardReady} />
          ) : (
            <p className="text-xs text-slate-500 mb-2">Saved card will be charged — toggle off to enter a new card.</p>
          )}
          {payErr ? (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-2">{payErr}</p>
          ) : null}
        </>
      ) : isAch ? (
        <>
          <Fld label="Account holder name">
            <input className="input" value={achName} onChange={(e) => setAchName(e.target.value)} disabled={processing} />
          </Fld>
          <Fld label="Routing number">
            <input className="input" inputMode="numeric" value={achRouting} onChange={(e) => setAchRouting(e.target.value)} disabled={processing} />
          </Fld>
          <Fld label="Account number">
            <input className="input" inputMode="numeric" value={achAccount} onChange={(e) => setAchAccount(e.target.value)} disabled={processing} />
          </Fld>
          <Fld label="Reference (optional)">
            <input className="input" placeholder="Confirmation #" value={ref} onChange={(e) => setRef(e.target.value)} disabled={processing} />
          </Fld>
          <Fld label="Date">
            <input className="input" type="date" value={dt} onChange={(e) => setDt(e.target.value)} disabled={processing} />
          </Fld>
          {!achEnabled ? (
            <p className="text-[11px] text-slate-400 -mt-1 mb-1">
              ACH debit via Sola will show Process payment once enabled on your Sola account.
            </p>
          ) : null}
        </>
      ) : isZelle ? (
        <>
          <Fld label="Zelle reference #" hint="Confirmation or memo from the bank">
            <input
              className="input"
              placeholder="Reference #"
              value={ref}
              onChange={(e) => {
                setRef(e.target.value);
                setZelleVerified(false);
              }}
              disabled={processing}
            />
            {zelleVerified ? (
              <p className="text-[11px] text-emerald-600 mt-1 font-medium" data-testid="zelle-verified">
                ✓ Verified from screenshot
              </p>
            ) : null}
          </Fld>
          <Fld label="Screenshot (optional)" hint="Zelle email or bank app — auto-reads amount, confirmation #, memo">
            <input
              ref={zelleInputRef}
              className="input text-sm"
              type="file"
              accept="image/*"
              onChange={onZelleProof}
              disabled={processing}
              data-testid="zelle-screenshot-input"
            />
            {zelleFile ? <p className="text-[11px] text-slate-500 mt-1">Attached: {zelleFile.name}</p> : null}
          </Fld>
          <Fld label="Date">
            <input className="input" type="date" value={dt} onChange={(e) => setDt(e.target.value)} disabled={processing} />
          </Fld>
        </>
      ) : (
        <>
          <Fld label={isCheck ? "Check number" : "Reference / check #"} hint={isCheck ? "Required for check deposits" : "Optional"}>
            <input
              className="input"
              placeholder={isCheck ? "Check #" : "Optional"}
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              disabled={processing}
            />
          </Fld>
          <Fld label="Date">
            <input className="input" type="date" value={dt} onChange={(e) => setDt(e.target.value)} disabled={processing} />
          </Fld>
        </>
      )}

      {isCard ? (
        <button
          className="btn bg-emerald-500 text-white w-full mt-3"
          onClick={processCard}
          disabled={alreadyPaid || processing || !inv || (!useSavedCard && !cardReady) || (useSavedCard && !job.solaCardToken)}
          data-testid="process-card-payment"
        >
          {payPhase === "tokenizing"
            ? "Reading card…"
            : payPhase === "charging"
              ? "Processing payment…"
              : "💳 Process card payment"}
        </button>
      ) : isAch && achEnabled ? (
        <button
          className="btn bg-emerald-500 text-white w-full"
          onClick={onRecordPayment}
          disabled={alreadyPaid || processing || !achRouting || !achAccount}
          data-testid="process-ach-payment"
        >
          🏦 Process ACH payment
        </button>
      ) : (
        <button
          className="btn bg-emerald-500 text-white w-full"
          onClick={onRecordPayment}
          disabled={alreadyPaid || processing}
          data-testid="record-payment"
        >
          {zelleAnalyzing ? "Reading screenshot…" : "✓ Record payment"}
        </button>
      )}
      <p className="text-[11px] text-slate-400 text-center mt-2">
        {isCard
          ? "Card is charged now via Sola. QuickBooks records automatically — no Save & sync needed."
          : isAch && achEnabled
            ? "ACH will debit via Sola once processing is wired — staged for now."
            : "Staged now — QuickBooks records it when you hit Save & sync."}
      </p>
    </Sheet>
    {zelleReconcile ? (
      <ZelleReconcileSheet
        reconcile={zelleReconcile}
        onAction={onZelleReconcileAction}
        onClose={() => setZelleReconcile(null)}
      />
    ) : null}
    </>
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
export function PdfViewer({ job, kind, no, compact, children }) {
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
  if (compact) {
    return (
      <div className="flex gap-2 mb-2 w-full" data-testid="doc-view-row">
        <button type="button" className="btn flex-1 !py-2.5 bg-brand-soft text-brand font-semibold" onClick={view}>
          View PDF
        </button>
        {children}
      </div>
    );
  }
  return <Opt icon="📄" title="View PDF" note="Opens full screen · live from QuickBooks" onClick={view} />;
}

/* ---------- 2a-pay. Payment menu (record vs link) ---------- */
export function PaymentMenuSheet({ job, onClose, onRecord, onLink }) {
  return (
    <Sheet title={"Payment — " + (job.customer || "")} onClose={onClose}>
      <Opt icon="💵" title="Record a payment" note="Cash, check, Zelle, or charge card in the app" onClick={onRecord} />
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
export function DocSheet({ job, kind, onClose, onEdit, onConvert }) {
  const doSend = useDoSend();
  const no = kind === "invoice" ? job.invoiceNo : job.estimateNo;
  const qboPath = kind === "invoice" ? "invoices" : "estimates";
  const due = openBalance(job);
  const label = kind === "invoice" ? "invoice" : "estimate";
  return (
    <Sheet title={(kind === "invoice" ? "Invoice " : "Estimate ") + (no || "")} onClose={onClose}>
      <div className="text-sm space-y-1 mb-3">
        <div><b className="font-semibold">Customer</b> <span className="text-slate-600">{job.customer || ""}</span></div>
        <div><b className="font-semibold">Amount</b> <span className="text-slate-600">{fmt$(job.amount)}</span></div>
        {kind === "invoice" && (
          <div><b className="font-semibold">Status</b> <span className="text-slate-600">{job.paid ? "Paid" : "Open"}</span></div>
        )}
      </div>

      {no ? (
        <PdfViewer job={job} kind={kind} no={no} compact>
          <button
            type="button"
            className="btn flex-1 !py-2.5 bg-slate-100 text-slate-800 font-semibold"
            onClick={() => window.open("https://qbo.intuit.com/app/" + qboPath)}
          >
            Open in QuickBooks
          </button>
        </PdfViewer>
      ) : null}

      {job.email ? (
        <div className="flex gap-2 mb-2" data-testid="doc-send-row">
          {kind === "invoice" && due > 0.01 ? (
            <button
              type="button"
              className="btn flex-1 !py-2.5 bg-brand text-white font-semibold"
              onClick={() => {
                doSend(job, kind, { includePaymentLink: true });
                onClose();
              }}
            >
              Send with payment link
            </button>
          ) : null}
          <button
            type="button"
            className="btn flex-1 !py-2.5 bg-brand-soft text-brand font-semibold"
            onClick={() => {
              doSend(job, kind);
              onClose();
            }}
          >
            {kind === "invoice" && due > 0.01 ? "Send invoice only" : "Send " + label}
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-slate-400 text-center mb-2">Add an email on the customer card to send.</p>
      )}

      {onEdit ? (
        <button type="button" className="btn-ghost w-full !py-2.5 mb-1 font-semibold" onClick={onEdit} data-testid="doc-edit">
          Edit {label}
        </button>
      ) : null}

      {kind === "estimate" && !job.invoiceNo && onConvert ? (
        <Opt icon="🧾" title="Convert to invoice" note="Bill all or part of this estimate" onClick={onConvert} />
      ) : null}
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
  const { events, commands, patchJob, patchAndSave, enqueue, patchLocalEvent, showToast, effectiveJob } = useStore();
  const [mode, setMode] = useState("menu"); // menu | add | pick | unlink | view
  const [unlinking, setUnlinking] = useState(false);
  const liveJob = effectiveJob(job.id) || job;
  const event = useMemo(() => eventForJob(liveJob, events), [liveJob, events]);
  const cal = useMemo(() => jobCalendarLinkState(liveJob, events, commands), [liveJob, events, commands]);
  const linked = cal.confirmed || cal.pending;
  const d =
    (liveJob.status && liveJob.status.Scheduled && liveJob.status.Scheduled.d) ||
    (liveJob.followUp && liveJob.followUp.date) ||
    (event ? evStart(event).slice(0, 10) : "");
  const gcalUrl = googleCalendarOpenUrl({
    event: linked && event ? event : null,
    dateYmd: d,
    account: CAL_ACCOUNT,
  });

  if (mode === "view" && event) {
    return <AppointmentDetailSheet event={event} onClose={() => setMode("menu")} />;
  }

  if (mode === "add") return <AddAppointmentSheet job={liveJob} onClose={() => setMode("menu")} />;
  if (mode === "pick") return <PickAppointmentSheet job={liveJob} onClose={() => setMode("menu")} onLinked={onClose} />;

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
                event: event || { id: liveJob.calEventId, description: "" },
                job: liveJob,
                jobId: liveJob.id,
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
      {linked ? (
        <Opt
          icon="👁️"
          title="View linked appointment"
          note={event ? (event.summary || "Open full details") : "Pull calendar sync to load details"}
          onClick={() => (event ? setMode("view") : showToast("Pull calendar sync first"))}
          data-testid="view-linked-appointment"
        />
      ) : (
        <Opt
          icon="🔗"
          title="Link existing appointment"
          note="Search calendar appointments"
          onClick={() => setMode("pick")}
        />
      )}
      {linked ? (
        <Opt icon="⛓️‍💥" title="Unlink appointment" note="Keeps the event on Google Calendar" onClick={() => setMode("unlink")} />
      ) : null}
      <Opt
        icon="📅"
        title={linked ? "Open linked appointment in Google Calendar" : "Open Google Calendar"}
        note={d ? (linked ? "Opens this appointment · " + d : "Jumps to " + d) : linked ? "Opens linked appointment" : ""}
        onClick={() => window.open(gcalUrl)}
        data-testid="open-gcal"
      />
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
        note="Search appointments back one year+"
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
