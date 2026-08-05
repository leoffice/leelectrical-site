// Login notices for customer pay-page check photos (and bank Zelle alerts).
// Levi: see picture → zoom → Autofill → correct → Approve → stages payment on the job.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore, useStoreData } from "../state/store.jsx";
import { appendPayment, normalizePayments, removePayment } from "../lib/payments.js";
import { analyzePaymentImage, compressImageForVision, fileToBase64 } from "../lib/paymentVision.js";
import {
  hasStrongPaymentAutofill,
  hasUsefulPaymentAutofill,
  paymentAutofillPatch,
} from "../lib/paymentAutofill.js";
import { buildPaymentVisionLearningEntry } from "../lib/paymentVisionLearning.js";
import { getDepositBanks } from "../lib/chatPayment.js";
import { fmt$, parseAmount, todayStr } from "../lib/format.js";
import PaymentImageZoom from "./PaymentImageZoom.jsx";
import DismissSnoozePanel from "./DismissSnoozePanel.jsx";
import { Fld } from "./Sheet.jsx";
import { isSuggestionSnoozed, snoozeSuggestion } from "../lib/dismissSnooze.js";

const IS_TEST = typeof process !== "undefined" && process.env && process.env.NODE_ENV === "test";

/** Score open invoices for "Where does it go?" shortlist (Levi 2026-08-03). */
function scoreJobForPayment(job, { amount, memo, fromName, query }) {
  if (!job) return -1;
  const open = parseAmount(job.openBalance);
  const paid = job.paid === true || (job.status?.Paid && job.status.Paid.s === "done");
  if (paid && open <= 0.01) return -1;
  // Prefer jobs with some balance or an invoice #
  const inv = String(job.invoiceNo || "").trim();
  if (!inv && open <= 0) return -1;
  let score = 0;
  const payAmt = parseAmount(amount);
  if (payAmt > 0 && open > 0) {
    if (Math.abs(open - payAmt) < 0.02) score += 100;
    else if (Math.abs(open - payAmt) <= 1) score += 60;
    else if (payAmt <= open + 0.02) score += 25;
  }
  const blob = [
    job.customer,
    job.customerName,
    job.serviceAddress,
    job.address,
    job.billingAddress,
    inv,
    job.memo,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const memoL = String(memo || "").toLowerCase();
  const fromL = String(fromName || "").toLowerCase();
  const q = String(query || "").toLowerCase().trim();
  if (memoL) {
    for (const tok of memoL.split(/[^a-z0-9]+/).filter((t) => t.length >= 3)) {
      if (blob.includes(tok)) score += 20;
    }
  }
  if (fromL) {
    for (const tok of fromL.split(/[^a-z0-9]+/).filter((t) => t.length >= 3)) {
      if (blob.includes(tok)) score += 12;
    }
  }
  if (q) {
    if (blob.includes(q)) score += 50;
    for (const tok of q.split(/[^a-z0-9.$]+/).filter((t) => t.length >= 2)) {
      if (blob.includes(tok)) score += 15;
      const n = parseAmount(tok);
      if (n > 0 && (Math.abs(open - n) < 0.02 || String(inv) === tok.replace(/^#/, ""))) score += 40;
    }
  }
  if (open > 0) score += 5;
  return score;
}

function rankJobsForPayment(jobs, opts, limit = 12) {
  return (jobs || [])
    .map((j) => ({ job: j, score: scoreJobForPayment(j, opts) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || parseAmount(a.job.openBalance) - parseAmount(b.job.openBalance))
    .slice(0, limit);
}

/** Snooze bucket for one payment notice — see lib/dismissSnooze.js. */
function paymentSnoozeKey(item) {
  return "payment:" + String(item?.id || "");
}

/** Statuses that still need Levi to see a card (Levi 2026-08-03 sticky notice). */
function isOpenPaymentNotice(p) {
  if (!p) return false;
  const s = String(p.status || "pending");
  if (s === "dismissed" || s === "acked") return false;
  // Host auto-apply used to set approved+autoApplied and the card vanished — keep sticky until Got it.
  if (p.autoApplied && !p.ackedAt && (s === "approved" || s === "auto_applied")) return true;
  if (s === "approved") return false;
  if (s === "pending" || s === "auto_applied" || s === "needs_match") return true;
  return false;
}

function collectPending(jobs, systemItems = []) {
  const out = [];
  const seen = new Set();
  for (const j of jobs || []) {
    const p = j?.pendingCheckPayment || j?.pendingZellePayment;
    if (!isOpenPaymentNotice(p)) continue;
    const id = p.id || `${j.id}-${p.proofKey || p.confirmationNumber || p.amount}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...p, jobId: j.id, job: j, id });
  }
  for (const p of systemItems || []) {
    if (!isOpenPaymentNotice(p)) continue;
    const id = p.id || `sys-${p.proofKey || p.confirmationNumber || p.amount}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const job = (jobs || []).find((j) => String(j.id) === String(p.jobId)) || null;
    out.push({ ...p, id, job });
  }
  // Newest first
  out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  // A snoozed notice is still pending — it just isn't due yet.
  return out.filter((p) => !isSuggestionSnoozed(paymentSnoozeKey(p)));
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
  const [snoozing, setSnoozing] = useState(false);
  /** When true, show full edit form even if notice was auto-applied (Levi Edit). */
  const [editMode, setEditMode] = useState(false);
  /** Session-local closed ids/confs so poll/save lag cannot re-show after Got it (Levi 2026-08-03). */
  const [closedKeys, setClosedKeys] = useState(() => new Set());
  /** Levi picks job for unmatched payments. */
  const [pickJobId, setPickJobId] = useState("");
  const [pickQuery, setPickQuery] = useState("");
  /** After Levi taps a match, collapse other suggestions (Levi 2026-08-05). */
  const [pickLocked, setPickLocked] = useState(false);
  /** Focus search when he taps Change on suggested customer/invoice (Levi 2026-08-05). */
  const jobSearchRef = useRef(null);
  const jobPickerRef = useRef(null);
  const focusSearchAfterEdit = useRef(false);
  const depositBanks = useMemo(() => getDepositBanks(), []);

  const focusJobPicker = useCallback((opts = {}) => {
    const { clearPick = false, seedQuery = "" } = opts;
    setEditMode(true);
    if (clearPick) setPickJobId("");
    if (seedQuery != null && seedQuery !== "") setPickQuery(String(seedQuery));
    // Picker may not be mounted yet (auto-applied card) — focus after paint via effect.
    focusSearchAfterEdit.current = true;
  }, []);

  useEffect(() => {
    if (!focusSearchAfterEdit.current) return;
    if (!editMode && !current) return;
    // Wait for job picker DOM after leaving auto-ack / opening Change.
    const t = setTimeout(() => {
      if (!focusSearchAfterEdit.current) return;
      focusSearchAfterEdit.current = false;
      try {
        jobPickerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
        jobSearchRef.current?.focus?.();
        jobSearchRef.current?.select?.();
      } catch {
        /* ignore */
      }
    }, 50);
    return () => clearTimeout(t);
  }, [editMode, current?.id, pickJobId]);

  const noticeKey = useCallback((p) => {
    if (!p) return "";
    const conf = String(p.confirmationNumber || p.ref || p.checkNumber || "").trim();
    return conf || String(p.id || "");
  }, []);

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

  const queue = useMemo(() => {
    const raw = collectPending(jobs, systemItems);
    if (!closedKeys.size) return raw;
    return raw.filter((p) => {
      const k = noticeKey(p);
      return !k || !closedKeys.has(k);
    });
  }, [jobs, systemItems, closedKeys, noticeKey]);

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
    // A new notice always opens on the card, never on the snooze picker.
    setSnoozing(false);
    setEditMode(false);
    setPickJobId(current.jobId || "");
    setPickQuery("");
    // Pre-matched job: show only that row until Levi searches again.
    setPickLocked(Boolean(current.jobId));
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearPending = useCallback(
    async (item, status) => {
      const k = noticeKey(item);
      if (k) setClosedKeys((prev) => new Set([...prev, k]));
      const now = Date.now();
      const done = status === "acked" || status === "dismissed";
      if (item.jobId) {
        const key = item.kind === "zelle" ? "pendingZellePayment" : "pendingCheckPayment";
        // Clear the field on Got it/dismiss so overlay merge cannot resurrect auto_applied.
        if (done) {
          patchJob(item.jobId, { [key]: null });
        } else {
          patchJob(item.jobId, {
            [key]: {
              ...(item.job?.[key] || item),
              status,
              resolvedAt: now,
              ackedAt: done ? now : item.ackedAt,
            },
          });
        }
      }
      const conf = String(item.confirmationNumber || item.ref || "").trim();
      const drop = (list) =>
        (list || []).filter((x) => {
          if (x.id === item.id) return false;
          if (conf && String(x.confirmationNumber || x.ref || "").trim() === conf) return false;
          return isOpenPaymentNotice({ ...x, status: x.status === "acked" ? "acked" : x.status });
        });
      let openList = [];
      setSystemItems((prev) => {
        openList = drop(prev);
        return openList;
      });
      // Persist system queue + job overlay (Got it must stick — Levi 2026-08-03 bounce bug).
      try {
        const { default: api } = await import("../data/adapter.js");
        // Re-read latest system list if possible so we don't clobber concurrent items.
        let base = openList;
        try {
          const remote = await api.getPendingPayments?.();
          if (Array.isArray(remote)) base = drop(remote);
        } catch {
          /* use openList */
        }
        await api.savePendingPayments?.(base);
        setSystemItems(base);
      } catch {
        /* optional */
      }
      if (done) {
        try {
          await saveAll?.();
        } catch {
          /* toast below */
        }
      }
    },
    [patchJob, saveAll, noticeKey]
  );

  const onGotIt = async () => {
    if (!current) return;
    setBusy(true);
    try {
      await clearPending(current, "acked");
      setCurrent(null);
      showToast("Got it — payment notice closed");
    } finally {
      setBusy(false);
    }
  };

  const onDismiss = async () => {
    if (!current) return;
    setBusy(true);
    try {
      await clearPending(current, "dismissed");
      setCurrent(null);
      setSnoozing(false);
      showToast("Payment notice dismissed");
    } finally {
      setBusy(false);
    }
  };

  // Board-wide rule: ✕ / "not now" parks the notice instead of dropping it.
  const onSnooze = (minutes) => {
    if (!current) return;
    snoozeSuggestion(paymentSnoozeKey(current), minutes);
    setSnoozing(false);
    setCurrent(null);
    showToast("OK — I'll bring this payment back up later");
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
      // Prefer original bytes — canvas compress on tablets washes checks blank.
      const prepared = await compressImageForVision(file);
      const kindHint = current.kind === "zelle" ? "zelle" : "check";
      let learningEntries = [];
      try {
        learningEntries =
          (await Promise.race([
            getPaymentVisionLearning?.().then((x) => x || []),
            new Promise((resolve) => setTimeout(() => resolve([]), 1200)),
          ])) || [];
      } catch {
        learningEntries = [];
      }
      let { extracted } = await analyzePaymentImage(
        prepared.b64,
        prepared.mime || "image/jpeg",
        kindHint,
        file.name,
        { learningEntries }
      );
      if (!hasStrongPaymentAutofill(extracted) && prepared.usedCompress) {
        try {
          const origB64 = await fileToBase64(file);
          const retry = await analyzePaymentImage(origB64, file.type || "image/jpeg", kindHint, file.name, {
            learningEntries: [],
            _retriedClean: true,
          });
          if (hasStrongPaymentAutofill(retry?.extracted) || hasUsefulPaymentAutofill(retry?.extracted)) {
            extracted = retry.extracted;
          }
        } catch {
          /* keep first */
        }
      }
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
      const msg = String((e && e.message) || "");
      const short =
        /glitch|reach the check reader|Vision failed|502|422|xAI|API key/i.test(msg)
          ? "Check reader didn't respond — try Autofill again, or fill amount + number and Approve (that trains it)"
          : "Could not read photo — fill fields and Approve to train" + (msg ? ". " + msg : "");
      showToast(short);
    } finally {
      setAutofillBusy(false);
    }
  };

  const matchCandidates = useMemo(() => {
    if (!current) return [];
    const ranked = rankJobsForPayment(jobs, {
      amount: amt || current.amount,
      memo: memo || current.memo,
      fromName: current.fromName || current.payer,
      query: pickQuery,
    });
    // Keep the current suggestion visible even if score is weak / list is short.
    const pinnedId = String(pickJobId || current.jobId || "").trim();
    if (pinnedId && !ranked.some((x) => String(x.job.id) === pinnedId)) {
      const pinned = (jobs || []).find((j) => String(j.id) === pinnedId);
      if (pinned) ranked.unshift({ job: pinned, score: 0 });
    }
    return ranked;
  }, [jobs, current, amt, memo, pickQuery, pickJobId]);

  const onApprove = async () => {
    if (!current) return;
    let job =
      (pickJobId && (jobs || []).find((j) => String(j.id) === String(pickJobId))) ||
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
      showToast("Pick a customer / invoice first — search below");
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
      // If suggestion pointed at the wrong job (auto-apply / weak match), pull that payment off first.
      const prevJobId = String(current.jobId || current.job?.id || "").trim();
      if (prevJobId && String(prevJobId) !== String(job.id)) {
        const prevJob =
          (jobs || []).find((j) => String(j.id) === prevJobId) || current.job || null;
        if (prevJob) {
          const confs = new Set(
            [payRef, current.confirmationNumber, current.ref, current.checkNumber]
              .map((x) => String(x || "").trim())
              .filter(Boolean)
          );
          const existing = normalizePayments(prevJob).find((p) => {
            const r = String(p.ref || p.confirmationNumber || p.checkNumber || "").trim();
            return r && confs.has(r);
          });
          if (existing?.id) {
            const cleared = removePayment(prevJob, existing.id, {
              reason: "Reassigned from payment notice",
            });
            const clearKey =
              method === "Zelle" ? "pendingZellePayment" : "pendingCheckPayment";
            patchJob(prevJob.id, { ...cleared, [clearKey]: null });
          } else {
            const clearKey =
              method === "Zelle" ? "pendingZellePayment" : "pendingCheckPayment";
            patchJob(prevJob.id, { [clearKey]: null });
          }
        }
      }
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
      // Already on the chosen job from a correct auto-apply — don't double-book the same conf.
      const alreadyOnJob =
        payRef &&
        normalizePayments(job).some(
          (p) => String(p.ref || p.confirmationNumber || "").trim() === payRef
        );
      const noteBits = [
        method,
        payRef ? (method === "Check" ? `Check #${payRef}` : `ref ${payRef}`) : "",
        memo ? `memo ${memo}` : "",
        current.proofKey ? `proof:${current.proofKey}` : "",
        deposit ? `Deposit: ${deposit}` : "",
        "Approved from pay-page notice",
      ].filter(Boolean);
      const patch = alreadyOnJob
        ? {
            paid: job.paid,
            openBalance: job.openBalance,
          }
        : appendPayment(job, {
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
            ? "Marked paid and saved — QuickBooks catches up in the background · fixes train the reader"
            : `Partial payment approved (${fmt$(payAmt)}) — saved · fixes train the reader`
        );
      } catch {
        showToast(
          patch.paid
            ? "Marked paid — tap Save & sync so QuickBooks catches up"
            : `Partial payment staged (${fmt$(payAmt)}) — tap Save & sync to finish`
        );
      }
    } finally {
      setBusy(false);
    }
  };

  if (IS_TEST || loading || !current) return null;

  const job = current.job;
  // Always honor Levi's pick over the suggestion (suggestions can be wrong).
  const selectedJob =
    (pickJobId && (jobs || []).find((j) => String(j.id) === String(pickJobId))) ||
    job ||
    null;
  const isAutoApplied =
    Boolean(current.autoApplied) || String(current.status || "") === "auto_applied";
  const needsMatch =
    String(current.status || "") === "needs_match" ||
    (!current.invoiceNo && !current.customer) ||
    (!job && String(current.status || "") === "pending");
  // Suggestion always editable — show picker even when a job was pre-matched (Levi 2026-08-05).
  const showJobPicker = true;
  const showAckCard = isAutoApplied && !editMode;
  const title = showAckCard
    ? "Payment applied — confirm"
    : needsMatch || !selectedJob
      ? "A payment came in"
      : current.kind === "zelle"
        ? "Zelle payment received"
        : "Check photo from pay page";
  const inv = selectedJob?.invoiceNo || current.invoiceNo || "";
  const cust = selectedJob?.customer || selectedJob?.customerName || current.customer || "";
  const confLine = String(
    current.confirmationNumber || current.ref || current.checkNumber || ""
  ).trim();
  const payAmtLine = String(current.amount || current.extracted?.amount || "").trim();
  const openDue =
    selectedJob?.openBalance != null && selectedJob?.openBalance !== ""
      ? fmt$(selectedJob.openBalance)
      : selectedJob?.amount
        ? fmt$(selectedJob.amount)
        : "";
  const fromLine = String(current.fromName || current.payer || "").trim();
  const memoLine = String(current.memo || current.extracted?.memo || "").trim();
  const dateLine = String(current.date || "").slice(0, 10);
  const suggestionChanged =
    Boolean(pickJobId) &&
    Boolean(current.jobId) &&
    String(pickJobId) !== String(current.jobId);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 p-3"
      data-testid="pending-payment-prompt"
      role="dialog"
      aria-label={title}
    >
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-xl border border-slate-200">
        <div className="px-4 pt-4 pb-2 border-b border-slate-100">
          <button
            type="button"
            aria-label="Close"
            className="float-right w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold text-sm"
            onClick={() => setSnoozing((s) => !s)}
            data-testid="pending-payment-close"
          >
            ✕
          </button>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-brand">
            {showAckCard
              ? "Applied — needs your OK"
              : needsMatch || !selectedJob
                ? "Where does it go?"
                : "Payment to approve"}
          </div>
          <h2 className="text-lg font-extrabold text-slate-900 leading-tight mt-0.5">
            {snoozing ? "Remind me later" : title}
          </h2>
          {/* Match always editable — Change is first/tappable (Levi 2026-08-05 wrong Marozov #251741) */}
          <div className="mt-2 space-y-2" data-testid="pending-payment-summary">
            {cust || inv || !showAckCard ? (
              <button
                type="button"
                className="w-full text-left rounded-xl border-2 border-brand/35 bg-brand/5 px-3 py-2.5 active:bg-brand/10"
                onClick={() =>
                  focusJobPicker({
                    clearPick: false,
                    seedQuery: pickQuery || fromLine || "",
                  })
                }
                data-testid="pending-payment-change-match"
                disabled={busy}
                aria-label="Change customer or invoice"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-brand">
                      {suggestionChanged ? "Applying to" : cust || inv ? "Suggested — tap to change" : "Customer / invoice"}
                    </span>
                    <div className="font-extrabold text-slate-900 truncate mt-0.5">
                      {cust || "Tap to pick customer"}
                    </div>
                    {inv || openDue ? (
                      <div className="text-slate-700 text-xs mt-0.5 font-semibold">
                        {inv ? `#${inv}` : "No inv #"}
                        {openDue ? ` · due ${openDue}` : ""}
                      </div>
                    ) : null}
                  </div>
                  <span className="shrink-0 mt-0.5 text-[12px] font-extrabold uppercase tracking-wide text-white bg-brand rounded-full px-3 py-1">
                    Change
                  </span>
                </div>
              </button>
            ) : null}
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-sm text-slate-800 space-y-1 leading-snug">
              {payAmtLine ? (
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">This payment</span>
                  <div className="font-semibold text-emerald-700">
                    {payAmtLine.startsWith("$") ? payAmtLine : `$${payAmtLine}`}
                  </div>
                </div>
              ) : null}
              {confLine ? (
                <div className={payAmtLine ? "border-t border-slate-200/80 pt-1" : ""}>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {current.kind === "zelle" ? "Confirmation" : "Check #"}
                  </span>
                  <div className="font-mono text-[13px] font-semibold break-all">{confLine}</div>
                </div>
              ) : null}
              {fromLine ? (
                <div className={payAmtLine || confLine ? "border-t border-slate-200/80 pt-1" : ""}>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">From</span>
                  <div className="font-semibold">{fromLine}</div>
                </div>
              ) : null}
              {dateLine ? (
                <div className={payAmtLine || confLine || fromLine ? "border-t border-slate-200/80 pt-1" : ""}>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Date</span>
                  <div className="font-semibold">{dateLine}</div>
                </div>
              ) : null}
              {memoLine ? (
                <div className="border-t border-slate-200/80 pt-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Memo</span>
                  <div className="font-semibold">{memoLine}</div>
                </div>
              ) : null}
              {!cust && !inv && !payAmtLine && !confLine ? (
                <div className="text-slate-600">Review the photo, Autofill, then Approve.</div>
              ) : null}
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            Source: {current.source === "pay_page" ? "Customer pay link" : current.source || "Bank / email"}
          </p>
        </div>

        {snoozing ? (
          <div className="px-4 py-4">
            <DismissSnoozePanel
              lead="A payment that came in never just goes away — when should I bring it back?"
              onSnooze={onSnooze}
              onCancel={() => setSnoozing(false)}
              onDismiss={onDismiss}
            />
          </div>
        ) : showAckCard ? (
          /* Auto-applied Zelle: sticky until Got it / Edit / more info (Levi 2026-08-03) */
          <div className="px-4 py-4 flex flex-col gap-2" data-testid="pending-payment-auto-ack">
            <p className="text-sm text-slate-700 leading-snug">
              We matched this payment and applied it on the job. It stays here until you say Got it,
              Edit, or Get more information.
            </p>
            <button
              type="button"
              className="btn bg-brand text-white w-full font-bold"
              onClick={onGotIt}
              data-testid="pending-payment-got-it"
            >
              Got it
            </button>
            <button
              type="button"
              className="btn bg-slate-800 text-white w-full font-bold"
              onClick={() => setEditMode(true)}
              data-testid="pending-payment-edit"
            >
              Edit
            </button>
            <button
              type="button"
              className="btn bg-amber-700 text-white w-full font-bold"
              onClick={() =>
                focusJobPicker({
                  clearPick: true,
                  seedQuery: String(fromLine || "").trim(),
                })
              }
              data-testid="pending-payment-wrong-match"
            >
              Wrong customer / invoice
            </button>
            <button
              type="button"
              className="btn-ghost w-full text-sm"
              onClick={() =>
                showToast(
                  [
                    confLine ? `Conf ${confLine}` : null,
                    fromLine ? `From ${fromLine}` : null,
                    memoLine ? `Memo ${memoLine}` : null,
                    current.source ? `Source ${current.source}` : null,
                    current.matchScore != null ? `Match score ${current.matchScore}` : null,
                    selectedJob?.id ? `Job ${selectedJob.id}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No extra detail on this notice"
                )
              }
              data-testid="pending-payment-more-info"
            >
              Get more information
            </button>
            <button
              type="button"
              className="btn-ghost w-full text-sm"
              onClick={() => setSnoozing(true)}
              data-testid="pending-payment-not-now"
            >
              Not now — remind me later
            </button>
          </div>
        ) : (
          <>
          {showJobPicker ? (
            <div
              ref={jobPickerRef}
              className="px-4 pt-3 space-y-2 border-b border-slate-100 pb-3"
              data-testid="pending-payment-where"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800 leading-snug">
                  {selectedJob
                    ? "Wrong customer or invoice? Search and pick the right one."
                    : "Pick the customer / open invoice."}
                </p>
              </div>
              <p className="text-xs text-slate-500 -mt-1">
                Search by name, address, invoice #, or amount due. Suggestions are always editable.
              </p>
              <input
                ref={jobSearchRef}
                className="input w-full"
                placeholder="Search customer, address, invoice #, or amount…"
                value={pickQuery}
                onChange={(e) => {
                  // Typing again re-opens the full suggestion list (Levi 2026-08-05).
                  setPickQuery(e.target.value);
                  setPickLocked(false);
                }}
                onFocus={() => {
                  // Focus alone does not expand if already locked — type to change.
                }}
                disabled={busy}
                data-testid="pending-payment-job-search"
                autoComplete="off"
              />
              <div
                className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100"
                data-testid="pending-payment-job-list"
              >
                {(() => {
                  // Once Levi taps a customer/invoice, collapse the list to that
                  // pick only so leftover "likely match" rows disappear.
                  const selectedId = String(pickJobId || selectedJob?.id || "");
                  const rows =
                    pickLocked && selectedId
                      ? matchCandidates.filter(({ job: j }) => String(j.id) === selectedId)
                      : matchCandidates;
                  const showRows =
                    pickLocked && selectedId && rows.length === 0 && selectedJob
                      ? [{ job: selectedJob, score: 100 }]
                      : rows;
                  if (showRows.length === 0) {
                    return (
                      <div className="px-3 py-3 text-sm text-slate-500">
                        No open invoices matched — try another search.
                      </div>
                    );
                  }
                  return showRows.map(({ job: j, score }) => {
                    const selected = selectedId === String(j.id);
                    return (
                      <button
                        type="button"
                        key={j.id}
                        className={`w-full text-left px-3 py-2.5 text-sm ${
                          selected ? "bg-brand/10 ring-inset ring-2 ring-brand" : "bg-white active:bg-slate-50"
                        }`}
                        onClick={() => {
                          setPickJobId(j.id);
                          setPickQuery(
                            String(j.customer || j.customerName || j.invoiceNo || "").trim()
                          );
                          setPickLocked(true);
                        }}
                        data-testid={"pending-payment-job-" + j.id}
                      >
                        <div className="font-extrabold text-slate-900">
                          {j.customer || j.customerName || "Customer"}
                          {selected && pickLocked ? " ✓" : ""}
                        </div>
                        <div className="text-slate-600 text-xs mt-0.5">
                          {j.invoiceNo ? `#${j.invoiceNo}` : "No inv #"}
                          {j.openBalance != null && j.openBalance !== ""
                            ? ` · due ${fmt$(j.openBalance)}`
                            : ""}
                        </div>
                        <div className="text-slate-500 text-xs truncate">
                          {j.serviceAddress || j.address || ""}
                          {!pickLocked && score >= 40 ? " · likely match" : ""}
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>
              {pickLocked ? (
                <p className="text-[11px] text-slate-500">
                  Selected — type in the search box to pick a different customer.
                </p>
              ) : null}
            </div>
          ) : null}
          {current.proofUrl ? (
            <div className="px-4 pt-3">
              <PaymentImageZoom src={current.proofUrl} alt="Check or payment photo" />
            </div>
          ) : null}

          <div className="px-4 py-3 space-y-2.5">
            {current.proofUrl ? (
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
            ) : null}

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
              disabled={busy || (!selectedJob && !pickJobId)}
              data-testid="pending-payment-approve"
            >
              {busy
                ? "Saving…"
                : !selectedJob && !pickJobId
                  ? "Apply to selected invoice"
                  : suggestionChanged
                    ? "Approve on selected invoice"
                    : "Approve payment"}
            </button>
            <button
              type="button"
              className="btn-ghost w-full text-sm"
              onClick={() => setSnoozing(true)}
              disabled={busy}
              data-testid="pending-payment-not-now"
            >
              Not now — remind me later
            </button>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
