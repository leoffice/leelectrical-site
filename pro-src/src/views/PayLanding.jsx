// Public View & Pay (invoices) + View and Approve (estimates).
import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import SolaCardForm, { tokenizeSolaCard } from "../components/SolaCardForm.jsx";
import {
  addressesDiffer,
  estimatePdfUrl,
  invoicePdfUrl,
  isEstimateLanding,
  resolvePayLandingToken,
} from "../lib/payLanding.js";
import { openPdfUrl } from "../lib/pdfOpen.js";
import {
  PDF_RETRIEVE_STAGES,
  invoicePdfAvailable,
  retrieveInvoicePdf,
} from "../lib/payInvoicePdf.js";
import {
  feeEnabledInPayload,
  fmtMoneyPrecise,
  parseMoney,
  processingFee,
  totalWithFee,
} from "../lib/payFees.js";
import {
  ACH_AUTH_LETTER,
  chargeAchFromLanding,
  chargeCardFromLanding,
  fetchSolaIfieldsConfig,
  validateAchBankFields,
} from "../lib/solaCharge.js";
import {
  buildDepositInvoicePdfB64,
  buildEstimatePdfBlobFromPayload,
  buildInvoicePdfBlobFromPayload,
  depositAmountFromPayload,
  depositPctFromPayload,
  estimateDocNo,
  formatDepositCta,
  postEstimateAction,
} from "../lib/estimateLanding.js";
import { useTenantConfig } from "../state/tenant.jsx";
import { productName, tenantLocality } from "../lib/tenantBranding.js";
import { functionsBase } from "../lib/functionsBase.js";
import {
  analyzePaymentScreenshot,
  compressImageForVision,
  fileToBase64,
  normalizeVisionMime,
} from "../lib/paymentVision.js";
import { paymentAutofillPatch } from "../lib/paymentAutofill.js";

const DEFAULT_LOGO = import.meta.env.BASE_URL + "le-logo.png?v=5";

function Row({ label, value, bold, children, onClick, expandable }) {
  if (children) {
    return (
      <div className="flex justify-between items-center gap-4 py-2.5 border-b border-slate-100 last:border-0">
        <span className="text-slate-500 text-sm shrink-0">{label}</span>
        <div className="text-sm text-right min-w-0">{children}</div>
      </div>
    );
  }
  if (!value && value !== 0) return null;
  const inner = (
    <>
      <span className="text-slate-500 text-sm">{label}</span>
      <span
        className={`text-sm text-right ${bold ? "font-bold text-slate-900 text-base" : "text-slate-900"} ${
          expandable ? "underline decoration-dotted underline-offset-2" : ""
        }`}
      >
        {value}
        {expandable ? " ▾" : ""}
      </span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className="w-full flex justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0 text-left"
        onClick={onClick}
      >
        {inner}
      </button>
    );
  }
  return <div className="flex justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">{inner}</div>;
}

