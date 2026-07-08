// Public View & Pay page — no LE Pro login. Customer sees invoice summary,
// payment history, and a CTA to the Sola PaymentSITE hosted form.
import React from "react";
import { Link, useParams } from "react-router-dom";
import { decodePayLanding } from "../lib/payLanding.js";
import { fmt$ } from "../lib/format.js";

function Row({ label, value, bold }) {
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

export default function PayLanding() {
  const { token } = useParams();
  const data = decodePayLanding(token);

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="card max-w-md w-full p-6 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-lg font-bold text-slate-900 mb-2">Link not valid</h1>
          <p className="text-sm text-slate-500 mb-4">
            This payment link may be incomplete or expired. Contact LE Electric for a fresh link.
          </p>
          <a href="https://leelectrical.us" className="text-brand font-semibold text-sm">
            leelectrical.us
          </a>
        </div>
      </div>
    );
  }

  const linkAmt = fmt$(data.a) || String(data.a);
  const asOf = data.as || "today";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="bg-gradient-to-r from-brand to-accent text-white px-4 py-6 pt-safe">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <span className="grid place-items-center w-12 h-12 rounded-2xl bg-white/15 text-2xl shrink-0">⚡</span>
          <div>
            <div className="font-extrabold text-lg tracking-tight leading-tight">LE Electric</div>
            <div className="text-white/80 text-sm">Brooklyn, NY · Licensed &amp; insured</div>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-10">
        <div className="card p-5 mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand mb-1">Invoice</p>
          <h1 className="text-2xl font-extrabold text-slate-900 mb-1">#{data.i}</h1>
          {data.c && <p className="text-slate-600 text-sm mb-1">{data.c}</p>}
          {data.w && <p className="text-slate-500 text-sm">{data.w}</p>}
        </div>

        <div className="card p-5 mb-4">
          <h2 className="font-bold text-slate-900 mb-2">Amount summary</h2>
          <p className="text-[11px] text-slate-400 mb-3">Figures as of {asOf}</p>
          <Row label="Invoice total" value={data.t} />
          <Row label="Paid to date" value={data.p} />
          <Row label="Balance due" value={data.d} bold />
          <Row label="Amount on this link" value={linkAmt} bold />
        </div>

        <div className="card p-5 mb-6">
          <h2 className="font-bold text-slate-900 mb-2">Payment history</h2>
          {data.p ? (
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-emerald-700">{data.p}</span> recorded toward this invoice
              {data.d ? ` · ${data.d} remaining` : ""}.
            </p>
          ) : (
            <p className="text-sm text-slate-500">No prior payments recorded for this invoice.</p>
          )}
          <p className="text-[11px] text-slate-400 mt-3">
            Online payments may take a moment to appear. Contact us if you recently paid and still see a balance.
          </p>
        </div>

        <a
          href={data.pay}
          className="btn-brand w-full !py-4 text-base shadow-lg shadow-brand/20 mb-3"
          data-testid="pay-cta"
        >
          View &amp; Pay {linkAmt}
        </a>
        <p className="text-center text-[11px] text-slate-400 px-2">
          Secure card payment via Sola. You can adjust the amount on the payment page if needed.
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