// Public View & Pay page — BLZ Electric branding, invoice PDF, amount + fee,
// then Pay → Sola PaymentSITE with billing fields pre-filled.
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { decodePayLanding, invoicePdfUrl } from "../lib/payLanding.js";
import {
  fmtMoneyPrecise,
  parseMoney,
  processingFee,
  totalWithFee,
} from "../lib/payFees.js";
import { solaPayUrlFromLanding } from "../lib/solaPayUrl.js";

const LOGO = import.meta.env.BASE_URL + "blz-logo.png";

function Row({ label, value, bold, children }) {
  if (children) {
    return (
      <div className="flex justify-between items-center gap-4 py-2 border-b border-slate-100 last:border-0">
        <span className="text-slate-500 text-sm shrink-0">{label}</span>
        <div className="text-sm text-right min-w-0">{children}</div>
      </div>
    );
  }
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
      <span className="text-slate-500 text-sm">{label}</span>
      <span className={`text-sm text-right ${bold ? "font-bold text-slate-900 text-base" : "text-slate-800"}`}>
        {value}
      </span>
    </div>
  );
}

function usePayToken() {
  const { token: pathToken } = useParams();
  const [search] = useSearchParams();
  return (pathToken || search.get("t") || "").trim();
}

export default function PayLanding() {
  const token = usePayToken();
  const data = useMemo(() => decodePayLanding(token), [token]);
  const [payAmount, setPayAmount] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pdfOk, setPdfOk] = useState(null); // null=checking true/false

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
    fetch(pdfSrc, { method: "HEAD" })
      .then((r) => {
        if (alive) setPdfOk(r.ok);
      })
      .catch(() => {
        if (alive) setPdfOk(false);
      });
    return () => {
      alive = false;
    };
  }, [pdfSrc]);

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

  const fee = processingFee(payAmount);
  const chargeTotal = totalWithFee(payAmount);
  const payUrl = solaPayUrlFromLanding(data, chargeTotal);
  const asOf = data.as || "today";

  const saveAmount = () => {
    const n = parseMoney(draft);
    if (n > 0) {
      setPayAmount(n);
      setEditing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="bg-gradient-to-r from-[#1a365d] to-[#2c5282] text-white px-4 py-5 pt-safe shadow-md">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <img
            src={LOGO}
            alt="BLZ Electric"
            className="h-14 w-auto max-w-[120px] object-contain shrink-0 bg-white/95 rounded-xl p-1.5"
          />
          <div>
            <div className="font-extrabold text-lg tracking-tight leading-tight">BLZ Electric</div>
            <div className="text-white/80 text-sm">Brooklyn, NY · Licensed &amp; insured</div>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-10">
        <div className="card overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand mb-0.5">Invoice</p>
              <h1 className="text-xl font-extrabold text-slate-900">#{data.i}</h1>
            </div>
            {data.c && <p className="text-slate-600 text-sm text-right max-w-[50%] truncate">{data.c}</p>}
          </div>
          {pdfOk === true ? (
            <iframe
              title={`Invoice ${data.i}`}
              src={pdfSrc}
              className="w-full h-[min(70vh,520px)] bg-slate-100"
              data-testid="invoice-pdf"
            />
          ) : (
            <div className="px-4 py-8 text-center text-sm text-slate-500" data-testid="invoice-pdf-missing">
              {pdfOk === null ? "Loading invoice PDF…" : "Invoice PDF is not available yet. Amounts below are current."}
            </div>
          )}
        </div>

        {data.w && <p className="text-slate-500 text-sm mb-4 px-1">{data.w}</p>}

        <div className="card p-5 mb-4">
          <h2 className="font-bold text-slate-900 mb-2">Amount summary</h2>
          <p className="text-[11px] text-slate-400 mb-3">Figures as of {asOf}</p>
          <Row label="Invoice total" value={data.t} />
          <Row label="Paid to date" value={data.p} />
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
                <span className="grid place-items-center w-8 h-8 rounded-full bg-brand-soft text-brand text-sm group-active:scale-95">
                  ✏️
                </span>
              </button>
            )}
          </Row>
          <Row label="Processing fee (3.5%)" value={fmtMoneyPrecise(fee)} />
          <Row label="Total charge" value={fmtMoneyPrecise(chargeTotal)} bold />
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4 text-sm text-amber-900">
          <b>Change the amount here</b> — tap <b>Paying today</b> or ✏️ above. The card page amount is fixed once
          you tap Pay (includes the 3.5% fee → <b>{fmtMoneyPrecise(chargeTotal)}</b> total).
        </div>

        <p className="text-[11px] text-slate-500 mb-4 px-1 leading-relaxed">
          Processing fee: {fmtMoneyPrecise(fee)} (3.5% on {fmtMoneyPrecise(payAmount)}). Total charge:{" "}
          <b>{fmtMoneyPrecise(chargeTotal)}</b>.
        </p>

        <a
          href={payUrl || "#"}
          className={`btn-brand w-full !py-4 text-base shadow-lg mb-3 ${
            payUrl ? "shadow-brand/20" : "opacity-50 pointer-events-none"
          }`}
          data-testid="pay-cta"
        >
          Pay {fmtMoneyPrecise(chargeTotal)}
        </a>
        <p className="text-center text-[11px] text-slate-400 px-2">
          Next page: enter card only — name, address, and amount are already set.
        </p>
      </main>

      <footer className="text-center text-[11px] text-slate-400 pb-8 px-4">
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