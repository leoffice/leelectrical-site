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
import EditAppointmentSheet from "./EditAppointmentSheet.jsx";
import CustomerComposeSheet from "./CustomerComposeSheet.jsx";
import { evStart } from "../lib/format.js";
import { CALENDAR_PICK_EVENT, stashCalendarPick } from "../lib/calendarNavigate.js";
import CustomerSearch from "./CustomerSearch.jsx";
import { enrichAndPatchCustomer } from "./NewJobFlow.jsx";
import AddressAutocompleteField from "./AddressAutocompleteField.jsx";
import { syncBillingFromService } from "../lib/addressSync.js";
import { useStore } from "../state/store.jsx";
import { productName } from "../lib/tenantBranding.js";
import { useTenantConfig } from "../state/tenant.jsx";

import { fmt$, parseAmount, todayStr } from "../lib/format.js";
import { docStorePdfUrl, openPdfBlob, openPdfUrl, downloadPdfBlob } from "../lib/pdfOpen.js";
import { canGenerateLocalDoc, docPdfFilename } from "../lib/jobToQbDoc.js";
import { buildInvoicePdfFromJob, buildEstimatePdfFromJob } from "../lib/invoicePdf.js";
import { chargeCardInApp, fetchSolaIfieldsConfig } from "../lib/solaCharge.js";
import SolaCardForm, { tokenizeSolaCard } from "./SolaCardForm.jsx";
import { fmtMoneyPrecise, totalWithFee } from "../lib/payFees.js";
import { patchFromQboPaymentFetch } from "../lib/qboPayments.js";
import {
  clientKey,
  customerKeyForName,
  fmtAmountDue,
  invoiceTotal,
  jobsForCustomerKey,
  openBalance,
  amountPaid,
  paidPct,
} from "../lib/customers.js";
import { parentCustomerPatch } from "../lib/customerHierarchy.js";
import { buildPaymentLinkEmail } from "../lib/paymentLinkEmail.js";
import { buildShortPayLandingUrl } from "../lib/payLanding.js";
import {
  appendPayment,
  canVoidInQbo,
  fmtPaymentLine,
  movePayment,
  normalizePayments,
  removePayment,
  updatePayment,
} from "../lib/payments.js";
import {
  formatInvoicePayOption,
  invoicesForCustomerPick,
} from "../lib/customerDocLists.js";
import { findJobByInvoice, reconcileZellePayment } from "../lib/zelleReconcile.js";
import {
  paymentAutofillPatch,
  paymentMemoNote,
  invoiceNoFromExtracted,
  hasUsefulPaymentAutofill,
  hasStrongPaymentAutofill,
} from "../lib/paymentAutofill.js";
import { buildPaymentVisionLearningEntry } from "../lib/paymentVisionLearning.js";
import { getDepositBanks } from "../lib/chatPayment.js";
import {
  analyzePaymentImage,
  analyzePaymentScreenshot,
  compressImageForVision,
  fileToBase64,
} from "../lib/paymentVision.js";
import ZelleReconcileSheet from "./ZelleReconcileSheet.jsx";
import PaymentProofFld from "./PaymentProofFld.jsx";
import { sortJobs } from "../lib/stages.js";
import { DATE_STEPS } from "../lib/paperwork.js";
import Toggle from "./Toggle.jsx";
import SubCompanySection from "./SubCompanySection.jsx";
import DocSourcePicker from "./DocSourcePicker.jsx";
import SendDocConfirmSheet from "./SendDocConfirmSheet.jsx";
import {
  DOC_SOURCE_LOCAL,
  DOC_SOURCE_QBO,
  docKindLabel,
  viewLocalLabel,
  viewQboLabel,
} from "../lib/docSource.js";
import { docSendStatusLine } from "../lib/docSendStatus.js";
import { tenantCalendarAccount, tenantSignOff } from "../lib/tenantBranding.js";
import { beginPromptWorkPause } from "../lib/followUpReminders.js";
import { isQuickbooksEnabled, resolveDocSource } from "../lib/qboEnabled.js";
import { useAppSettings } from "../lib/appSettings.js";
import { EMAIL_POLICY_KEEP } from "../lib/sendDocConfirm.js";

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

/**
 * Execute an approved invoice/estimate send.
 * Local path: build PDF in the browser and POST send-doc-email (with pdfB64).
 * QuickBooks path: queue send_* on the command bus.
 * Returns { ok, error?, pending? } — never silently reverts.
 */
export function useDoSend() {
  const { enqueue, logSend, showToast, api, patchAndSave } = useStore();
  return async (job, kind, opts = {}) => {
    const no = kind === "invoice" ? job.invoiceNo : job.estimateNo;
    const email = (opts.email || job.email || "").trim();
    if (!email || !email.includes("@")) {
      showToast("Add a customer email before sending");
      return { ok: false, error: "no_email", pending: true };
    }
    // Keep this email → save on the customer/job before sending.
    if (opts.emailPolicy === EMAIL_POLICY_KEEP && email) {
      try {
        await patchAndSave(job.id, { email });
      } catch {
        /* send still proceeds with this address */
      }
    }
    const due = openBalance(job);
    const withPay =
      kind === "invoice" &&
      due > 0.01 &&
      opts.includePaymentLink !== false;
    // Settings / plan can force local-only (white-label, QuickBooks off).
    const docSource =
      resolveDocSource(opts.docSource === DOC_SOURCE_QBO ? DOC_SOURCE_QBO : DOC_SOURCE_LOCAL) ===
      DOC_SOURCE_QBO
        ? DOC_SOURCE_QBO
        : DOC_SOURCE_LOCAL;
    const message = String(opts.message || "").trim();
    const subject = String(opts.subject || "").trim();
    const label = kind === "invoice" ? "Invoice" : "Estimate";
    const via = docSource === DOC_SOURCE_QBO ? "QuickBooks" : "local PDF";

    // LOCAL: send immediately with client PDF — never queue without pdfB64.
    if (docSource === DOC_SOURCE_LOCAL) {
      if (!canGenerateLocalDoc(job, kind)) {
        const err = "Add line items on this job to build a local PDF — or send the QuickBooks file";
        showToast(err);
        return { ok: false, error: err, pending: true };
      }
      showToast("Sending " + label.toLowerCase() + " to " + email + "…");
      let res = null;
      try {
        if (typeof api.sendDocEmailNow === "function") {
          res = await api.sendDocEmailNow(job, kind, {
            email,
            includePaymentLink: withPay,
            message,
            subject,
            payUrl: opts.payUrl || "",
          });
        }
      } catch (err) {
        res = { ok: false, error: String(err?.message || err) };
      }

      if (res?.ok && res.sent) {
        logSend(
          job.id,
          label + " #" + (no || "") + " emailed (local PDF)" + (withPay ? " + payment link" : ""),
          email
        );
        await patchAndSave(job.id, { _docEmailed: true, _draftChangeOrder: false }).catch(() => {});
        showToast(label + " emailed to " + email);
        return { ok: true, res };
      }

      const noKey = !!(
        res?.dryRun ||
        res?.reason === "no_api_key" ||
        /HTTP 502|no_api_key|error code:\s*502/i.test(String(res?.error || ""))
      );
      const detail = String(
        res?.error || res?.reason || (noKey ? "email_service_retry" : "Send failed")
      ).slice(0, 120);
      // Always queue with pdfB64 on failure so the host can finish via office Gmail
      // (Cloudflare currently 502s without Resend). Never silently drop.
      try {
        const blob =
          kind === "estimate" ? await buildEstimatePdfFromJob(job) : await buildInvoicePdfFromJob(job);
        if (blob && typeof FileReader !== "undefined") {
          const pdfB64 = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onerror = () => reject(r.error || new Error("read failed"));
            r.onloadend = () => {
              const s = String(r.result || "");
              const i = s.indexOf(",");
              resolve(i >= 0 ? s.slice(i + 1) : s);
            };
            r.readAsDataURL(blob);
          });
          const payload =
            kind === "invoice"
              ? {
                  email,
                  invoiceNo: no,
                  customer: job.customer || "",
                  amount: String(due || "").replace(/[$,]/g, ""),
                  includePaymentLink: withPay,
                  docSource: DOC_SOURCE_LOCAL,
                  message,
                  subject,
                  job,
                  pdfB64,
                  filename: docPdfFilename(kind, job, no) || `${kind}-${no || "document"}.pdf`,
                  clientSend: res || { ok: false, reason: detail },
                }
              : {
                  email,
                  estimateNo: no,
                  docSource: DOC_SOURCE_LOCAL,
                  message,
                  subject,
                  job,
                  pdfB64,
                  filename: docPdfFilename(kind, job, no) || `${kind}-${no || "document"}.pdf`,
                  clientSend: res || { ok: false, reason: detail },
                };
          const idk =
            "send_" + kind + ":local:" + (no || job.id) + ":" + Date.now();
          await enqueue("send_" + kind, job.id, payload, "deterministic", idk);
          showToast(
            noKey
              ? "Sending via office email — you'll get a toast when it lands"
              : "Could not send right now (" + detail + "). Queued for retry — check Activity."
          );
          // Queued is NOT sent. Reporting ok:true here closed the confirm sheet
          // as if the document had gone out, while the status line still read
          // "Never sent" — the send never actually happened. Surface it as
          // not-sent-yet so the sheet stays open and says so.
          return {
            ok: false,
            queued: true,
            pending: true,
            error: noKey
              ? "Not sent yet — queued for the office email retry. Check Activity."
              : "Not sent (" + detail + "). Queued for retry — check Activity.",
          };
        }
      } catch {
        /* fall through */
      }
      showToast(label + " did NOT send — " + detail + ". Still marked not sent.");
      return { ok: false, error: detail, pending: true };
    }

    // QuickBooks path — command bus (host has QBO credentials).
    const payload =
      kind === "invoice"
        ? {
            email,
            invoiceNo: no,
            customer: job.customer || "",
            amount: String(due || "").replace(/[$,]/g, ""),
            includePaymentLink: withPay,
            docSource: DOC_SOURCE_QBO,
            message,
            subject,
            job,
          }
        : { email, estimateNo: no, docSource: DOC_SOURCE_QBO, message, subject, job };
    const idk =
      kind === "invoice" && withPay
        ? "send_invoice_pay:qbo:" + no + ":" + Date.now()
        : "send_" + kind + ":qbo:" + no + ":" + Date.now();
    await enqueue("send_" + kind, job.id, payload, "deterministic", idk);
    showToast(
      withPay
        ? "Sending " + via + " with payment link — you'll get a toast when it lands"
        : "Sending " + via + " — you'll get a toast when it lands"
    );
    return { ok: true, queued: true };
  };
}

