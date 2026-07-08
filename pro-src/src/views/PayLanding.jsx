// Public View & Pay — Sleek theme, invoice details, View invoice PDF, Pay → Sola.
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { decodePayLanding, invoicePdfUrl } from "../lib/payLanding.js";
import { invoicePdfAvailable, waitForInvoicePdf } from "../lib/payInvoicePdf.js";
import {
  fmtMoneyPrecise,
  parseMoney,
  processingFee,
  totalWithFee,
} from "../lib/payFees.js";
import { solaPayUrlFromLanding } from "../lib/solaPayUrl.js";

const LOGO = import.meta.env.BASE_URL + "le-logo.png?v=2";

function Row({ label, value, bold, children }) {
  if (children) {
    return (
      <div className="flex justify-between items-center gap-4 py-2.5 border-b border-[#e5e9f2] last:border-0">
        <span className="text-[#64748b] text-sm shrink-0">{label}</span>
        <div className="text-sm text-right min-w-0">{children}</div>
      </div>
    );
  }
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b border-[#e5e9f2] last:border-0">
      <span className="text-[#64748b] text-sm">{label}</span>
      <span
        className={`text-sm text-right ${bold ? "font-bold text-[#0f172a] text-base" : "text-[#0f172a]"}`}
      >
        {value}
      </span>
    </div>
  );
}

function InfoLine({ label, value }) {
  if (!value) return null;
  return (
    <div className="py-2 border-b border-[#e5e9f2] last:border-0">
      <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#64748b]">{label}</div>
      <div className="text-sm text-[#0f172a] mt-0.5 leading-snug">{value}</div>
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
  const [pdfReady, setPdfReady] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState("");

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

  if (!data) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] flex items-center justify-center p-6">
        <div className="card max-w-md w-full p-6 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-lg font-bold text-[#0f172a] mb-2">Link not valid</h1>
          <p className="text-sm text-[#64748b] mb-4">
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
  const billDiffers =
    data.ba &&
    data.sa &&
    data.ba.trim().toLowerCase() !== data.sa.trim().toLowerCase();

  const saveAmount = () => {
    const n = parseMoney(draft);
    if (n > 0) {
      setPayAmount(n);
      setEditing(false);
    }
  };

  const launchPdf = (url) => {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const openInvoicePdf = async (e) => {
    e?.preventDefault?.();
    if (!pdfSrc) return;
    setPdfErr("");
    if (await invoicePdfAvailable(pdfSrc)) {
      setPdfReady(true);
      launchPdf(pdfSrc);
      return;
    }
    setPdfBusy(true);
    const ok = await waitForInvoicePdf(pdfSrc);
    setPdfBusy(false);
    if (ok) {
      setPdfReady(true);
      launchPdf(pdfSrc);
    } else {
      setPdfErr("Invoice PDF is still loading from QuickBooks — try again in a minute.");
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      <header className="bg-gradient-to-r from-brand to-accent text-white px-4 py-4 pt-safe shadow-sm">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <img
            src={LOGO}
            alt="BLZ Electric"
            className="h-14 w-auto max-w-[130px] object-contain shrink-0 drop-shadow-sm"
          />
          <div className="min-w-0">
            <div className="font-extrabold text-lg tracking-tight leading-tight">BLZ Electric</div>
            <div className="text-white/80 text-sm">Brooklyn, NY · Licensed &amp; insured</div>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-10">
        <div className="card p-5 mb-4">
          <div className="flex items-center justify-between gap-3 mb-1">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-brand">Invoice</p>
            <a
              href={pdfReady ? pdfSrc : pdfSrc || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-sm font-bold rounded-xl px-3.5 py-2 shrink-0 ${
                pdfBusy
                  ? "bg-brand-soft text-brand pointer-events-none opacity-70"
                  : "bg-brand-soft text-brand hover:bg-white/90"
              }`}
              data-testid="view-invoice"
              onClick={openInvoicePdf}
            >
              {pdfBusy ? "Loading…" : "View invoice"}
            </a>
          </div>
          <h1 className="text-2xl font-extrabold text-[#0f172a] mb-3">#{data.i}</h1>

          {data.c ? (
            <p className="text-base font-bold text-[#0f172a] mb-3 pb-3 border-b border-[#e5e9f2]">{data.c}</p>
          ) : null}

          <div className="text-sm">
            <InfoLine label="Service address" value={data.sa} />
            {billDiffers ? <InfoLine label="Billing address" value={data.ba} /> : null}
            {!data.sa && data.ba ? <InfoLine label="Address" value={data.ba} /> : null}
            <InfoLine label="Work" value={data.w} />
          </div>

          {pdfErr ? (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-3">
              {pdfErr}
            </p>
          ) : null}
          {!pdfReady && !pdfBusy && !pdfErr ? (
            <p className="text-[11px] text-[#64748b] mt-3">
              Tap <b>View invoice</b> to open the PDF (may take a moment the first time).
            </p>
          ) : null}
        </div>

        <div className="card p-5 mb-4">
          <h2 className="font-bold text-[#0f172a] mb-2">Amount summary</h2>
          <p className="text-[11px] text-[#64748b] mb-3">Figures as of {asOf}</p>
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
                <span className="font-bold text-[#0f172a] text-base">{fmtMoneyPrecise(payAmount)}</span>
                <span className="grid place-items-center w-8 h-8 rounded-full bg-brand-soft text-brand text-sm">
                  ✏️
                </span>
              </button>
            )}
          </Row>
          <Row label="Processing fee (3.5%)" value={fmtMoneyPrecise(fee)} />
          <Row label="Total charge" value={fmtMoneyPrecise(chargeTotal)} bold />
        </div>

        <p className="text-[11px] text-[#64748b] mb-4 px-1 leading-relaxed">
          Tap ✏️ to change the amount before Pay. Fee is 3.5% on top → <b>{fmtMoneyPrecise(chargeTotal)}</b> total.
        </p>

        <a
          href={payUrl || "#"}
          className={`btn-brand w-full !py-4 text-base shadow-md mb-2 ${
            payUrl ? "" : "opacity-50 pointer-events-none"
          }`}
          data-testid="pay-cta"
        >
          Pay {fmtMoneyPrecise(chargeTotal)}
        </a>
        <p className="text-center text-[11px] text-[#64748b] px-2 mb-1">
          Card or bank (ACH) on the next page if enabled on your account.
        </p>
      </main>

      <footer className="text-center text-[11px] text-[#64748b] pb-8 px-4">
        <a href="https://leelectrical.us" className="text-[#64748b] hover:text-brand">
          leelectrical.us
        </a>
        <span className="mx-2">·</span>
        <Link to="/" className="text-[#94a3b8]">
          LE Pro (staff)
        </Link>
      </footer>
    </div>
  );
}