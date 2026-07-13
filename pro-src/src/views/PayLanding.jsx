// Public View & Pay — invoice details, View invoice PDF, in-page card payment.
import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import SolaCardForm, { tokenizeSolaCard } from "../components/SolaCardForm.jsx";
import { addressesDiffer, invoicePdfUrl, resolvePayLandingToken } from "../lib/payLanding.js";
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
import { chargeCardFromLanding } from "../lib/solaCharge.js";

const LOGO = import.meta.env.BASE_URL + "le-logo.png?v=5";

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
        <h2 className="text-lg font-extrabold text-slate-900 mb-1">Retrieving your invoice</h2>
        <p className="text-sm text-slate-500 mb-4">
          Pulling invoice #{invoiceNo} from QuickBooks. This usually takes under a minute.
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
  const [cardReady, setCardReady] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState("");

  const includeFee = feeEnabledInPayload(data);

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
  }, [data?.a]);

  const pdfSrc = data?.i ? invoicePdfUrl(data.i) : "";

  useEffect(() => {
    if (!pdfSrc) return;
    let alive = true;
    invoicePdfAvailable(pdfSrc).then((ok) => {
      if (alive) setPdfReady(ok);
    });
    return () => {
      alive = false;
    };
  }, [pdfSrc]);

  if (resolving) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="card max-w-md w-full p-6 text-center">
          <p className="text-sm text-slate-500">Loading your invoice…</p>
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
            This payment link may be incomplete or expired. Contact BLZ Electric for a fresh link.
          </p>
          <a href="https://leelectrical.us" className="text-brand font-semibold text-sm">
            leelectrical.us
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

  const openInvoicePdf = async (e) => {
    e?.preventDefault?.();
    if (!pdfSrc || !data?.i) return;
    setPdfErr("");
    setPdfBusy(true);
    setPdfPhase("checking");
    const ok = await retrieveInvoicePdf({
      url: pdfSrc,
      invoiceNo: data.i,
      jobId: data.j || "",
      onPhase: setPdfPhase,
    });
    setPdfBusy(false);
    setPdfPhase("idle");
    if (ok) {
      setPdfReady(true);
      openPdfUrl(pdfSrc);
    } else {
      setPdfErr(
        "We couldn't load the invoice PDF yet. Make sure our office computer is online, then tap View invoice again."
      );
    }
  };

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
            src={LOGO}
            alt="BLZ Electric"
            className="h-36 sm:h-40 w-auto max-w-[min(100%,380px)] object-contain"
            data-testid="pay-logo"
          />
          <div>
            <div className="font-extrabold text-xl tracking-tight text-slate-900">BLZ Electric</div>
            <div className="text-slate-500 text-sm">Brooklyn, NY · Licensed &amp; insured</div>
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
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                Work
              </div>
              <div className="text-slate-900 leading-snug">{data.w}</div>
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

        <div className="card p-5 mb-4">
          <h2 className="font-bold text-slate-900 mb-1">Pay by card</h2>
          <p className="text-[11px] text-slate-500 mb-4">
            Secure payment — your card details stay on our encrypted form, not a third-party page.
          </p>
          <SolaCardForm disabled={payBusy} onReadyChange={setCardReady} />
          {payErr ? (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-3">
              {payErr}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          className={`btn-brand w-full !py-4 text-base shadow-md mb-2 ${
            payBusy || !cardReady ? "opacity-70" : ""
          }`}
          data-testid="pay-cta"
          disabled={payBusy || !cardReady || payAmount <= 0}
          onClick={submitPayment}
        >
          {payBusy ? "Processing…" : `Pay ${fmtMoneyPrecise(includeFee ? chargeTotal : payAmount)}`}
        </button>
        <p className="text-center text-[11px] text-slate-500 px-2 mb-1">
          You&apos;ll get a confirmation on this page right after payment.
        </p>
      </main>

      <footer className="text-center text-[11px] text-slate-500 pb-8 px-4">
        <a href="https://leelectrical.us" className="text-slate-500 hover:text-brand">
          leelectrical.us
        </a>
        <span className="mx-2">·</span>
        <Link to="/" className="text-slate-400">
          LE Pro (staff)
        </Link>
      </footer>
    </div>
  );
}