/* ---------- 1a. Payment type intro (picture or method) ---------- */
export function PaymentIntroSheet({ onClose, onAttachPicture, onPickMethod }) {
  return (
    <Sheet title="Add a payment" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">Attach a payment picture or choose how they paid — then fill in the details.</p>
      <Opt
        icon="📷"
        title="Attach a picture"
        note="Check or Zelle screenshot — autofill amount & details"
        onClick={onAttachPicture}
      />
      {["Check", "Zelle", "Credit card", "Cash", "ACH"].map((method) => (
        <Opt
          key={method}
          icon={method === "Credit card" ? "💳" : method === "Cash" ? "💵" : "🧾"}
          title={method}
          note="Opens the full payment form"
          onClick={() => onPickMethod(method)}
        />
      ))}
    </Sheet>
  );
}

/* ---------- 1. Mark as paid ---------- */
export function MarkPaidSheet({
  job: jobProp,
  onClose,
  initialMethod = "",
  openProofPicker = false,
  initialCustomerName = "",
}) {
  const {
    patchJob,
    showToast,
    syncNow,
    refreshJobs,
    jobs,
    appendPaymentVisionFeedback,
    getPaymentVisionLearning,
  } = useStore();
  const product = productName(useTenantConfig());
  const needsPick = !jobProp;
  const [reassign, setReassign] = useState(false);
  const [activeJob, setActiveJob] = useState(jobProp || null);
  const [pickCust, setPickCust] = useState(() => {
    if (initialCustomerName) return { name: initialCustomerName };
    if (jobProp?.customer) return { name: jobProp.customer };
    return null;
  });
  const [custDraft, setCustDraft] = useState(
    () => initialCustomerName || jobProp?.customer || ""
  );
  const job = activeJob;
  const showCustomerPick = needsPick || reassign;
  const due = job ? openBalance(job) : 0;
  const alreadyPaid = job ? due <= 0.01 : false;
  const [amt, setAmt] = useState(() => {
    if (!jobProp) return "";
    const d = openBalance(jobProp);
    return d > 0 ? String(d) : String(jobProp.amount || "").replace(/[$,]/g, "");
  });
  const [mth, setMth] = useState(initialMethod || "");
  const [ref, setRef] = useState("");
  const [dt, setDt] = useState(todayStr());
  const [includeFee, setIncludeFee] = useState(true);
  const [saveOnFile, setSaveOnFile] = useState(true);
  const [useSavedCard, setUseSavedCard] = useState(Boolean(jobProp?.solaCardToken));
  const [cardReady, setCardReady] = useState(false);
  const [payPhase, setPayPhase] = useState("idle"); // idle | tokenizing | charging
  const [payErr, setPayErr] = useState("");
  const [achRouting, setAchRouting] = useState("");
  const [achAccount, setAchAccount] = useState("");
  const [achName, setAchName] = useState(jobProp?.customer || "");
  const [achEnabled, setAchEnabled] = useState(false);
  const [proofFile, setProofFile] = useState(null);
  const [proofB64, setProofB64] = useState("");
  const [memo, setMemo] = useState("");
  const [visionAnalyzing, setVisionAnalyzing] = useState(false);
  const [autofillBusy, setAutofillBusy] = useState(false);
  const [autofillDone, setAutofillDone] = useState(false);
  const [autofillExtracted, setAutofillExtracted] = useState(null);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [zelleReconcile, setZelleReconcile] = useState(null);
  const depositBanks = useMemo(() => getDepositBanks(), []);
  const [deposit, setDeposit] = useState(() => getDepositBanks()[0]);
  const [depositOther, setDepositOther] = useState("");
  /** True when user chose Attach a picture — keep the photo CTA highlighted until they pick one. */
  const [awaitingProof, setAwaitingProof] = useState(Boolean(openProofPicker));
  const proofInputRef = useRef(null);
  /** Once Autofill puts a check amount on the form, do not let open-balance prefill wipe it. */
  const visionAmountLockedRef = useRef(false);
  const depositVal = deposit === "Other" ? depositOther.trim() : deposit;
  useEffect(() => {
    if (!openProofPicker) return;
    // Highlight the seamless attach control — OS sheet offers camera/files.
    setAwaitingProof(true);
  }, [openProofPicker]);

  const openInvoices = useMemo(() => {
    if (!showCustomerPick || !pickCust) return [];
    return invoicesForCustomerPick(jobs, pickCust.name, {
      openOnly: true,
      includeJobId: jobProp?.id || "",
    });
  }, [showCustomerPick, pickCust, jobs, jobProp?.id]);

  useEffect(() => {
    if (!showCustomerPick) return;
    if (openInvoices.length === 1) setActiveJob(openInvoices[0]);
    else if (!openInvoices.some((j) => j.id === activeJob?.id)) {
      if (reassign && jobProp && openInvoices.some((j) => j.id === jobProp.id)) setActiveJob(jobProp);
      else setActiveJob(null);
    }
  }, [showCustomerPick, openInvoices, activeJob?.id, reassign, jobProp]);

  useEffect(() => {
    if (!activeJob) return;
    // Autofill may setActiveJob after reading the check — never clobber vision amount with open balance.
    if (!visionAmountLockedRef.current) {
      const d = openBalance(activeJob);
      setAmt(d > 0 ? String(d) : String(activeJob.amount || "").replace(/[$,]/g, ""));
    }
    setAchName(activeJob.customer || "");
    setUseSavedCard(Boolean(activeJob.solaCardToken));
  }, [activeJob?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const inv = job?.invoiceNo || "";
  const payAmt = parseFloat(String(amt).replace(/[$,]/g, "")) || 0;
  const chargeTotal = isCard ? totalWithFee(payAmt, includeFee) : payAmt;
  const hasProof = isCheck || isZelle;
  const proofKind = isCheck ? "check" : "zelle";
  const processing = payPhase !== "idle" || visionAnalyzing || autofillBusy;

  const validateManual = () => {
    if (!job) {
      showToast("Pick a customer and invoice first");
      return false;
    }
    if (alreadyPaid) {
      showToast(`Invoice already paid in ${product} — sync from QuickBooks first`);
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

  const buildPaymentNote = (payRef, proofName, memoText = memo) => {
    if (isCheck || isZelle) {
      const note = paymentMemoNote({
        method: mth,
        ref: payRef,
        memo: memoText,
        proofName,
        deposit: depositVal || undefined,
      });
      return note || "";
    }
    if (isAch) {
      const bits = [achName, achRouting ? "routing " + achRouting : "", achAccount ? "acct …" + achAccount.slice(-4) : ""]
        .filter(Boolean)
        .join(" · ");
      return bits;
    }
    return memoText || "";
  };

  /** When Levi fixes vision fields (or fills what it missed) and Records, train the reader. */
  const trainFromRecord = (targetJob) => {
    if (!proofFile && !proofB64) return;
    if (!(isCheck || isZelle)) return;
    try {
      const openDefault = targetJob ? openBalance(targetJob) : 0;
      const entry = buildPaymentVisionLearningEntry({
        kind: isCheck ? "check" : "zelle",
        extracted: autofillExtracted,
        finalFields: {
          amount: payAmt,
          ref,
          date: dt,
          memo,
          invoiceNo: targetJob?.invoiceNo || inv || "",
          payer: targetJob?.customer || pickCust?.name || custDraft || "",
          openBalanceDefault: openDefault > 0 ? openDefault : "",
        },
        jobId: targetJob?.id || "",
        invoiceNo: targetJob?.invoiceNo || inv || "",
        proofName: proofFile?.name || "",
      });
      if (entry && appendPaymentVisionFeedback) {
        appendPaymentVisionFeedback(entry);
        return entry.deltas?.length || 0;
      }
    } catch {
      /* training must never block record */
    }
    return 0;
  };

  const stagePaymentOnJob = (targetJob, entry) => {
    const trained = trainFromRecord(targetJob);
    const patch = appendPayment(targetJob, entry);
    const remaining = parseFloat(String(patch.openBalance)) || 0;
    const trainNote = trained ? " · Your fixes train the check reader" : "";
    if (patch.paid) {
      showToast("Payment staged — Save & sync to record in QuickBooks" + trainNote);
    } else {
      showToast(
        "Partial payment staged — " + fmt$(remaining) + " remaining. Save & sync for QuickBooks." + trainNote
      );
    }
    patchJob(targetJob.id, patch);
    onClose();
  };

  const commitProofPayment = (targetJob, { amount: useAmt, ref: useRef, verified }) => {
    const d = dt || todayStr();
    const proofName = proofFile?.name || "";
    const payRef = useRef || ref;
    const note = buildPaymentNote(payRef, proofName);
    stagePaymentOnJob(targetJob, {
      amount: useAmt ?? payAmt,
      method: mth,
      ref: payRef,
      date: d,
      note: note || undefined,
      depositTo: depositVal || undefined,
      zelleVerified: isZelle ? Boolean(verified) : undefined,
      zelleProofName: isZelle ? proofName : undefined,
      paymentProofName: proofName || undefined,
      paymentAutofilled: Boolean(autofillDone),
    });
  };

  const saveManual = () => {
    if (!validateManual()) return;
    const d = dt || todayStr();
    const note = buildPaymentNote(ref, proofFile?.name || "");
    stagePaymentOnJob(job, {
      amount: payAmt,
      method: mth,
      ref,
      date: d,
      note: note || undefined,
      depositTo: depositVal || undefined,
      zelleVerified: isZelle ? paymentVerified : undefined,
      zelleProofName: isZelle ? proofFile?.name || "" : undefined,
      paymentProofName: proofFile?.name || undefined,
      paymentAutofilled: Boolean(autofillDone),
    });
  };

  const applyAutofill = (extracted) => {
    // Always keep the extract (even empty) so Record can train on vision_missed fields.
    setAutofillExtracted(extracted || null);
    if (!hasUsefulPaymentAutofill(extracted)) {
      setAutofillDone(false);
      setPaymentVerified(false);
      return false;
    }
    const patch = paymentAutofillPatch(extracted);
    if (patch.amt) {
      setAmt(patch.amt);
      visionAmountLockedRef.current = true;
    }
    if (patch.ref) setRef(patch.ref);
    if (patch.dt) setDt(patch.dt);
    if (patch.memo) setMemo(patch.memo);
    // Green Autofilled only when amount or check # actually filled — not name-only.
    const strong = hasStrongPaymentAutofill(extracted);
    setAutofillDone(strong);
    setPaymentVerified(strong);
    // When adding a payment from ＋ (no job yet), try to land on the invoice
    // written on the check (invoice #, amount, date, name already set).
    if (needsPick && !activeJob) {
      const invNo = patch.invoiceNo || invoiceNoFromExtracted(extracted);
      if (invNo) {
        const matched = findJobByInvoice(jobs, invNo);
        if (matched) {
          setActiveJob(matched);
          setPickCust({ name: matched.customer || "" });
          setCustDraft(matched.customer || "");
          // Vision amount already set + locked — only fall back to open balance if amount was missed.
          if (!(patch.amt && parseFloat(patch.amt) > 0)) {
            const d = openBalance(matched);
            setAmt(d > 0 ? String(d) : String(matched.amount || "").replace(/[$,]/g, ""));
          }
          showToast("Matched invoice #" + invNo + " — review and tap Record");
          return true;
        }
      }
      // Fallback: payer name on the check → prefill customer search.
      if (patch.name) {
        setCustDraft(patch.name);
        setPickCust({ name: patch.name });
        showToast("Read name from check — pick the invoice if needed");
        return true;
      }
    }
    return true;
  };

  const runAutofill = async (b64Override, fileOverride) => {
    const file = fileOverride || proofFile;
    let b64 = b64Override || proofB64;
    let mime = file?.type || "image/jpeg";
    if (!b64 && !file) return;
    setAutofillBusy(true);
    try {
      // Compress large phone photos so the amount box stays readable and gateway doesn't 502.
      if (file && String(file.type || "").startsWith("image/")) {
        try {
          const compressed = await compressImageForVision(file);
          if (compressed?.b64) {
            b64 = compressed.b64;
            mime = compressed.mime || "image/jpeg";
            setProofB64(b64);
          }
        } catch {
          /* keep original b64 */
        }
      }
      if (!b64) return;
      let learningEntries = [];
      try {
        learningEntries = (await getPaymentVisionLearning?.()) || [];
      } catch {
        learningEntries = [];
      }
      const { extracted } = await analyzePaymentImage(
        b64,
        mime,
        isCheck ? "check" : isZelle ? "zelle" : "check",
        file?.name || "",
        { learningEntries }
      );
      const invNo = invoiceNoFromExtracted(extracted);
      const matched = invNo && needsPick && !activeJob ? findJobByInvoice(jobs, invNo) : null;
      const ok = applyAutofill(extracted);
      if (!ok) {
        showToast("Couldn't read amount or check # yet — fill what it missed and Record to train the reader");
      } else if (!hasStrongPaymentAutofill(extracted) && !matched) {
        showToast("Partial read — fix anything wrong and Record to train the reader");
      } else if (!matched) {
        showToast("Fields filled from image — fix anything wrong and Record (that trains the reader)");
      }
    } catch (e) {
      setAutofillDone(false);
      setPaymentVerified(false);
      // Keep a null extract so Record still trains on Levi's fill-ins.
      setAutofillExtracted(null);
      const msg = String((e && e.message) || "");
      // Reader/server failure (not "photo was blank") — shorter plain toast.
      const short =
        /glitch|reach the check reader|Vision failed|502|422|xAI|API key/i.test(msg)
          ? "Check reader didn't respond — try Autofill again, or fill amount + check # and Record (that trains it)"
          : "Could not read image — fill the fields and Record to train" + (msg ? ". " + msg : "");
      showToast(short);
    } finally {
      setAutofillBusy(false);
    }
  };

  const recordWithScreenshot = async () => {
    if (!validateManual()) return;
    setVisionAnalyzing(true);
    try {
      const extracted =
        autofillDone && autofillExtracted
          ? autofillExtracted
          : await analyzePaymentScreenshot(proofB64, proofFile?.type || "image/jpeg", proofKind);
      if (!autofillDone) {
        setAutofillExtracted(extracted);
        // Only mark Autofilled green when amount/ref actually present.
        setAutofillDone(hasStrongPaymentAutofill(extracted));
      }
      if (isCheck) {
        const checkRef = String(extracted.confirmationNumber || extracted.checkNumber || ref || "").trim();
        if (checkRef) setRef(checkRef);
        commitProofPayment(job, { ref: checkRef, verified: true });
        return;
      }
      const result = reconcileZellePayment({
        extracted,
        entered: { amount: payAmt, ref, date: dt, invoiceNo: inv },
        job,
        jobs,
      });
      if (result.status === "full_match") {
        setPaymentVerified(true);
        setRef(result.confirmationRef || ref);
        commitProofPayment(job, {
          ref: result.confirmationRef,
          verified: true,
        });
        return;
      }
      setZelleReconcile(result);
    } catch (e) {
      showToast("Screenshot read failed — " + String((e && e.message) || "enter reference manually"));
    } finally {
      setVisionAnalyzing(false);
    }
  };

  const onRecordPayment = () => {
    if (hasProof && proofB64) {
      recordWithScreenshot();
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
      setProofFile(null);
      setProofB64("");
      setPaymentVerified(false);
      setAutofillDone(false);
      setAutofillExtracted(null);
      if (proofInputRef.current) proofInputRef.current.value = "";
      proofInputRef.current?.click();
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
      commitProofPayment(job, { amount: ex.amount, ref: confRef, verified: true });
    } else if (action === "keep_amount") {
      commitProofPayment(job, { ref: confRef, verified: Boolean(confRef) });
    } else if (action === "move_invoice") {
      if (!target?.id || String(target.invoiceNo) !== String(zelleReconcile?.fields?.invoice?.extracted)) {
        showToast("No matching invoice for #" + (zelleReconcile?.fields?.invoice?.extracted || ""));
        return;
      }
      commitProofPayment(target, { ref: confRef, verified: true });
    } else if (action === "keep_invoice") {
      commitProofPayment(job, { ref: confRef, verified: Boolean(confRef) });
    } else if (action === "move_address") {
      if (!target?.id) {
        showToast("No matching job for memo address");
        return;
      }
      commitProofPayment(target, { ref: confRef, verified: true });
    } else if (action === "keep_here") {
      commitProofPayment(job, { ref: confRef, verified: Boolean(confRef) });
    }
    setZelleReconcile(null);
  };

  const processCard = async () => {
    if (!job) {
      showToast("Pick a customer and invoice first");
      return;
    }
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
      try {
        await refreshJobs?.(true);
      } catch {
        showToast("Payment went through — pull to refresh if the balance looks stale");
      }
      showToast(
        res.ref
          ? `Card approved — ${fmt$(res.amount)} recorded (ref ${res.ref})`
          : `Card approved — ${fmt$(res.amount)} recorded`
      );
      onClose();
    } catch (e) {
      const msg = String((e && e.message) || "Payment failed");
      const friendly =
        /is not a function/i.test(msg)
          ? "Card charge hit an app glitch after approval — check Activity and refresh the job"
          : msg;
      setPayErr(friendly);
      showToast(friendly);
    } finally {
      setPayPhase("idle");
    }
  };
  const onProofFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofFile(file);
    setAwaitingProof(false);
    setPaymentVerified(false);
    setAutofillDone(false);
    setAutofillExtracted(null);
    visionAmountLockedRef.current = false;
    // Prefer check when a file is attached without a method (Attach path).
    const treatAsCheck = !mth || mth === "Check" || isCheck;
    if (!mth) setMth("Check");
    const isImage = String(file.type || "").startsWith("image/");
    try {
      const b64 = await fileToBase64(file);
      setProofB64(b64);
      if (!isImage) {
        // PDF / non-image stays on the payment as proof — no vision autofill.
        showToast("File attached — enter details and tap Record");
        return;
      }
      if (treatAsCheck) {
        // Check path: auto-read amount, check #, date, memo, invoice (the old skill).
        showToast("Reading check photo…");
        await runAutofill(b64, file);
      } else {
        showToast("Image attached — tap Autofill or Record");
      }
    } catch {
      showToast("Could not read that file");
      setProofFile(null);
      setProofB64("");
    }
  };

  const sheetTitle = needsPick || reassign ? "Add a payment" : "Mark as paid — " + (job?.customer || "");

  return (
    <>
    <Sheet title={sheetTitle} onClose={onClose}>
      {showCustomerPick ? (
        <>
          <CustomerSearch
            label="Customer / service address"
            placeholder="Name or service address…"
            testId="payment-customer-search"
            value={custDraft}
            onChangeText={(t) => {
              setCustDraft(t);
              setPickCust(null);
              setActiveJob(null);
            }}
            onPick={(c) => {
              if (!c || c._newCustomer) {
                setPickCust(null);
                return;
              }
              setPickCust(c);
              setCustDraft(c.name || c.businessName || "");
            }}
          />
          {pickCust && openInvoices.length > 1 ? (
            <Fld label="Invoice" hint="Each line shows the service address">
              <select
                className="input"
                value={activeJob?.id || ""}
                onChange={(e) => {
                  const picked = openInvoices.find((j) => j.id === e.target.value) || null;
                  setActiveJob(picked);
                }}
                aria-label="Invoice"
                data-testid="payment-invoice-select"
              >
                <option value="">— choose invoice —</option>
                {openInvoices.map((j) => (
                  <option key={j.id} value={j.id}>
                    {formatInvoicePayOption(j)}
                  </option>
                ))}
              </select>
            </Fld>
          ) : null}
          {pickCust && openInvoices.length === 1 && activeJob ? (
            <p className="text-[12px] text-slate-500 mb-2">
              {formatInvoicePayOption(activeJob)}
            </p>
          ) : null}
          {pickCust && !openInvoices.length ? (
            <p className="text-sm text-slate-400 text-center py-4">No open invoices for this customer.</p>
          ) : null}
          {reassign && jobProp ? (
            <button
              type="button"
              className="text-[11px] font-semibold text-slate-500 mb-2"
              onClick={() => {
                setReassign(false);
                setActiveJob(jobProp);
                setPickCust(jobProp.customer ? { name: jobProp.customer } : null);
                setCustDraft(jobProp.customer || "");
              }}
            >
              Keep original job
            </button>
          ) : null}
        </>
      ) : (
        <div className="mb-2">
          <Fld label="Paying towards">
            <div className="input bg-slate-50 text-slate-800 font-medium flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div data-testid="payment-toward-customer">{job.customer || ""}</div>
                {job.invoiceNo ? (
                  <div className="text-[11px] font-normal text-slate-500 mt-0.5 break-words">
                    {formatInvoicePayOption(job)}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="btn bg-white border border-slate-200 text-slate-800 !px-2 !py-1 text-xs shrink-0"
                onClick={() => setReassign(true)}
                data-testid="payment-change-target"
                aria-label="Change customer or invoice"
              >
                ✏️ Edit
              </button>
            </div>
          </Fld>
        </div>
      )}
      {job && alreadyPaid ? (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 mb-3 text-[12px] text-amber-900">
          <p className="font-semibold">Already paid (balance {fmt$(due)})</p>
          <p className="mt-1 text-amber-800">
            QuickBooks may already show this invoice as paid. Sync first so {product} matches QBO before recording
            another payment.
          </p>
          <button className="btn bg-brand text-white w-full mt-2" onClick={() => syncNow().then(onClose)}>
            Sync from QuickBooks
          </button>
        </div>
      ) : job ? (
        <p className="text-[12px] text-slate-500 mb-2">
          Open balance: <span className="font-semibold text-slate-700">{fmt$(due)}</span>
          {job.invoiceNo ? <span> · Invoice #{job.invoiceNo}</span> : null}
        </p>
      ) : null}
      <Fld label="Amount" hint="Recommended">
        <input
          className="input"
          inputMode="decimal"
          value={amt}
          onChange={(e) => {
            visionAmountLockedRef.current = false;
            setAmt(e.target.value);
          }}
          aria-label="Amount"
          disabled={alreadyPaid || !job}
        />
      </Fld>
      <Fld label="Payment method" hint="Recommended">
        <select
          className="input"
          value={mth}
          onChange={(e) => {
            setMth(e.target.value);
            setPayErr("");
            setProofFile(null);
            setProofB64("");
            setMemo("");
            setPaymentVerified(false);
            setAutofillDone(false);
            setAutofillExtracted(null);
            visionAmountLockedRef.current = false;
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
          {job?.solaCardToken ? (
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
                setPaymentVerified(false);
              }}
              disabled={processing}
            />
            {paymentVerified ? (
              <p className="text-[11px] text-emerald-600 mt-1 font-medium" data-testid="zelle-verified">
                ✓ Verified from screenshot
              </p>
            ) : null}
          </Fld>
          <Fld label="Memo" hint="Note on the Zelle payment">
            <input
              className="input"
              placeholder="Memo from bank or customer"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              disabled={processing}
              aria-label="Zelle memo"
            />
          </Fld>
          <PaymentProofFld
            label="Screenshot (optional)"
            hint="Zelle email or bank app — attach then tap Autofill"
            file={proofFile}
            inputRef={proofInputRef}
            onFile={onProofFile}
            onAutofill={() => runAutofill()}
            autofillBusy={autofillBusy}
            autofillDone={autofillDone}
            disabled={processing}
            testId="zelle-screenshot-input"
            pendingPick={awaitingProof && !proofFile}
          />
          <Fld label="Deposit to">
            <select
              className="input"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              aria-label="Deposit to"
              data-testid="payment-deposit"
              disabled={processing}
            >
              {depositBanks.map((b) => (
                <option key={b}>{b}</option>
              ))}
              <option>Other</option>
            </select>
            {deposit === "Other" ? (
              <input
                className="input mt-2"
                value={depositOther}
                onChange={(e) => setDepositOther(e.target.value)}
                placeholder="Bank name"
                aria-label="Other bank"
                disabled={processing}
              />
            ) : null}
          </Fld>
          <Fld label="Date">
            <input className="input" type="date" value={dt} onChange={(e) => setDt(e.target.value)} disabled={processing} />
          </Fld>
        </>
      ) : isCheck ? (
        <>
          <PaymentProofFld
            label="Check attachment"
            hint="Photo or PDF of the check — photos fill amount, check #, date, memo, and invoice when readable"
            file={proofFile}
            inputRef={proofInputRef}
            onFile={onProofFile}
            onAutofill={() => runAutofill()}
            autofillBusy={autofillBusy}
            autofillDone={autofillDone}
            disabled={processing}
            testId="check-screenshot-input"
            emphasize
            pendingPick={awaitingProof && !proofFile}
          />
          <Fld label="Check number" hint="Required for check deposits">
            <input
              className="input"
              placeholder="Check #"
              value={ref}
              onChange={(e) => {
                setRef(e.target.value);
                setPaymentVerified(false);
              }}
              disabled={processing}
            />
            {paymentVerified && autofillDone && String(ref || "").trim() ? (
              <p className="text-[11px] text-emerald-600 mt-1 font-medium" data-testid="check-verified">
                ✓ Read from check image
              </p>
            ) : null}
          </Fld>
          <Fld label="Memo" hint="Memo line on the check">
            <input
              className="input"
              placeholder="Memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              disabled={processing}
              aria-label="Check memo"
            />
          </Fld>
          <Fld label="Deposit to">
            <select
              className="input"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              aria-label="Deposit to"
              data-testid="payment-deposit"
              disabled={processing}
            >
              {depositBanks.map((b) => (
                <option key={b}>{b}</option>
              ))}
              <option>Other</option>
            </select>
            {deposit === "Other" ? (
              <input
                className="input mt-2"
                value={depositOther}
                onChange={(e) => setDepositOther(e.target.value)}
                placeholder="Bank name"
                aria-label="Other bank"
                disabled={processing}
              />
            ) : null}
          </Fld>
          <Fld label="Date">
            <input className="input" type="date" value={dt} onChange={(e) => setDt(e.target.value)} disabled={processing} />
          </Fld>
        </>
      ) : (
        <>
          <Fld label="Reference / check #" hint="Optional">
            <input
              className="input"
              placeholder="Optional"
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
          disabled={
            alreadyPaid ||
            processing ||
            !job ||
            !inv ||
            (!useSavedCard && !cardReady) ||
            (useSavedCard && !job?.solaCardToken)
          }
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
          disabled={alreadyPaid || processing || !job}
          data-testid="record-payment"
        >
          {visionAnalyzing ? "Reading screenshot…" : "✓ Record payment"}
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
function PaymentEditForm({
  payment,
  sourceJob,
  jobs = [],
  onSave,
  onDelete,
  onVoid,
  onCancel,
}) {
  const [amt, setAmt] = useState(String(payment.amount || "").replace(/[$,]/g, ""));
  const [mth, setMth] = useState(payment.method || "");
  const [ref, setRef] = useState(payment.ref || "");
  const [dt, setDt] = useState(payment.date || todayStr());
  const [custName, setCustName] = useState(sourceJob?.customer || sourceJob?.businessName || "");
  const [pickCust, setPickCust] = useState(() =>
    sourceJob?.customer || sourceJob?.businessName
      ? { name: sourceJob.customer || sourceJob.businessName }
      : null
  );
  const [targetJobId, setTargetJobId] = useState(sourceJob?.id || "");
  const [invQuery, setInvQuery] = useState("");
  const [fullEdit, setFullEdit] = useState(false);
  const voidable = canVoidInQbo(payment);

  const invoiceChoices = useMemo(() => {
    const name = pickCust?.name || custName;
    if (!name) return [];
    let list = invoicesForCustomerPick(jobs, name, {
      openOnly: false,
      includeJobId: sourceJob?.id,
    });
    const q = invQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((j) => {
        const no = String(j.invoiceNo || "").toLowerCase();
        const addr = formatInvoicePayOption(j).toLowerCase();
        return no.includes(q) || addr.includes(q);
      });
    }
    return list;
  }, [jobs, pickCust?.name, custName, invQuery, sourceJob?.id]);

  const targetJob =
    (jobs || []).find((j) => String(j.id) === String(targetJobId)) ||
    (String(targetJobId) === String(sourceJob?.id) ? sourceJob : null);

  const lockedTowardLabel = sourceJob?.invoiceNo
    ? formatInvoicePayOption(sourceJob)
    : "This job (no invoice #)";

  return (
    <div className="space-y-3 border-t border-slate-100 pt-3 mt-2" data-testid="payment-edit-form">
      {!fullEdit ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Paying towards
              </div>
              <p className="text-sm font-semibold text-slate-800 mt-0.5 break-words" data-testid="payment-toward-locked">
                {lockedTowardLabel}
              </p>
              {sourceJob?.customer ? (
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">{sourceJob.customer}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="btn bg-white border border-slate-200 text-slate-800 !px-2.5 !py-1.5 text-xs shrink-0"
              onClick={() => setFullEdit(true)}
              data-testid="payment-full-edit"
              aria-label="Edit customer or invoice"
            >
              ✏️ Edit
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 rounded-xl border border-brand/20 bg-brand-soft/30 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="text-[10px] font-bold uppercase tracking-wide text-brand">
              Full edit — customer & invoice
            </div>
            <button
              type="button"
              className="text-[11px] font-semibold text-slate-500"
              onClick={() => {
                setFullEdit(false);
                setCustName(sourceJob?.customer || sourceJob?.businessName || "");
                setPickCust(
                  sourceJob?.customer || sourceJob?.businessName
                    ? { name: sourceJob.customer || sourceJob.businessName }
                    : null
                );
                setTargetJobId(sourceJob?.id || "");
                setInvQuery("");
              }}
            >
              Keep original
            </button>
          </div>
          <CustomerSearch
            label="Customer / service address"
            placeholder="Name or service address…"
            testId="payment-edit-customer-search"
            value={custName}
            onChangeText={(t) => {
              setCustName(t);
              setPickCust(null);
              setTargetJobId("");
            }}
            onPick={(c) => {
              if (!c || c._newCustomer) {
                setPickCust(null);
                return;
              }
              setPickCust(c);
              setCustName(c.name || c.businessName || "");
              setTargetJobId("");
              setInvQuery("");
            }}
          />
          {(pickCust || custName) && (
            <>
              <Fld label="Find invoice #" hint="Type number or street to narrow the list">
                <input
                  className="input"
                  value={invQuery}
                  onChange={(e) => setInvQuery(e.target.value)}
                  placeholder="Invoice # or address…"
                  aria-label="Filter invoices"
                  data-testid="payment-edit-invoice-filter"
                />
              </Fld>
              <Fld label="Invoice" hint="Each line shows service address">
                <select
                  className="input"
                  value={targetJobId || ""}
                  onChange={(e) => setTargetJobId(e.target.value)}
                  aria-label="Invoice to apply payment"
                  data-testid="payment-edit-invoice-select"
                >
                  <option value="">— choose invoice —</option>
                  {invoiceChoices.map((j) => (
                    <option key={j.id} value={j.id}>
                      {formatInvoicePayOption(j)}
                    </option>
                  ))}
                </select>
              </Fld>
              {!invoiceChoices.length ? (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-2.5 py-2">
                  No invoices for this customer — try another name or address.
                </p>
              ) : null}
              {targetJob ? (
                <p className="text-[11px] text-slate-600">
                  Will apply to <b>#{targetJob.invoiceNo || "—"}</b>
                  {targetJob.id !== sourceJob?.id ? " (moved from current job)" : ""}
                </p>
              ) : null}
            </>
          )}
        </div>
      )}

      <Fld label="Amount">
        <input
          className="input"
          inputMode="decimal"
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          aria-label="Edit amount"
        />
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
      <div className="flex flex-nowrap gap-1.5">
        <button
          className="btn bg-brand text-white flex-1 !px-2 !py-2 text-xs"
          data-testid="payment-edit-save"
          onClick={() =>
            onSave({
              amount: amt,
              method: mth,
              ref,
              date: dt,
              targetJobId: fullEdit ? targetJobId || sourceJob?.id : sourceJob?.id,
            })
          }
        >
          Save
        </button>
        <button className="btn bg-slate-100 text-slate-700 flex-1 !px-2 !py-2 text-xs" onClick={onCancel}>
          Cancel
        </button>
        {voidable ? (
          <button
            className="btn bg-amber-50 text-amber-900 flex-1 !px-2 !py-2 text-xs border border-amber-200"
            onClick={onVoid}
          >
            Reverse
          </button>
        ) : null}
        <button
          className="btn bg-red-50 text-red-700 flex-1 !px-2 !py-2 text-xs"
          onClick={onDelete}
          data-testid="payment-delete-btn"
        >
          Delete
        </button>
      </div>
      <p className="text-[10px] text-slate-400 text-center">
        {voidable
          ? "Reverse removes it in QuickBooks. Delete only clears it here."
          : "Delete only clears it here — fix QuickBooks separately if it already synced."}
      </p>
    </div>
  );
}

export function PaymentHistorySheet({ job, onClose, onAddPayment }) {
  const {
    patchJob,
    patchAndSave,
    showToast,
    enqueue,
    commands,
    refreshCommands,
    refreshJobs,
    effectiveJob,
    jobs,
  } = useStore();
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
  const boardJobs = useMemo(
    () => (jobs || []).map((j) => effectiveJob(j.id) || j),
    [jobs, effectiveJob]
  );

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
      else refreshJobs?.(true);
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
    const targetId = entry.targetJobId || job.id;
    const targetLive =
      String(targetId) === String(job.id)
        ? liveJob
        : boardJobs.find((j) => String(j.id) === String(targetId)) || null;
    if (!targetLive) {
      showToast("Pick an invoice to apply this payment to");
      return;
    }
    const { amount, method, ref, date } = entry;
    const moved = movePayment(liveJob, targetLive, editId, { amount, method, ref, date });
    if (!moved?.patches?.length) {
      showToast("Could not update that payment");
      return;
    }
    for (const row of moved.patches) {
      patchJob(row.jobId, row.patch);
    }
    showToast(
      moved.same
        ? "Payment updated — Save & sync"
        : "Payment moved to invoice #" + (targetLive.invoiceNo || "—") + " — Save & sync"
    );
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
                  sourceJob={liveJob}
                  jobs={boardJobs}
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
export const PDF_STAGES = ["Checking", "Generating PDF", "Ready"];

/** Horizontal stage indicator: Checking → Generating PDF → Ready. */
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

/** Open a stored PDF or poll until QuickBooks fetch lands. */
function useDocPdfView(job, kind, no) {
  const { api, enqueue, showToast } = useStore();
  const [st, setSt] = useState({ phase: "idle", source: null }); // idle|checking|fetching|timeout|error
  const timer = useRef(null);
  const deadline = useRef(0);
  const docKey = (kind === "invoice" ? "inv-" : "est-") + no;
  const docUrl = docStorePdfUrl(docKey);

  useEffect(() => () => clearTimeout(timer.current), []);

  const openStored = () => {
    openPdfUrl(docUrl);
    setSt({ phase: "idle", source: null });
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
    if (blob) return openStored();
    if (Date.now() >= deadline.current) return setSt((o) => ({ ...o, phase: "timeout" }));
    timer.current = setTimeout(poll, 4000);
  };

  const waitForStored = async (tries = 6, gapMs = 400) => {
    for (let i = 0; i < tries; i++) {
      if (await check()) return true;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, gapMs));
    }
    return false;
  };

  const viewLocal = async () => {
    setSt({ phase: "checking", source: DOC_SOURCE_LOCAL });
    if (!canGenerateLocalDoc(job, kind)) {
      setSt({ phase: "error", source: DOC_SOURCE_LOCAL });
      showToast("Add line items on this job to build a local PDF — or use View QuickBooks");
      return;
    }
    setSt({ phase: "fetching", source: DOC_SOURCE_LOCAL });
    // Client-side only — open blob URL in a new tab (works where download-only looked dead).
    // Also trigger a download as a mobile-friendly fallback when popups are blocked.
    try {
      const blob =
        kind === "estimate" ? await buildEstimatePdfFromJob(job) : await buildInvoicePdfFromJob(job);
      if (!blob) {
        setSt({ phase: "error", source: DOC_SOURCE_LOCAL });
        showToast("Couldn't build the PDF on this device — try View QuickBooks");
        return;
      }
      const filename = docPdfFilename(kind, job, no) || `${kind}-${no || "document"}.pdf`;
      openPdfBlob(blob);
      // Download as backup so iOS/Android still get a file if the tab is blocked.
      try {
        downloadPdfBlob(blob, filename);
      } catch {
        /* open is enough */
      }
      setSt({ phase: "idle", source: null });
      showToast("Opening " + (kind === "estimate" ? "estimate" : "invoice") + " PDF");
    } catch (e) {
      setSt({ phase: "error", source: DOC_SOURCE_LOCAL });
      showToast("Couldn't build the PDF on this device — try View QuickBooks");
    }
  };

  const viewQbo = async () => {
    setSt({ phase: "checking", source: DOC_SOURCE_QBO });
    const blob = await check();
    if (blob) return openStored();
    enqueue(
      "fetch_pdf",
      job.id,
      { kind, no, docKey, docSource: DOC_SOURCE_QBO },
      "judgment",
      "pdf:qbo:" + no + ":" + todayStr()
    );
    deadline.current = Date.now() + 90_000;
    setSt({ phase: "fetching", source: DOC_SOURCE_QBO });
    timer.current = setTimeout(poll, 4000);
  };

  return { st, viewLocal, viewQbo, docKey };
}

function DocPdfStatus({ st, onRetry }) {
  if (st.phase === "checking" || st.phase === "fetching") {
    const qbo = st.source === DOC_SOURCE_QBO;
    return (
      <div className="border border-slate-200 rounded-2xl px-4 py-3 mb-2.5">
        <PdfStages active={st.phase === "checking" ? 0 : 1} />
        <div className="text-sm text-slate-500 flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          {st.phase === "checking"
            ? "Checking for your document…"
            : qbo
            ? "Fetching from QuickBooks — a few seconds…"
            : "Generating your PDF — a few seconds…"}
        </div>
      </div>
    );
  }
  if (st.phase === "timeout") {
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-2xl px-4 py-3 mb-2.5 text-sm text-amber-800">
        Still not in yet — the Mac may be asleep. It'll appear once fetched.
        <button className="btn-ghost w-full mt-2 !py-1.5" onClick={onRetry}>
          ↻ Try again
        </button>
      </div>
    );
  }
  return null;
}

/** Local vs QuickBooks view buttons — explicit source, no auto-mixing. */
export function DocPdfViewButtons({ job, kind, no, compact }) {
  const { st, viewLocal, viewQbo } = useDocPdfView(job, kind, no);
  const config = useTenantConfig();
  const appSettings = useAppSettings();
  void appSettings.quickbooks;
  const qboOn = isQuickbooksEnabled(config);
  const product = productName(config);
  const retry = () => (st.source === DOC_SOURCE_QBO && qboOn ? viewQbo() : viewLocal());

  if (st.phase === "checking" || st.phase === "fetching" || st.phase === "timeout") {
    return <DocPdfStatus st={st} onRetry={retry} />;
  }

  if (compact) {
    return (
      <div className="flex gap-2 mb-2 w-full" data-testid="doc-view-row">
        <button
          type="button"
          className="btn flex-1 !py-2.5 bg-brand-soft text-brand font-semibold"
          onClick={viewLocal}
          data-testid="view-local-doc"
        >
          {viewLocalLabel(kind)}
        </button>
        {qboOn ? (
          <button
            type="button"
            className="btn flex-1 !py-2.5 bg-slate-100 text-slate-800 font-semibold"
            onClick={viewQbo}
            data-testid="view-qbo-doc"
          >
            {viewQboLabel(kind)}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <Opt
        icon="📄"
        title={viewLocalLabel(kind)}
        note={`${product} PDF from this job's line items`}
        onClick={viewLocal}
        data-testid="view-local-doc"
      />
      {qboOn ? (
        <Opt
          icon="📗"
          title={viewQboLabel(kind)}
          note="Pulls the PDF from QuickBooks Online"
          onClick={viewQbo}
          data-testid="view-qbo-doc"
        />
      ) : null}
    </>
  );
}

/** Back-compat alias — defaults to local+QuickBooks row when compact. */
export function PdfViewer(props) {
  return <DocPdfViewButtons {...props} />;
}

/** Send invoice/estimate buttons — parent sheet shows DocSourcePicker submenu. */
export function DocSendButtons({ job, kind, onPickSend }) {
  const due = openBalance(job);
  const label = docKindLabel(kind);
  const withPay = kind === "invoice" && due > 0.01;
  const appSettings = useAppSettings();
  void appSettings.quickbooks;
  const qboOn = isQuickbooksEnabled();
  const sourceNote = qboOn
    ? "Choose local file or QuickBooks file"
    : "Sends the local PDF from this job";

  return (
    <div data-testid="doc-send-row">
      {withPay ? (
        <Opt
          icon="💳"
          title="Send invoice with payment link"
          note={sourceNote}
          onClick={() =>
            onPickSend({ withPay: true, title: "Send invoice with payment link" })
          }
          data-testid="send-with-pay"
        />
      ) : null}
      <Opt
        icon="📤"
        title={withPay ? "Send invoice only" : "Send " + label}
        note={sourceNote}
        onClick={() =>
          onPickSend({
            withPay: false,
            title: withPay ? "Send invoice only" : "Send " + label,
          })
        }
        data-testid="send-doc-only"
      />
    </div>
  );
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
  const { api, enqueue, commands, refreshCommands, showToast } = useStore();
  const inv = job.invoiceNo || "";
  const dueAmt = openBalance(job);
  const dueLabel = fmtAmountDue(job) || fmt$(dueAmt) || "";
  const [linkAmount, setLinkAmount] = useState(() => paylinkAmountRaw(dueAmt) || "");
  const [idk, setIdk] = useState("");
  const [phase, setPhase] = useState("idle"); // idle|working|ready|failed
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const [composeChannel, setComposeChannel] = useState(null);
  const [includeFee, setIncludeFee] = useState(true);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [payConfirm, setPayConfirm] = useState(null); // { docSource }
  const [paySendBusy, setPaySendBusy] = useState(false);
  const [paySendErr, setPaySendErr] = useState("");
  const deadline = useRef(0);
  const doSend = useDoSend();

  useEffect(() => {
    setLinkAmount(paylinkAmountRaw(openBalance(job)) || "");
    setPhase("idle");
    setUrl("");
    setErr("");
    setIdk("");
    setComposeChannel(null);
    setPayConfirm(null);
    setPaySendErr("");
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
      buildShortPayLandingUrl({ job, cardknoxUrl: link, linkAmount, inv, siteSlug, includeFee })
        .then((landing) => {
          setUrl(landing);
          const draft = buildPaymentLinkEmail({ job, url: landing, linkAmount, inv });
          setEmailSubject(draft.subject);
          setEmailBody(draft.body);
          setPhase("ready");
        })
        .catch((ex) => {
          setErr(String((ex && ex.message) || "Could not create payment link"));
          setPhase("failed");
        });
      return;
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
    // Prewarm client PDF path (no download) so View Local is ready.
    if (canGenerateLocalDoc(job, "invoice") && api.generateLocalDoc) {
      api.generateLocalDoc(job, "invoice", { download: false }).catch(() => {});
    } else {
      enqueue(
        "fetch_pdf",
        job.id,
        { kind: "invoice", no: inv, docKey: "inv-" + inv },
        "judgment",
        "pdf:" + inv + ":" + todayStr()
      );
    }
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

  if (payConfirm) {
    return (
      <SendDocConfirmSheet
        job={job}
        kind="invoice"
        docSource={payConfirm.docSource}
        withPay
        payUrl={url}
        busy={paySendBusy}
        error={paySendErr}
        onBack={() => {
          if (paySendBusy) return;
          setPayConfirm(null);
          setPaySendErr("");
        }}
        onApprove={async (model) => {
          setPaySendBusy(true);
          setPaySendErr("");
          beginPromptWorkPause();
          const result = await doSend(job, "invoice", {
            includePaymentLink: true,
            email: model.email,
            docSource: model.docSource,
            message: model.message,
            subject: model.subject,
            payUrl: url,
            emailPolicy: model.emailPolicy,
          });
          setPaySendBusy(false);
          if (result?.ok) {
            onClose();
            return;
          }
          setPaySendErr(result?.error || "Send failed — document was not emailed");
        }}
      />
    );
  }

  if (composeChannel) {
    const qboOn = isQuickbooksEnabled();
    return (
      <CustomerComposeSheet
        job={job}
        channel={composeChannel}
        context="payment"
        title={composeChannel === "email" ? "Email payment link" : "Text payment link"}
        initialTo={job.email || ""}
        initialPhone={job.phone || ""}
        initialSubject={emailSubject}
        initialMessage={emailBody}
        paymentUrl={url}
        onClose={() => setComposeChannel(null)}
        extraActions={
          composeChannel === "email" ? (
            <>
              <button
                type="button"
                className="btn w-full !py-2 bg-brand text-white mb-2"
                onClick={() => {
                  setPayConfirm({ docSource: DOC_SOURCE_LOCAL });
                  setPaySendErr("");
                }}
              >
                Send Local Invoice with Payment Link
              </button>
              {qboOn ? (
                <button
                  type="button"
                  className="btn w-full !py-2 bg-slate-100 text-slate-800"
                  onClick={() => {
                    setPayConfirm({ docSource: DOC_SOURCE_QBO });
                    setPaySendErr("");
                  }}
                >
                  Send QuickBooks Invoice with Payment Link
                </button>
              ) : null}
            </>
          ) : null
        }
      />
    );
  }

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
            <button
              type="button"
              className={`btn flex-1 !py-2 ${job.phone ? "bg-brand-soft text-brand" : "bg-slate-50 text-slate-300"}`}
              disabled={!job.phone}
              onClick={() => setComposeChannel("sms")}
            >
              💬 Text
            </button>
            <button
              type="button"
              className={`btn flex-1 !py-2 ${job.email ? "bg-brand-soft text-brand" : "bg-slate-50 text-slate-300"}`}
              disabled={!job.email}
              onClick={() => setComposeChannel("email")}
            >
              ✉️ Email
            </button>
          </div>
          <p className="text-[11px] text-slate-400 text-center">
            Invoice total {fmt$(invoiceTotal(job)) || "—"} · balance due {fmtAmountDue(job) || fmt$(openBalance(job)) || "—"} · link amount {fmt$(parseFloat(linkAmount) || openBalance(job))}
          </p>
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
export function DocSheet({ job, kind, onClose, onEdit, onConvert, onSync }) {
  const doSend = useDoSend();
  const { commands } = useStore();
  const [sendPick, setSendPick] = useState(null); // { withPay, title }
  const [confirmSend, setConfirmSend] = useState(null); // { withPay, docSource }
  const [sendBusy, setSendBusy] = useState(false);
  const [sendErr, setSendErr] = useState("");
  const no = kind === "invoice" ? job.invoiceNo : job.estimateNo;
  const label = kind === "invoice" ? "invoice" : "estimate";

  if (confirmSend) {
    return (
      <SendDocConfirmSheet
        job={job}
        kind={kind}
        docSource={confirmSend.docSource}
        withPay={!!confirmSend.withPay}
        busy={sendBusy}
        error={sendErr}
        onBack={() => {
          if (sendBusy) return;
          setConfirmSend(null);
          setSendErr("");
        }}
        onApprove={async (model) => {
          setSendBusy(true);
          setSendErr("");
          beginPromptWorkPause();
          const result = await doSend(job, kind, {
            docSource: model.docSource,
            includePaymentLink: model.withPay,
            email: model.email,
            message: model.message,
            subject: model.subject,
            emailPolicy: model.emailPolicy,
          });
          setSendBusy(false);
          if (result?.ok) {
            onClose();
            return;
          }
          // Stay open in pending/not-sent state with a loud error.
          setSendErr(result?.error || "Send failed — document was not emailed");
        }}
      />
    );
  }

  if (sendPick) {
    return (
      <DocSourcePicker
        title={sendPick.title}
        kind={kind}
        onBack={() => setSendPick(null)}
        onPick={(src) => {
          setConfirmSend({ withPay: sendPick.withPay, docSource: src });
          setSendPick(null);
          setSendErr("");
        }}
      />
    );
  }
  const lines = kind === "invoice" ? job.invoiceLines : job.estimateLines;
  const isDraft = !no && (lines || []).some((ln) => String(ln?.itemName || "").trim());
  const qboOn = isQuickbooksEnabled();
  const title = no
    ? (kind === "invoice" ? "Invoice " : "Estimate ") + no
    : isDraft
    ? (kind === "invoice" ? "Invoice saved on job" : "Estimate saved on job")
    : kind === "invoice"
    ? "Invoice"
    : "Estimate";

  return (
    <Sheet title={title} onClose={onClose}>
      {isDraft ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3" data-testid="doc-draft-banner">
          {qboOn
            ? "Saved on this job — not in QuickBooks yet. Tap sync when you are ready."
            : "Saved on this job — local only (QuickBooks is off)."}
        </p>
      ) : null}

      <div className="text-sm space-y-1 mb-3">
        <div><b className="font-semibold">Customer</b> <span className="text-slate-600">{job.customer || ""}</span></div>
        <div><b className="font-semibold">Amount</b> <span className="text-slate-600">{fmt$(job.amount)}</span></div>
        {kind === "invoice" && no ? (
          <div><b className="font-semibold">Status</b> <span className="text-slate-600">{job.paid ? "Paid" : "Open"}</span></div>
        ) : null}
        {(job.serviceAddress || job.address) ? (
          <div><b className="font-semibold">Service address</b> <span className="text-slate-600">{job.serviceAddress || job.address}</span></div>
        ) : null}
      </div>

      {isDraft && lines?.length ? (
        <div className="card px-3 py-2 mb-3" data-testid="doc-draft-lines">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Line items</p>
          {lines.filter((ln) => String(ln?.itemName || "").trim()).map((ln, i) => (
            <div key={i} className="flex justify-between gap-2 text-sm py-1 border-b border-dashed border-slate-100 last:border-0">
              <span className="min-w-0 truncate text-slate-700">{ln.itemName}</span>
              <span className="shrink-0 font-semibold text-slate-800">{fmt$(parseAmount(ln.qty) * parseAmount(ln.unitPrice))}</span>
            </div>
          ))}
        </div>
      ) : null}

      {no ? <DocPdfViewButtons job={job} kind={kind} no={no} compact /> : null}

      {isDraft && onSync && qboOn ? (
        <button type="button" className="btn-brand w-full mb-2" onClick={onSync} data-testid="doc-sync-qbo">
          Sync to QuickBooks
        </button>
      ) : null}

      {!isDraft && no && job.email ? (
        <DocSendButtons job={job} kind={kind} onPickSend={setSendPick} />
      ) : !isDraft && no ? (
        <p className="text-[11px] text-slate-400 text-center mb-2">Add an email on the customer card to send.</p>
      ) : null}

      {onEdit ? (
        <button type="button" className="btn-ghost w-full !py-2.5 mb-1 font-semibold" onClick={onEdit} data-testid="doc-edit">
          Edit {label}
        </button>
      ) : null}

      {kind === "estimate" && !job.invoiceNo && onConvert && (no || isDraft) ? (
        <Opt icon="🧾" title="Convert to invoice" note="Bill all or part of this estimate" onClick={onConvert} />
      ) : null}

      {!isDraft && no ? (
        <p
          className="text-center text-[11px] text-slate-400 mt-3 mb-1"
          data-testid={"doc-send-status-" + kind}
        >
          {docSendStatusLine(job, kind, commands).text}
        </p>
      ) : null}
    </Sheet>
  );
}

/** Quick invoice actions from the jobs list — View (full-screen PDF) or Send. */
export function QuickSendSheet({ job, onClose, onEdit }) {
  const doSend = useDoSend();
  const [sendPick, setSendPick] = useState(null);
  const [confirmSend, setConfirmSend] = useState(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendErr, setSendErr] = useState("");
  const due = openBalance(job);

  if (confirmSend) {
    return (
      <SendDocConfirmSheet
        job={job}
        kind="invoice"
        docSource={confirmSend.docSource}
        withPay={!!confirmSend.withPay}
        busy={sendBusy}
        error={sendErr}
        onBack={() => {
          if (sendBusy) return;
          setConfirmSend(null);
          setSendErr("");
        }}
        onApprove={async (model) => {
          setSendBusy(true);
          setSendErr("");
          beginPromptWorkPause();
          const result = await doSend(job, "invoice", {
            docSource: model.docSource,
            includePaymentLink: model.withPay,
            email: model.email,
            message: model.message,
            subject: model.subject,
            emailPolicy: model.emailPolicy,
          });
          setSendBusy(false);
          if (result?.ok) {
            onClose();
            return;
          }
          setSendErr(result?.error || "Send failed — document was not emailed");
        }}
      />
    );
  }

  if (sendPick) {
    return (
      <DocSourcePicker
        title={sendPick.title}
        kind="invoice"
        onBack={() => setSendPick(null)}
        onPick={(src) => {
          setConfirmSend({ withPay: sendPick.withPay, docSource: src });
          setSendPick(null);
          setSendErr("");
        }}
      />
    );
  }

  return (
    <Sheet title={"Invoice " + (job.invoiceNo || "")} onClose={onClose}>
      <div className="text-sm space-y-1 mb-3">
        <div><b className="font-semibold">Customer</b> <span className="text-slate-600">{job.customer || ""}</span></div>
        <div><b className="font-semibold">Amount due</b> <span className="text-slate-600">{fmtAmountDue(job) || fmt$(due) || "—"}</span></div>
      </div>
      {job.invoiceNo && <DocPdfViewButtons job={job} kind="invoice" no={job.invoiceNo} />}
      {job.email ? (
        <DocSendButtons job={job} kind="invoice" onPickSend={setSendPick} />
      ) : (
        <p className="text-[11px] text-slate-400 text-center mt-2">Add an email to send this invoice.</p>
      )}
      {onEdit && job.invoiceNo ? (
        <button
          type="button"
          className="btn-ghost w-full !py-2.5 mt-2 font-semibold"
          onClick={() => {
            onEdit();
            onClose();
          }}
          data-testid="quick-send-edit-invoice"
        >
          Edit invoice
        </button>
      ) : null}
    </Sheet>
  );
}

/* ---------- 2b. Calendar quick view ---------- */
// The office account every calendar link must open under. Google keys the
// account off the /u/<index> segment for the *current* sign-in order (which
// varies per device) and off ?authuser=<email> as an explicit hint — so we set
// both and let authuser win, landing reliably on the tenant's office mailbox.
// Read at call time: tenant_config resolves after this module is evaluated.
export function calAccount() {
  return tenantCalendarAccount();
}

/** Open a URL outside the app — window.open often fails in installed PWAs. */
export function openExternalUrl(url) {
  if (!url) return false;
  try {
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (w) return true;
  } catch {
    /* fall through */
  }
  try {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    try {
      window.location.assign(url);
      return true;
    } catch {
      return false;
    }
  }
}

/** Compact 1-line action chip for calendar sheet. */
function CalChip({ children, onClick, danger, testId, className = "" }) {
  return (
    <button
      type="button"
      className={
        "min-h-[2.25rem] px-2 py-1.5 rounded-xl border text-[11px] font-bold leading-tight text-center active:bg-slate-50 " +
        (danger
          ? "border-red-200 text-red-700 bg-red-50/60"
          : "border-slate-200 text-slate-800 bg-white") +
        " " +
        className
      }
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

export function CalSheet({ job, onClose }) {
  const nav = useNavigate();
  const {
    events,
    commands,
    patchJob,
    patchAndSave,
    enqueue,
    patchLocalEvent,
    removeLocalEvent,
    showToast,
    effectiveJob,
  } = useStore();
  const [mode, setMode] = useState("menu"); // menu | add | pick | unlink | edit
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
    account: calAccount(),
  });
  const notes = event ? displayEventNotes(event.description) : "";
  const whenLabel = event ? evStart(event).replace("T", " ").slice(0, 16) : d || "";

  const openInAppCalendar = () => {
    // Prefer the resolved event, then the job's saved calendar id, then the scheduled day.
    const focusDate = (event ? evStart(event).slice(0, 10) : "") || d || "";
    const eventId = String(event?.id || liveJob.calEventId || "").trim();
    if (eventId) {
      stashCalendarPick(eventId, { focusDate });
    } else if (focusDate) {
      stashCalendarPick({ focusDate });
    } else {
      showToast("No date to open yet");
      return;
    }
    // Close the sheet first. Navigate on the next tick so sheet unmount / scroll-unlock
    // cannot swallow the route change on mobile WebView / installed PWA.
    onClose();
    const go = () => {
      try {
        nav("/today");
      } catch {
        /* fall through to hash */
      }
      try {
        const hash = String(window.location.hash || "");
        if (!hash.includes("/today")) {
          window.location.hash = "#/today";
        }
      } catch {
        /* ignore */
      }
      // Re-signal so a just-mounted Calendar tab re-reads sessionStorage.
      try {
        window.dispatchEvent(new CustomEvent(CALENDAR_PICK_EVENT));
      } catch {
        /* ignore */
      }
    };
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => setTimeout(go, 0));
    } else {
      setTimeout(go, 0);
    }
  };

  const openInGCalendar = () => {
    if (!openExternalUrl(gcalUrl)) {
      showToast("Couldn't open Google Calendar");
    }
  };

  if (mode === "edit" && event) {
    return (
      <EditAppointmentSheet
        event={event}
        linkedJobId={liveJob.id}
        onClose={() => setMode("menu")}
        onSaved={(ev) => patchLocalEvent(ev.id, ev)}
        onDeleted={async (eid) => {
          await unlinkAppointmentJob({
            event: event || { id: eid, description: "" },
            job: liveJob,
            jobId: liveJob.id,
            patchJob,
            patchAndSave,
            enqueue,
            patchLocalEvent,
          });
          removeLocalEvent(eid);
          onClose();
        }}
      />
    );
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
          className={`rounded-xl border px-3 py-3 mb-3 text-sm space-y-1.5 ${
            cal.confirmed
              ? "border-emerald-200 bg-emerald-50"
              : cal.pending
              ? "border-orange-200 bg-orange-50"
              : "border-red-200 bg-red-50"
          }`}
          data-testid="cal-linked-appt-info"
        >
          <div
            className={`text-[10px] font-bold uppercase tracking-wide ${
              cal.confirmed ? "text-emerald-800" : cal.pending ? "text-orange-800" : "text-red-800"
            }`}
          >
            {cal.pending ? "Linking…" : "Linked appointment"}
          </div>
          {event ? (
            <>
              <div className="font-extrabold text-slate-900 text-base leading-snug" data-testid="cal-appt-title">
                {event.summary || "Appointment"}
              </div>
              {whenLabel ? (
                <div className="text-slate-700">
                  <span className="font-semibold">When</span>{" "}
                  <span data-testid="cal-appt-when">{whenLabel}</span>
                </div>
              ) : null}
              {event.location ? (
                <div className="text-slate-700">
                  <span className="font-semibold">Where</span>{" "}
                  <span data-testid="cal-appt-where">{event.location}</span>
                </div>
              ) : null}
              {notes ? (
                <div className="text-slate-700" data-testid="cal-appt-notes">
                  <span className="font-semibold">Notes</span>
                  <p className="text-slate-600 whitespace-pre-wrap mt-0.5 text-xs leading-relaxed">{notes}</p>
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-slate-500 text-xs">Pull calendar sync to see full details.</div>
          )}
        </div>
      ) : (
        <p className="text-sm text-red-600 font-semibold mb-3" data-testid="cal-no-linked">
          No linked appointment
        </p>
      )}

      <div className="grid grid-cols-2 gap-1.5 mb-3" data-testid="cal-actions-compact">
        {linked && event ? (
          <CalChip testId="cal-edit" onClick={() => setMode("edit")}>
            ✏️ Edit
          </CalChip>
        ) : null}
        {linked ? (
          <CalChip testId="cal-unlink" danger onClick={() => setMode("unlink")}>
            ⛓ Unlink
          </CalChip>
        ) : null}
        <CalChip testId="open-in-calendar" onClick={openInAppCalendar}>
          📅 Open in calendar
        </CalChip>
        <CalChip testId="open-gcal" onClick={openInGCalendar}>
          🗓 Open in G-Calendar
        </CalChip>
      </div>

      {!linked ? (
        <div className="grid grid-cols-2 gap-1.5" data-testid="cal-link-create-row">
          <CalChip testId="cal-create" onClick={() => setMode("add")}>
            ＋ Create
          </CalChip>
          <CalChip testId="cal-link" onClick={() => setMode("pick")}>
            🔗 Link existing
          </CalChip>
        </div>
      ) : null}
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
  const { patchAndSave, enqueue, showToast, jobs, events, api } = useStore();
  const [f, setF] = useState({
    businessName: job.businessName || job.customer || "",
    personName: job.personName || "",
    phone: job.phone || "",
    email: job.email || "",
    billingAddress: job.billingAddress || "",
    serviceAddress: job.serviceAddress || job.address || "",

    qboCustomerId: job.qboCustomerId || "",
    parentCustomerName: job.parentCustomerName || "",
    parentQboCustomerId: job.parentQboCustomerId || "",
  });
  const [isSubCompany, setIsSubCompany] = useState(
    () => !!(String(job.parentCustomerName || "").trim() || String(job.parentQboCustomerId || "").trim())
  );
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
      setF((o) => {
        const serviceAddress = patch.serviceAddress || patch.address || o.serviceAddress || "";
        return {
          ...o,
          businessName: patch.businessName || patch.customer || o.businessName,
          personName: patch.personName || o.personName || "",
          phone: patch.phone || o.phone || "",
          email: patch.email || o.email || "",
          serviceAddress,
          billingAddress:
            patch.billingAddress ||
            syncBillingFromService(serviceAddress, { billingAddress: o.billingAddress, serviceAddress: o.serviceAddress }),
          qboCustomerId: patch.qboCustomerId || o.qboCustomerId || "",
        };
      });
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

      qboCustomerId: f.qboCustomerId || "",
      parentCustomerName: f.parentCustomerName || "",
      parentQboCustomerId: f.parentQboCustomerId || "",
    };
  };

  const pickParent = useCallback(
    async (customer) => {
      if (customer && customer._newCustomer) {
        setF((o) => ({
          ...o,
          parentCustomerName: customer.name || "",
          parentQboCustomerId: "",
        }));
        return;
      }
      const patch = await enrichAndPatchCustomer(customer, jobs, api);
      setF((o) => ({ ...o, ...parentCustomerPatch({ ...customer, ...patch, id: patch.qboCustomerId || customer.id }) }));
    },
    [api, jobs]
  );

  const saveAndSync = async () => {
    const patch = buildPatch();
    try {
      await patchAndSave(job.id, patch);
      const updated = { ...job, ...patch };
      const qid = String(patch.qboCustomerId || "").trim();
      if (qid) {
        enqueue(
          "update_customer",
          job.id,
          { id: qid, ...customerSyncPayload(updated) },
          "deterministic",
          "update_customer|" + job.id + "|" + Date.now()
        );
        showToast("Saved & syncing update to QuickBooks…");
      } else {
        enqueue(
          "create_customer",
          job.id,
          customerSyncPayload(updated),
          "deterministic",
          "create_customer|" + job.id + "|" + Date.now()
        );
        showToast("Saved & creating in QuickBooks…");
      }
      onClose();
    } catch (e) {
      showToast("Save failed — " + ((e && e.message) || "try again"));
    }
  };

  const toggleSubCompany = (next) => {
    setIsSubCompany(next);
    if (!next) setF((o) => ({ ...o, parentCustomerName: "", parentQboCustomerId: "" }));
  };

  return (
    <Sheet title="Edit customer" onClose={onClose}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Customer (QuickBooks)</p>
      <Fld label="Customer name" hint="Billing entity — search QuickBooks; phone, email & billing fill from QB">
        <CustomerSearch
          label="Customer name"
          testId="custedit-business-name"
          value={f.businessName}
          onChangeText={(v) => setF((o) => ({ ...o, businessName: v, qboCustomerId: "" }))}
          onPick={pickCustomer}
        />
      </Fld>
      <SubCompanySection
        testId="custedit"
        on={isSubCompany}
        onToggle={toggleSubCompany}
        parentName={f.parentCustomerName}
        onParentNameChange={(v) => setF((o) => ({ ...o, parentCustomerName: v, parentQboCustomerId: "" }))}
        onParentPick={pickParent}
      />
      {[["personName", "Person name"], ["phone", "Phone"], ["email", "Email"]].map(([k, l]) => (
        <Fld key={k} label={l}>
          <input className="input" value={f[k]} onChange={set(k)} aria-label={l} />
        </Fld>
      ))}
      <Fld label="Service address" hint="Fills billing when billing is empty or still matched the old service address">
        <AddressAutocompleteField
          label="Service address"
          value={f.serviceAddress}
          onChange={(v) => setF((o) => ({ ...o, serviceAddress: v }))}
          onBlurExtra={() =>
            setF((o) => ({
              ...o,
              billingAddress: syncBillingFromService(o.serviceAddress, o),
            }))
          }
          jobs={jobs}
          events={events}
          suggestAddresses={api.suggestAddresses?.bind(api)}
          testId="custedit-service"
          ariaLabel="Service address"
        />
      </Fld>
      <Fld label="Billing address" hint="Your saved addresses first, then real-world matches as you type">
        <AddressAutocompleteField
          label="Billing address"
          value={f.billingAddress}
          onChange={(v) => setF((o) => ({ ...o, billingAddress: v }))}
          jobs={jobs}
          events={events}
          suggestAddresses={api.suggestAddresses?.bind(api)}
          testId="custedit-billing"
          ariaLabel="Billing address"
        />
      </Fld>
      <button className="btn-brand w-full mt-3" onClick={saveAndSync} data-testid="cust-save-sync">
        Save &amp; sync
      </button>
      <p className="text-[11px] text-slate-400 text-center mt-2">
        Saves customer info and syncs to QuickBooks. Service address here is the customer default — use Edit job to change it on a specific invoice or estimate.
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
    } (invoice ${job.invoiceNo ? "#" + job.invoiceNo : "pending"}). Please let us know if you have any questions. ${tenantSignOff()}`
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
// Pick a device file (system search), name it, Save — sheet stays open for more.
export function AttachSheet({ job, onClose }) {
  const { patchJob, enqueue, showToast } = useStore();
  const fileRef = useRef(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [mime, setMime] = useState("");
  const [fileLabel, setFileLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const existing = job.attachments || [];
  const filtered = search.trim()
    ? existing.filter((a) => String(a.name || "").toLowerCase().includes(search.trim().toLowerCase()))
    : existing;

  const resetForm = () => {
    setName("");
    setUrl("");
    setMime("");
    setFileLabel("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPickFile = async (e) => {
    const file = (e.target.files && e.target.files[0]) || null;
    if (!file) return;
    setUploading(true);
    try {
      const { uploadChatAttachment, formatFileSize } = await import("../lib/chatAttach.js");
      const fileUrl = await uploadChatAttachment(file);
      const base = String(file.name || "file").replace(/\.[^.]+$/, "") || file.name || "Attachment";
      setName(base);
      setUrl(fileUrl);
      setMime(file.type || "");
      setFileLabel((file.name || "file") + " · " + formatFileSize(file.size));
      showToast("File ready — give it a title, then Save");
    } catch (err) {
      showToast("Couldn't upload file — " + (err?.message || "try again"));
      resetForm();
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    const n = name.trim();
    const u = url.trim();
    if (!n) return showToast("Give it a title");
    if (!u) return showToast("Pick a file or paste a link first");
    const att = {
      id: "att-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      name: n,
      url: u,
      mime: mime || "",
      attachToEmail: true,
      addedAt: Date.now(),
    };
    patchJob(job.id, { attachments: (job.attachments || []).concat([att]) });
    if (u && job.invoiceNo) {
      enqueue(
        "attach_to_invoice",
        job.id,
        { invoiceNo: job.invoiceNo, name: n, url: u },
        "deterministic",
        "att:inv:" + job.id + ":" + n + ":" + att.id
      );
      showToast("Saved — also attaching to the QuickBooks invoice");
    } else if (u && job.estimateNo) {
      enqueue(
        "attach_to_estimate",
        job.id,
        { estimateNo: job.estimateNo, name: n, url: u },
        "deterministic",
        "att:est:" + job.id + ":" + n + ":" + att.id
      );
      showToast("Saved — also attaching to the QuickBooks estimate");
    } else {
      showToast("Attachment saved on this job");
    }
    // Stay open so Levi can title-confirm and add more files.
    resetForm();
  };

  return (
    <Sheet title="Add attachment" onClose={onClose}>
      <p className="text-xs text-slate-500 mb-3">
        Search your files, pick one, name it, then Save. This stays open so you can add more.
      </p>

      <input
        ref={fileRef}
        type="file"
        className="sr-only"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.heic"
        onChange={onPickFile}
        data-testid="attach-file-input"
        aria-label="Search and choose a file"
      />
      <button
        type="button"
        className="btn-brand w-full mb-3"
        disabled={uploading}
        onClick={() => fileRef.current && fileRef.current.click()}
        data-testid="attach-browse-btn"
      >
        {uploading ? "Uploading…" : "📋 Search & choose file"}
      </button>

      {fileLabel ? (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mb-3" data-testid="attach-file-ready">
          Ready: {fileLabel}
        </p>
      ) : null}

      <Fld label="Title" hint="What should this file be called on the job?">
        <input
          className="input"
          placeholder="e.g. Panel photo, signed CO, blueprint"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Attachment name"
          data-testid="attach-title"
        />
      </Fld>
      <Fld label="Or paste a link" hint="Drive / photo link if you already have one">
        <input
          className="input"
          placeholder="Optional — https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="Attachment link"
          data-testid="attach-url"
        />
      </Fld>
      <button type="button" className="btn-brand w-full mb-2" onClick={save} disabled={uploading} data-testid="attach-save-btn">
        Save attachment
      </button>
      <button type="button" className="btn-ghost w-full !py-2 mb-4" onClick={onClose} data-testid="attach-done-btn">
        Done
      </button>

      {existing.length ? (
        <div data-testid="attach-existing">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">
            On this job ({existing.length})
          </p>
          <input
            className="input mb-2"
            placeholder="Search attachments…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search attachments"
            data-testid="attach-search"
          />
          {filtered.map((a, i) => (
            <div key={a.id || i} className="text-sm flex gap-2 py-1.5 border-b border-dashed border-slate-200">
              <span className="flex-1 truncate">📎 {a.name || "file"}</span>
            </div>
          ))}
          {!filtered.length ? <p className="text-xs text-slate-400">No matches.</p> : null}
        </div>
      ) : null}
    </Sheet>
  );
}

/* ---------- 5. Job menu: archive / combine / delete ---------- */
export function MenuSheet({ job, onClose, onCombine, onConnect }) {
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
  const canLinkInvoice = !!job?.invoiceNo;
  const canLinkEstimate = !!(job?.estimateNo && !job?.invoiceNo);
  const canLinkPermit = !canLinkInvoice && !canLinkEstimate; // paperwork-only job
  return (
    <Sheet title={job.customer || "Job"} onClose={onClose}>
      {canLinkInvoice && typeof onConnect === "function" ? (
        <Opt
          icon="🔗"
          title="Link to estimate or permit"
          note="Connect this invoice to an estimate or permit job at the same address"
          onClick={() => onConnect("invoice")}
          data-testid="menu-connect-invoice"
        />
      ) : null}
      {canLinkEstimate && typeof onConnect === "function" ? (
        <Opt
          icon="🔗"
          title="Link to invoice"
          note="Connect this estimate to an invoice at the same address"
          onClick={() => onConnect("estimate")}
          data-testid="menu-connect-estimate"
        />
      ) : null}
      {canLinkPermit && typeof onConnect === "function" ? (
        <Opt
          icon="🏙️"
          title="Link permit to invoice"
          note="Attach this permit/paperwork job to an invoice at the same address"
          onClick={() => onConnect("permit")}
          data-testid="menu-connect-permit"
        />
      ) : null}
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

/* ---------- 6. Delete confirm (job / invoice / estimate / customer) ---------- */
export function DeleteConfirmSheet({
  title,
  note,
  confirmLabel,
  onConfirm,
  onClose,
  /** When set, user must type this exact word (case-insensitive) before Remove enables. */
  typeToConfirm,
}) {
  const [typed, setTyped] = useState("");
  const needType = String(typeToConfirm || "").trim();
  const typedOk = !needType || typed.trim().toUpperCase() === needType.toUpperCase();
  return (
    <Sheet title={title || "Remove from app?"} onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">
        {note || "Removes from your dashboard only — QuickBooks is never touched."}
      </p>
      {needType ? (
        <div className="mb-3" data-testid="delete-type-confirm">
          <label className="block text-xs font-bold text-slate-500 mb-1.5">
            Type <span className="text-red-700 font-extrabold tracking-wide">{needType}</span> to confirm
          </label>
          <input
            className="input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label={"Type " + needType + " to confirm"}
            data-testid="delete-type-input"
            autoComplete="off"
            placeholder={needType}
          />
        </div>
      ) : null}
      <button
        type="button"
        className="btn bg-red-100 text-red-600 w-full disabled:opacity-40"
        data-testid="delete-confirm-btn"
        disabled={!typedOk}
        onClick={() => {
          if (!typedOk) return;
          onConfirm?.();
          onClose?.();
        }}
      >
        {confirmLabel || "Remove"}
      </button>
      <button type="button" className="btn-ghost w-full mt-2" onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}

export function CustomerMenuSheet({ customerKey, customerName, jobCount, onClose }) {
  const { jobs, patchAndSave, showToast } = useStore();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState(false);

  if (confirm) {
    return (
      <DeleteConfirmSheet
        title={"Remove " + (customerName || "customer") + "?"}
        note={
          "Hides " +
          (jobCount || 0) +
          " job" +
          (jobCount === 1 ? "" : "s") +
          " from your dashboard. QuickBooks stays unchanged."
        }
        confirmLabel="Remove customer"
        onClose={onClose}
        onConfirm={async () => {
          const ids = jobsForCustomerKey(jobs, customerKey).map((j) => j.id);
          for (const id of ids) {
            await patchAndSave(id, { _deleted: true });
          }
          showToast("Customer removed from app");
          nav("/");
        }}
      />
    );
  }

  return (
    <Sheet title={customerName || "Customer"} onClose={onClose}>
      <Opt
        icon="🗑️"
        danger
        title="Remove customer from app"
        note={
          (jobCount || 0) +
          " job" +
          (jobCount === 1 ? "" : "s") +
          " hidden — QuickBooks untouched"
        }
        onClick={() => setConfirm(true)}
        data-testid="customer-delete-opt"
      />
    </Sheet>
  );
}

/* ---------- 7. Inspection scheduled / appointment (paperwork) ---------- */
export function InspectionSheet(props) {
  return <PaperworkApptSheet {...props} />;
}