function PdfRetrieveOverlay({ phase, invoiceNo, onClose }) {
  const active =
    phase === "checking" || phase === "requesting"
      ? 0
      : phase === "fetching"
      ? 1
      : phase === "ready"
      ? 2
      : 0;
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Retrieving invoice"
      data-testid="pdf-retrieve-overlay"
    >
      <div className="card max-w-sm w-full p-6 text-center shadow-xl">
        <div className="text-4xl mb-3" aria-hidden>
          📄
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 mb-1">Loading your invoice</h2>
        <p className="text-sm text-slate-500 mb-4">
          Generating invoice #{invoiceNo} for you. This usually takes just a few seconds.
        </p>
        <div className="flex items-center justify-center flex-wrap gap-x-1.5 gap-y-1 text-[11px] font-semibold mb-4">
          {PDF_RETRIEVE_STAGES.map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <span className={i <= active ? "text-brand" : "text-slate-300"}>→</span>}
              <span
                className={
                  i < active ? "text-emerald-600" : i === active ? "text-brand" : "text-slate-400"
                }
              >
                {i < active ? "✓ " : ""}
                {s}
              </span>
            </React.Fragment>
          ))}
        </div>
        {onClose ? (
          <button type="button" className="btn-ghost w-full mt-4 text-sm" onClick={onClose}>
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

function usePayToken() {
  const { token: pathToken } = useParams();
  const [search] = useSearchParams();
  return (pathToken || search.get("t") || "").trim();
}

export default function PayLanding() {
  const navigate = useNavigate();
  const token = usePayToken();
  const [data, setData] = useState(null);
  const [resolving, setResolving] = useState(Boolean(token));
  const [payAmount, setPayAmount] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pdfReady, setPdfReady] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfPhase, setPdfPhase] = useState("idle");
  const [pdfErr, setPdfErr] = useState("");
  const [showPaidHist, setShowPaidHist] = useState(false);
  const [showWorkDesc, setShowWorkDesc] = useState(false);
  const workDescTimer = useRef(null);
  const [cardReady, setCardReady] = useState(false);
  const [saveOnFile, setSaveOnFile] = useState(true);
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState("");
  const [estBusy, setEstBusy] = useState("");
  const [estMsg, setEstMsg] = useState("");
  const [estErr, setEstErr] = useState("");
  const [approved, setApproved] = useState(false);
  const [depositDone, setDepositDone] = useState(null);
  /** Client-built estimate PDF object URL when docs store has no file yet. */
  const [localEstPdfUrl, setLocalEstPdfUrl] = useState("");
  const localEstPdfUrlRef = useRef("");
  const [checkOpen, setCheckOpen] = useState(false);
  const [checkFile, setCheckFile] = useState(null);
  const [checkB64, setCheckB64] = useState("");
  const [checkNo, setCheckNo] = useState("");
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkErr, setCheckErr] = useState("");
  const [checkReadBusy, setCheckReadBusy] = useState(false);
  const [checkReadDone, setCheckReadDone] = useState(false);
  const [checkRouting, setCheckRouting] = useState("");
  const [checkAccount, setCheckAccount] = useState("");
  const [checkName, setCheckName] = useState("");
  const [checkIntent, setCheckIntent] = useState("process"); // record | process
  const [checkProcessConfirm, setCheckProcessConfirm] = useState(false);
  /** Customer View & Pay bank debit — SOLA_ACH_CUSTOMER_ENABLED. */
  const [achEnabled, setAchEnabled] = useState(false);
  const [customerAuthOk, setCustomerAuthOk] = useState(false);
  /** card | bank */
  const [payTab, setPayTab] = useState("card");
  const checkInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetchSolaIfieldsConfig()
      .then((cfg) => {
        if (cancelled) return;
        setAchEnabled(Boolean(cfg.achCustomerEnabled));
      })
      .catch(() => {
        if (!cancelled) setAchEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isEstimate = isEstimateLanding(data);
  const includeFee = !isEstimate && feeEnabledInPayload(data);

  // Public page: renders OUTSIDE TenantProvider (see main.jsx — /pay bypasses
  // LockGate and StoreProvider), so this is the BUILD seed rather than the
  // server config of the tenant who issued the link. Fine while the build is
  // single-tenant; a later batch must resolve branding from the pay token so a
  // customer of tenant B is never shown tenant A's name and logo.
  const config = useTenantConfig();
  const profile = config.profile || {};
  const logo = config.branding?.logoUrl || DEFAULT_LOGO;
  // Short trading name — this page has always shown "BLZ Electric", not the
  // legal "… Inc." carried on the invoice PDF.
  const brandName = profile.shortName || "";
  const subline = [tenantLocality(config), profile.tagline].filter(Boolean).join(" · ");
  const website = profile.website || "";

  useEffect(() => {
    if (!token) {
      setData(null);
      setResolving(false);
      return;
    }
    let alive = true;
    setResolving(true);
    resolvePayLandingToken(token)
      .then((resolved) => {
        if (alive) setData(resolved);
      })
      .finally(() => {
        if (alive) setResolving(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (data?.a) {
      setPayAmount(parseMoney(data.a));
      setDraft(String(data.a));
    }
    if (data) {
      setApproved(!!data.approved);
      if (data.depositDone) {
        setDepositDone({
          invoiceNo: data.depositInvoiceNo,
          payUrl: data.depositPayUrl,
          amount: data.depositAmount,
        });
      }
    }
  }, [data?.a, data?.approved, data?.depositDone, data?.depositInvoiceNo, data?.depositPayUrl, data?.depositAmount]);

  // Work description: expand on tap; auto-collapse after 20s (or collapse yourself).
  useEffect(() => {
    clearTimeout(workDescTimer.current);
    if (!showWorkDesc) return undefined;
    workDescTimer.current = setTimeout(() => setShowWorkDesc(false), 20_000);
    return () => clearTimeout(workDescTimer.current);
  }, [showWorkDesc]);

  const estNo = isEstimateLanding(data) ? estimateDocNo(data) : "";
  const storePdfSrc = data?.i
    ? isEstimateLanding(data)
      ? estimatePdfUrl(estNo || data.i)
      : invoicePdfUrl(data.i)
    : "";
  // Prefer stored PDF; fall back to client-built blob URL for estimates (test links / store miss).
  const pdfSrc = localEstPdfUrl || storePdfSrc;

  useEffect(() => {
    if (!storePdfSrc || !data) return;
    let alive = true;
    const revokeLocal = () => {
      if (localEstPdfUrlRef.current) {
        try {
          URL.revokeObjectURL(localEstPdfUrlRef.current);
        } catch {
          /* ignore */
        }
        localEstPdfUrlRef.current = "";
      }
    };
    setLocalEstPdfUrl("");
    setPdfReady(false);
    setPdfErr("");

    (async () => {
      const ok = await invoicePdfAvailable(storePdfSrc);
      if (!alive) return;
      if (ok) {
        revokeLocal();
        setLocalEstPdfUrl("");
        setPdfReady(true);
        return;
      }
      // Build PDF from link payload so customers always see the document
      // (estimates + invoices — no office computer required).
      try {
        const built = isEstimateLanding(data)
          ? await buildEstimatePdfBlobFromPayload(data)
          : await buildInvoicePdfBlobFromPayload(data);
        if (built.ok && built.blob) {
          revokeLocal();
          const url = URL.createObjectURL(built.blob);
          localEstPdfUrlRef.current = url;
          setLocalEstPdfUrl(url);
          setPdfReady(true);
          return;
        }
      } catch {
        /* fall through */
      }
      setPdfReady(false);
    })();

    return () => {
      alive = false;
      revokeLocal();
    };
  }, [storePdfSrc, data]);

  if (resolving) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="card max-w-md w-full p-6 text-center">
          <p className="text-sm text-slate-500">Loading…</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="card max-w-md w-full p-6 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-lg font-bold text-slate-900 mb-2">Link not valid</h1>
          <p className="text-sm text-slate-500 mb-4">
            This link may be incomplete or expired. Contact {brandName} for a fresh link.
          </p>
          <a href={`https://${website}`} className="text-brand font-semibold text-sm">
            {website}
          </a>
        </div>
      </div>
    );
  }

  const fee = processingFee(payAmount, includeFee);
  const chargeTotal = totalWithFee(payAmount, includeFee);
  const asOf = data.as || "today";
  const balanceDue = parseMoney(data.d) || parseMoney(data.a);
  const showService = addressesDiffer(data.ba, data.sa);
  const paidLines = Array.isArray(data.ps) ? data.ps.filter((p) => p?.a) : [];

  const saveAmount = () => {
    const n = parseMoney(draft);
    if (n > 0) {
      setPayAmount(n);
      setEditing(false);
    }
  };



  const submitPayment = async () => {
    if (payBusy || payAmount <= 0) return;
    if (!cardReady) {
      setPayErr("Card fields still loading — wait a moment");
      return;
    }
    setPayErr("");
    setPayBusy(true);
    try {
      const tokens = await tokenizeSolaCard();
      const res = await chargeCardFromLanding({
        data,
        principalAmount: payAmount,
        includeFee,
        saveOnFile,
        ...tokens,
      });
      const newBal = Math.max(0, balanceDue - payAmount);
      const qs = new URLSearchParams({
        ok: "1",
        inv: String(data.i || ""),
        amt: String(res.amount ?? payAmount),
        bal: String(newBal),
      });
      navigate(`/pay/thanks?${qs.toString()}`);
    } catch (e) {
      setPayErr(String((e && e.message) || "Payment could not be completed"));
    } finally {
      setPayBusy(false);
    }
  };

  const openLocalBuiltPdf = (built) => {
    if (!built?.ok || !built.blob) return false;
    const url = URL.createObjectURL(built.blob);
    if (localEstPdfUrlRef.current) {
      try {
        URL.revokeObjectURL(localEstPdfUrlRef.current);
      } catch {
        /* ignore */
      }
    }
    localEstPdfUrlRef.current = url;
    setLocalEstPdfUrl(url);
    setPdfReady(true);
    setPdfErr("");
    openPdfUrl(url);
    return true;
  };

  const openInvoicePdf = async (e) => {
    e?.preventDefault?.();
    if (!data?.i) return;
    // Prefer already-ready source (store or client blob).
    if (pdfReady && pdfSrc) {
      openPdfUrl(pdfSrc);
      return;
    }
    // Estimates: never wait on host — build from payload if needed.
    if (isEstimate) {
      try {
        if (openLocalBuiltPdf(await buildEstimatePdfBlobFromPayload(data))) return;
      } catch {
        /* fall through */
      }
      setPdfErr("Estimate PDF is not available yet. Please contact the office.");
      return;
    }
    setPdfErr("");
    setPdfBusy(true);
    setPdfPhase("checking");
    const result = await retrieveInvoicePdf({
      url: storePdfSrc,
      invoiceNo: data.i,
      jobId: data.j || "",
      payload: data,
      onPhase: setPdfPhase,
    });
    setPdfBusy(false);
    setPdfPhase("idle");
    if (result?.ok && result.blobUrl) {
      if (localEstPdfUrlRef.current) {
        try {
          URL.revokeObjectURL(localEstPdfUrlRef.current);
        } catch {
          /* ignore */
        }
      }
      localEstPdfUrlRef.current = result.blobUrl;
      setLocalEstPdfUrl(result.blobUrl);
      setPdfReady(true);
      openPdfUrl(result.blobUrl);
      return;
    }
    if (result?.ok && storePdfSrc) {
      setPdfReady(true);
      openPdfUrl(storePdfSrc);
      return;
    }
    // Last resort: pure client build (same layout as office).
    try {
      if (openLocalBuiltPdf(await buildInvoicePdfBlobFromPayload(data))) return;
    } catch {
      /* fall through */
    }
    setPdfErr(
      "We couldn't open the invoice PDF. Please try again, or contact the office for a copy."
    );
  };

  const onCheckFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCheckErr("");
    setCheckFile(file);
    setCheckReadDone(false);
    setCheckRouting("");
    setCheckAccount("");
    try {
      const b64 = await fileToBase64(file);
      setCheckB64(b64);
      // Auto-read check fields (amount, check #, routing, account) from the photo.
      setCheckReadBusy(true);
      try {
        let visionB64 = b64;
        let visionMime = normalizeVisionMime(file.type || "image/jpeg");
        if (String(file.type || "").startsWith("image/")) {
          try {
            const prepared = await compressImageForVision(file);
            if (prepared?.b64) {
              visionB64 = prepared.b64;
              visionMime = prepared.mime || visionMime;
            }
          } catch {
            /* keep original */
          }
        }
        const extracted = await analyzePaymentScreenshot(visionB64, visionMime, "check");
        const patch = paymentAutofillPatch(extracted);
        if (patch.amt) {
          const n = parseMoney(patch.amt);
          if (n > 0) {
            setPayAmount(n);
            setDraft(String(n));
          }
        }
        if (patch.ref) setCheckNo(patch.ref);
        if (patch.routing) setCheckRouting(patch.routing);
        if (patch.account) setCheckAccount(patch.account);
        if (patch.name) setCheckName(patch.name);
        else if (data?.c) setCheckName(data.c);
        setCheckReadDone(Boolean(patch.amt || patch.ref || patch.routing));
        if (patch.routing && patch.account && achEnabled) {
          setCheckIntent("process");
        }
      } catch {
        // Still allow manual submit without vision.
        setCheckReadDone(false);
      } finally {
        setCheckReadBusy(false);
      }
    } catch {
      setCheckFile(null);
      setCheckB64("");
      setCheckErr("Could not read that photo — try another.");
    }
  };

  const submitCheckPayment = async () => {
    if (checkBusy || !data?.i) return;
    if (!checkB64) {
      setCheckErr("Add a photo of your check first.");
      return;
    }
    if (payAmount <= 0) {
      setCheckErr("Enter the amount you're paying.");
      return;
    }
    setCheckErr("");
    setCheckBusy(true);
    try {
      const res = await fetch(`${functionsBase()}/customer-check-pay`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          invoiceNo: data.i,
          jobId: data.j || "",
          amount: payAmount,
          checkNumber: checkNo,
          customer: data.c || checkName || "",
          email: data.e || "",
          imageB64: checkB64,
          mime: checkFile?.type || "image/jpeg",
          fileName: checkFile?.name || "check.jpg",
          intent: "record",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        throw new Error(body.error || body.message || `Could not submit (${res.status})`);
      }
      const qs = new URLSearchParams({
        ok: "1",
        inv: String(data.i || ""),
        amt: String(payAmount),
        bal: String(Math.max(0, balanceDue - payAmount)),
        method: "check",
      });
      navigate(`/pay/thanks?${qs.toString()}`);
    } catch (err) {
      setCheckErr(String((err && err.message) || "Could not submit check — try again"));
    } finally {
      setCheckBusy(false);
    }
  };

  const requestProcessCheck = () => {
    if (!checkB64) {
      setCheckErr("Add a photo of your check first.");
      return;
    }
    if (payAmount <= 0) {
      setCheckErr("Enter the amount you're paying.");
      return;
    }
    if (!achEnabled) {
      setCheckErr("Instant bank pay is not available yet — submit for office review instead.");
      return;
    }
    const bank = validateAchBankFields({
      routing: checkRouting,
      account: checkAccount,
      name: checkName || data?.c || "",
    });
    if (!bank.ok) {
      setCheckErr(bank.error + " — fix the fields or re-photo the bottom of the check.");
      return;
    }
    if (!customerAuthOk) {
      setCheckErr("Please review and confirm the checking account and routing number (authorization).");
      return;
    }
    setCheckErr("");
    setCheckProcessConfirm(true);
  };

  const processCheckPayment = async () => {
    if (checkBusy || !data?.i) return;
    setCheckProcessConfirm(false);
    setCheckBusy(true);
    setCheckErr("");
    try {
      const res = await chargeAchFromLanding({
        data,
        principalAmount: payAmount,
        routing: checkRouting,
        account: checkAccount,
        name: checkName || data.c || "",
        checkNumber: checkNo,
        paymentMethod: "Check",
        imageB64: checkB64,
        authorized: customerAuthOk,
        authLetter: ACH_AUTH_LETTER.body,
      });
      const qs = new URLSearchParams({
        ok: "1",
        inv: String(data.i || ""),
        amt: String(res.amount || payAmount),
        bal: String(Math.max(0, balanceDue - (res.amount || payAmount))),
        method: "check",
        processed: "1",
        ref: String(res.ref || ""),
      });
      navigate(`/pay/thanks?${qs.toString()}`);
    } catch (err) {
      setCheckErr(String((err && err.message) || "Could not process check — try again or submit for office review"));
    } finally {
      setCheckBusy(false);
    }
  };

  const depositPct = depositPctFromPayload(data);
  const depositAmt = depositAmountFromPayload(data, depositPct);

  const runApprove = async () => {
    if (estBusy || !token) return;
    setEstErr("");
    setEstMsg("");
    setEstBusy("approve");
    try {
      const res = await postEstimateAction({ code: token, action: "approve" });
      setApproved(true);
      setEstMsg(res.message || "Estimate approved. Thank you!");
    } catch (e) {
      setEstErr(String(e?.message || e || "Could not approve"));
    } finally {
      setEstBusy("");
    }
  };

  const runDeposit = async () => {
    if (estBusy || !token) return;
    setEstErr("");
    setEstMsg("");
    setEstBusy("deposit");
    try {
      const built = await buildDepositInvoicePdfB64(data, { depositPct });
      if (!built.ok) throw new Error(built.error || "Could not build deposit invoice");
      const res = await postEstimateAction({
        code: token,
        action: "deposit",
        pdfB64: built.pdfB64,
        invoiceNo: built.invoiceNo,
        depositPct,
      });
      setApproved(true);
      setDepositDone({
        invoiceNo: res.invoiceNo || built.invoiceNo,
        payUrl: res.payUrl || "",
        amount: res.amount ?? built.amount,
      });
      setEstMsg(res.message || "Deposit invoice created and emailed.");
    } catch (e) {
      setEstErr(String(e?.message || e || "Could not create deposit invoice"));
    } finally {
      setEstBusy("");
    }
  };

  // ——— Estimate: View and Approve ———
  if (isEstimate) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200 px-4 py-6 pt-safe shadow-sm">
          <div className="max-w-lg mx-auto flex flex-col items-center text-center gap-2">
            <img
              src={logo}
              alt={brandName}
              className="h-36 sm:h-40 w-auto max-w-[min(100%,380px)] object-contain"
              data-testid="pay-logo"
            />
            <div>
              <div className="font-extrabold text-xl tracking-tight text-slate-900">{brandName}</div>
              <div className="text-slate-500 text-sm">{subline}</div>
            </div>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 pb-10">
          <div className="card p-5 mb-4">
            <div className="min-w-0 mb-4">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
                <span className="text-brand">Estimate</span>{" "}
                <span className="tabular-nums">#{estNo || data.i}</span>
              </h1>
              {data.c ? (
                <p className="text-lg font-semibold text-slate-800 mt-2 leading-snug">{data.c}</p>
              ) : null}
            </div>

            <div className={`grid gap-4 text-sm ${addressesDiffer(data.ba, data.sa) ? "sm:grid-cols-2" : ""}`}>
              {data.ba ? (
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                    Billing address
                  </div>
                  <div className="text-slate-900 leading-snug">{data.ba}</div>
                </div>
              ) : null}
              {addressesDiffer(data.ba, data.sa) && data.sa ? (
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                    Service address
                  </div>
                  <div className="text-slate-900 leading-snug">{data.sa}</div>
                </div>
              ) : null}
            </div>

            {data.w ? (
              <div className="mt-4 text-sm">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                  Work
                </div>
                <div className="text-slate-900 leading-snug whitespace-pre-wrap">{data.w}</div>
              </div>
            ) : null}

            <div className="mt-4 flex justify-between items-baseline gap-3 border-t border-slate-100 pt-3">
              <span className="text-sm text-slate-500">Estimate total</span>
              <span className="text-xl font-extrabold text-slate-900 tabular-nums">
                {data.t || data.d || fmtMoneyPrecise(parseMoney(data.a))}
              </span>
            </div>
          </div>

          {/* Top action buttons */}
          <div className="flex flex-col gap-3 mb-4">
            <button
              type="button"
              className={`btn-brand w-full !py-3.5 text-base shadow-md ${
                estBusy || approved ? "opacity-80" : ""
              }`}
              data-testid="estimate-approve"
              disabled={!!estBusy || approved}
              onClick={runApprove}
            >
              {approved ? "Approved ✓" : estBusy === "approve" ? "Approving…" : "Approve"}
            </button>
            <button
              type="button"
              className={`w-full !py-3.5 text-base font-bold rounded-2xl border-2 border-brand text-brand bg-white hover:bg-brand-soft shadow-sm ${
                estBusy || depositDone ? "opacity-80" : ""
              }`}
              data-testid="estimate-deposit"
              disabled={!!estBusy || !!depositDone}
              onClick={runDeposit}
            >
              {depositDone
                ? `Deposit invoice #${depositDone.invoiceNo} ready`
                : estBusy === "deposit"
                ? "Creating deposit invoice…"
                : formatDepositCta(depositAmt, depositPct)}
            </button>
          </div>

          {estMsg ? (
            <p
              className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-4"
              data-testid="estimate-success"
            >
              {estMsg}
            </p>
          ) : null}
          {estErr ? (
            <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">
              {estErr}
            </p>
          ) : null}

          {depositDone?.payUrl ? (
            <a
              href={depositDone.payUrl}
              className="btn-brand w-full !py-3.5 text-base shadow-md mb-4 inline-flex items-center justify-center"
              data-testid="estimate-pay-link"
            >
              Pay deposit invoice now
            </a>
          ) : null}

          {/* PDF on page (not download-first) */}
          <div className="card p-3 mb-4 overflow-hidden" data-testid="estimate-pdf-panel">
            <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-2">
              <h2 className="font-bold text-slate-900 text-sm">Estimate PDF</h2>
              {pdfSrc ? (
                <button
                  type="button"
                  className="text-xs font-bold text-brand"
                  data-testid="estimate-pdf-open"
                  onClick={openInvoicePdf}
                >
                  Open full screen
                </button>
              ) : null}
            </div>
            {pdfSrc && pdfReady ? (
              <iframe
                title={`Estimate ${estNo || data.i}`}
                src={pdfSrc}
                className="w-full rounded-xl border border-slate-200 bg-white"
                style={{ minHeight: "70vh", height: "640px" }}
                data-testid="estimate-pdf-frame"
              />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                <p className="text-sm text-slate-500 mb-3">
                  {pdfSrc
                    ? "Loading the estimate PDF…"
                    : "PDF is not available for this link."}
                </p>
                {storePdfSrc || data ? (
                  <button
                    type="button"
                    className="text-sm font-bold text-brand"
                    onClick={async () => {
                      if (!data) return;
                      if (storePdfSrc) {
                        const ok = await invoicePdfAvailable(storePdfSrc);
                        if (ok) {
                          setLocalEstPdfUrl("");
                          setPdfReady(true);
                          setPdfErr("");
                          return;
                        }
                        const built = await buildEstimatePdfBlobFromPayload(data);
                        if (built.ok && built.blob) {
                          if (localEstPdfUrlRef.current) {
                            try {
                              URL.revokeObjectURL(localEstPdfUrlRef.current);
                            } catch {
                              /* ignore */
                            }
                          }
                          const url = URL.createObjectURL(built.blob);
                          localEstPdfUrlRef.current = url;
                          setLocalEstPdfUrl(url);
                          setPdfReady(true);
                          setPdfErr("");
                        } else {
                          setPdfReady(false);
                        }
                      } else {
                        const built = await buildEstimatePdfBlobFromPayload(data);
                        if (built.ok && built.blob) {
                          const url = URL.createObjectURL(built.blob);
                          localEstPdfUrlRef.current = url;
                          setLocalEstPdfUrl(url);
                          setPdfReady(true);
                        }
                      }
                    }}
                  >
                    Retry
                  </button>
                ) : null}
              </div>
            )}
            {pdfErr ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-3">
                {pdfErr}
              </p>
            ) : null}
          </div>
        </main>

        <footer className="text-center text-[11px] text-slate-500 pb-8 px-4">
          <a href={`https://${website}`} className="text-slate-500 hover:text-brand">
            {website}
          </a>
          <span className="mx-2">·</span>
          <Link to="/" className="text-slate-400">
            {productName(config)} (staff)
          </Link>
        </footer>
      </div>
    );
  }

  // ——— Invoice: View & Pay ———
  return (
    <div className="min-h-screen bg-slate-50">
      {pdfBusy && pdfPhase !== "idle" ? (
        <PdfRetrieveOverlay
          phase={pdfPhase}
          invoiceNo={data.i}
          onClose={() => {
            setPdfBusy(false);
            setPdfPhase("idle");
          }}
        />
      ) : null}

      <header className="bg-white border-b border-slate-200 px-4 py-6 pt-safe shadow-sm">
        <div className="max-w-lg mx-auto flex flex-col items-center text-center gap-2">
          <img
            src={logo}
            alt={brandName}
            className="h-36 sm:h-40 w-auto max-w-[min(100%,380px)] object-contain"
            data-testid="pay-logo"
          />
          <div>
            <div className="font-extrabold text-xl tracking-tight text-slate-900">{brandName}</div>
            <div className="text-slate-500 text-sm">{subline}</div>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-10">
        <div className="card p-5 mb-4">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
                <span className="text-brand">Invoice</span>{" "}
                <span className="tabular-nums">#{data.i}</span>
              </h1>
              {data.c ? (
                <p className="text-lg font-semibold text-slate-800 mt-2 leading-snug">{data.c}</p>
              ) : null}
            </div>
            <a
              href={pdfReady ? pdfSrc : pdfSrc || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-sm font-bold rounded-xl px-3.5 py-2 shrink-0 ${
                pdfBusy
                  ? "bg-brand-soft text-brand pointer-events-none opacity-70"
                  : "bg-brand-soft text-brand hover:bg-slate-50"
              }`}
              data-testid="view-invoice"
              onClick={openInvoicePdf}
            >
              {pdfBusy ? "Retrieving…" : "View invoice"}
            </a>
          </div>

          <div className={`grid gap-4 text-sm ${showService ? "sm:grid-cols-2" : ""}`}>
            {data.ba ? (
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                  Billing address
                </div>
                <div className="text-slate-900 leading-snug">{data.ba}</div>
              </div>
            ) : null}
            {showService && data.sa ? (
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                  Service address
                </div>
                <div className="text-slate-900 leading-snug">{data.sa}</div>
              </div>
            ) : null}
          </div>

          {data.w ? (
            <div className="mt-4 text-sm">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1 flex items-center justify-between gap-2">
                <span>Work</span>
                <button
                  type="button"
                  className="text-[10px] font-bold text-brand normal-case tracking-normal px-1 py-0.5"
                  data-testid="work-desc-toggle"
                  aria-expanded={showWorkDesc}
                  onClick={() => setShowWorkDesc((v) => !v)}
                >
                  {showWorkDesc ? "Hide ▴" : "Details ▾"}
                </button>
              </div>
              {/* Conditional render — iOS-safe (max-height on pre-wrap was a no-op for some taps) */}
              <div
                className={
                  "text-slate-900 leading-snug whitespace-pre-wrap " +
                  (showWorkDesc ? "" : "line-clamp-2 overflow-hidden")
                }
                data-testid="work-desc-body"
              >
                {data.w}
              </div>
            </div>
          ) : null}

          {pdfErr ? (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-4">
              {pdfErr}
            </p>
          ) : null}
        </div>

        <div className="card p-5 mb-4">
          <h2 className="font-bold text-slate-900 mb-2">Payment summary</h2>
          <p className="text-[11px] text-slate-500 mb-3">As of {asOf}</p>
          <Row label="Invoice total" value={data.t} />
          <Row
            label="Paid to date"
            value={data.p}
            expandable={paidLines.length > 0}
            onClick={paidLines.length ? () => setShowPaidHist((v) => !v) : undefined}
          />
          {showPaidHist && paidLines.length ? (
            <div className="mb-2 -mt-1 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-600 space-y-1.5">
              {paidLines.map((p, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span>
                    {p.a}
                    {p.m ? ` · ${p.m}` : ""}
                    {p.d ? ` · ${p.d}` : ""}
                  </span>
                  {p.r ? <span className="text-slate-400 shrink-0">#{p.r}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
          <Row label="Balance due" value={data.d} bold />
          <Row label="Paying today">
            {editing ? (
              <div className="flex items-center gap-2 justify-end">
                <input
                  type="text"
                  inputMode="decimal"
                  className="input !py-2 !px-3 w-32 text-right text-base font-semibold"
                  aria-label="Payment amount"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveAmount()}
                />
                <button type="button" className="btn-brand !py-2 !px-3 text-xs" onClick={saveAmount}>
                  Done
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="flex items-center gap-2 justify-end group"
                aria-label="Edit payment amount"
                data-testid="edit-amount"
                onClick={() => {
                  setDraft(String(payAmount));
                  setEditing(true);
                }}
              >
                <span className="font-bold text-slate-900 text-base">{fmtMoneyPrecise(payAmount)}</span>
                <span className="grid place-items-center w-8 h-8 rounded-full bg-brand-soft text-brand text-sm">
                  ✏️
                </span>
              </button>
            )}
          </Row>
          {includeFee ? (
            <>
              <Row label="Processing fee (3.5%)" value={fmtMoneyPrecise(fee)} />
              <Row label="Total charge" value={fmtMoneyPrecise(chargeTotal)} bold />
            </>
          ) : (
            <Row label="Total charge" value={fmtMoneyPrecise(payAmount)} bold />
          )}
        </div>

        {includeFee ? (
          <p className="text-[11px] text-slate-500 mb-4 px-1 leading-relaxed">
            Tap ✏️ to change the amount before paying. A 3.5% processing fee is added on top.
          </p>
        ) : null}

        <div
          className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-1.5 flex gap-1"
          role="tablist"
          aria-label="Payment method"
          data-testid="pay-method-tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={payTab === "card"}
            className={`flex-1 rounded-lg px-2 py-2.5 text-xs font-bold ${
              payTab === "card" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
            data-testid="pay-tab-card"
            onClick={() => setPayTab("card")}
          >
            Credit card
            {includeFee ? <span className="block text-[10px] font-semibold text-slate-500">+3.5% fee</span> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={payTab === "bank"}
            className={`flex-1 rounded-lg px-2 py-2.5 text-xs font-bold ${
              payTab === "bank" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-500"
            }`}
            data-testid="pay-tab-bank"
            onClick={() => {
              setPayTab("bank");
              setCheckOpen(true);
            }}
          >
            ACH / Check
            <span className="block text-[10px] font-semibold text-slate-500">No card fee</span>
          </button>
        </div>

        {payTab === "card" ? (
        <div className="card p-5 mb-4">
          <h2 className="font-bold text-slate-900 mb-1">Pay by card</h2>
          <p className="text-[11px] text-slate-500 mb-4">
            Secure payment — your card details stay on our encrypted form, not a third-party page.
          </p>
          <SolaCardForm disabled={payBusy || checkBusy} onReadyChange={setCardReady} />
          <label
            className="flex items-start gap-2.5 mt-4 cursor-pointer select-none"
            data-testid="save-card-for-future"
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
              checked={saveOnFile}
              disabled={payBusy || checkBusy}
              onChange={(e) => setSaveOnFile(e.target.checked)}
            />
            <span className="text-sm text-slate-700 leading-snug">
              <span className="font-semibold">Save this card for future payments</span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                Securely store your card for this customer so the next invoice is one tap.
              </span>
            </span>
          </label>
          {payErr ? (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-3">
              {payErr}
            </p>
          ) : null}
        </div>
        ) : null}

        {payTab === "card" ? (
        <>
        <button
          type="button"
          className={`btn-brand w-full !py-4 text-base shadow-md mb-2 ${
            payBusy || !cardReady ? "opacity-70" : ""
          }`}
          data-testid="pay-cta"
          disabled={payBusy || checkBusy || !cardReady || payAmount <= 0}
          onClick={submitPayment}
        >
          {payBusy ? "Processing…" : `Pay ${fmtMoneyPrecise(includeFee ? chargeTotal : payAmount)}`}
        </button>
        <p className="text-center text-[11px] text-slate-500 px-2 mb-4">
          You&apos;ll get a confirmation on this page right after payment.
        </p>
        </>
        ) : null}

        <div className={`card p-5 mb-4 ${payTab === "bank" ? "" : "hidden"}`} data-testid="pay-by-check">
          <div className="mb-3">
              <h2 className="font-bold text-slate-900">Pay with ACH / check</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Photo of the check autofills routing &amp; account — review, confirm, then process. No card fee.
              </p>
          </div>
          <div className="mt-4 space-y-3">
              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1 block">
                  Check photo
                </label>
                <input
                  ref={checkInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  className="sr-only"
                  data-testid="pay-check-file"
                  onChange={onCheckFile}
                />
                <button
                  type="button"
                  className="w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700 font-semibold"
                  data-testid="pay-check-attach"
                  onClick={() => checkInputRef.current?.click()}
                  disabled={checkBusy || checkReadBusy}
                >
                  {checkReadBusy
                    ? "Reading check…"
                    : checkFile
                      ? `📎 ${checkFile.name}`
                      : "📷 Attach check photo"}
                </button>
                {checkReadDone ? (
                  <p className="text-[11px] text-emerald-700 mt-1.5 font-medium" data-testid="pay-check-read-ok">
                    ✓ Details filled from photo — review before submitting
                  </p>
                ) : null}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-1.5 flex gap-1" data-testid="pay-check-intent">
                <button
                  type="button"
                  className={`flex-1 rounded-lg px-2 py-2 text-xs font-bold ${
                    checkIntent === "record" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  }`}
                  data-testid="pay-check-intent-record"
                  disabled={checkBusy}
                  onClick={() => setCheckIntent("record")}
                >
                  Send for record
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-lg px-2 py-2 text-xs font-bold ${
                    checkIntent === "process" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-500"
                  }`}
                  data-testid="pay-check-intent-process"
                  disabled={checkBusy || !achEnabled}
                  onClick={() => setCheckIntent("process")}
                  title={!achEnabled ? "Instant deposit not available yet" : undefined}
                >
                  Process & deposit
                </button>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed -mt-1">
                {checkIntent === "process"
                  ? "Processes a bank debit from this check — you’ll confirm before it runs."
                  : "Sends the photo to our office to match and record — not an instant charge."}
              </p>
              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1 block">
                  Check number {checkIntent === "process" ? "" : "(optional)"}
                </label>
                <input
                  className="input"
                  placeholder="Check #"
                  value={checkNo}
                  onChange={(e) => setCheckNo(e.target.value)}
                  disabled={checkBusy}
                  data-testid="pay-check-number"
                />
              </div>
              {checkIntent === "process" ? (
                <>
                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1 block">
                      Name on account
                    </label>
                    <input
                      className="input"
                      value={checkName}
                      onChange={(e) => setCheckName(e.target.value)}
                      disabled={checkBusy}
                      data-testid="pay-check-name"
                      placeholder={data?.c || "Account holder"}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1 block">
                      Routing number
                    </label>
                    <input
                      className="input"
                      inputMode="numeric"
                      autoComplete="off"
                      value={checkRouting}
                      onChange={(e) => setCheckRouting(e.target.value.replace(/\D/g, "").slice(0, 9))}
                      disabled={checkBusy}
                      data-testid="pay-check-routing"
                      placeholder="9 digits"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1 block">
                      Account number
                    </label>
                    <input
                      className="input"
                      inputMode="numeric"
                      autoComplete="off"
                      value={checkAccount}
                      onChange={(e) => setCheckAccount(e.target.value.replace(/\D/g, "").slice(0, 17))}
                      disabled={checkBusy}
                      data-testid="pay-check-account"
                      placeholder="Account #"
                    />
                  </div>
                  <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 leading-relaxed">
                    Please review and confirm the checking account and routing number above before you pay.
                  </p>
                  <label className="flex items-start gap-2 cursor-pointer" data-testid="pay-check-auth">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={customerAuthOk}
                      disabled={checkBusy}
                      onChange={(e) => setCustomerAuthOk(e.target.checked)}
                    />
                    <span className="text-[11px] text-slate-700 leading-snug">{ACH_AUTH_LETTER.checkboxLabel}</span>
                  </label>
                </>
              ) : null}
              {checkErr ? (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  {checkErr}
                </p>
              ) : null}
              {checkIntent === "process" ? (
                <button
                  type="button"
                  className={`btn-brand w-full !py-3 ${checkBusy ? "opacity-70" : ""}`}
                  data-testid="pay-check-process"
                  disabled={
                    checkBusy || payBusy || checkReadBusy || !checkB64 || payAmount <= 0 || !customerAuthOk
                  }
                  onClick={requestProcessCheck}
                >
                  {checkBusy
                    ? "Processing…"
                    : `Process & deposit ${fmtMoneyPrecise(payAmount)}`}
                </button>
              ) : (
                <button
                  type="button"
                  className={`btn-ghost w-full !py-3 border border-slate-200 ${checkBusy ? "opacity-70" : ""}`}
                  data-testid="pay-check-submit"
                  disabled={checkBusy || payBusy || checkReadBusy || !checkB64 || payAmount <= 0}
                  onClick={submitCheckPayment}
                >
                  {checkBusy
                    ? "Submitting…"
                    : `Submit for record · ${fmtMoneyPrecise(payAmount)}`}
                </button>
              )}
              {checkProcessConfirm ? (
                <div
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 space-y-2"
                  data-testid="pay-check-process-confirm"
                >
                  <p className="text-sm text-slate-800 leading-snug">
                    Confirm: process bank payment of{" "}
                    <b className="tabular-nums">{fmtMoneyPrecise(payAmount)}</b>
                    {checkAccount ? (
                      <>
                        {" "}
                        from account ending <b>…{String(checkAccount).slice(-4)}</b>
                      </>
                    ) : null}
                    . This is payment processing — not office record only.
                  </p>
                  <button
                    type="button"
                    className="btn-brand w-full !py-2.5"
                    data-testid="pay-check-process-yes"
                    onClick={() => void processCheckPayment()}
                    disabled={checkBusy}
                  >
                    Yes — process payment
                  </button>
                  <button
                    type="button"
                    className="btn-ghost w-full !py-2 text-sm"
                    data-testid="pay-check-process-no"
                    onClick={() => setCheckProcessConfirm(false)}
                    disabled={checkBusy}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
        </div>
      </main>

      <footer className="text-center text-[11px] text-slate-500 pb-8 px-4">
        <a href={`https://${website}`} className="text-slate-500 hover:text-brand">
          {website}
        </a>
        <span className="mx-2">·</span>
        <Link to="/" className="text-slate-400">
          {productName(config)} (staff)
        </Link>
      </footer>
    </div>
  );
}