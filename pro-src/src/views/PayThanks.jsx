// Customer thank-you / declined page after Sola Cardknox redirect.
import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fmtMoneyPrecise } from "../lib/payFees.js";
import { fmtBalanceNow, parsePayThanksParams } from "../lib/payThanks.js";

const LOGO = import.meta.env.BASE_URL + "le-logo.png?v=5";

export default function PayThanks() {
  const [params] = useSearchParams();
  const { ok, inv, amt, bal, msg } = parsePayThanksParams(params);
  const balanceLabel = fmtBalanceNow(bal);

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      <header className="bg-white border-b border-slate-200 px-4 py-6 pt-safe shadow-sm">
        <div
          className="max-w-lg mx-auto flex flex-col items-center justify-center text-center gap-3 py-2"
          data-testid="pay-thanks-header"
        >
          <img
            src={LOGO}
            alt="BLZ Electric"
            className="h-36 sm:h-40 w-auto max-w-[min(100%,380px)] object-contain mx-auto"
            data-testid="pay-thanks-logo"
          />
          <div className="w-full">
            <div className="font-extrabold text-xl tracking-tight text-slate-900">BLZ Electric</div>
            <div className="text-slate-500 text-sm">Brooklyn, NY · Licensed &amp; insured</div>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-10">
        <div className="card p-6 text-center">
          <div className="text-5xl mb-4">{ok ? "✓" : "✕"}</div>
          <h1 className="text-xl font-extrabold text-[#0f172a] mb-4">
            {ok ? "Payment received" : "Payment not completed"}
          </h1>
          {ok ? (
            <>
              <div
                className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-4 mb-4 text-left space-y-2.5"
                data-testid="pay-receipt"
              >
                {inv ? (
                  <div className="flex justify-between items-baseline gap-3 text-sm">
                    <span className="text-slate-500">Invoice</span>
                    <span className="font-semibold text-slate-900 tabular-nums">#{inv}</span>
                  </div>
                ) : null}
                {amt ? (
                  <div className="flex justify-between items-baseline gap-3 text-sm">
                    <span className="text-slate-500">Amount paid</span>
                    <span className="font-bold text-brand text-base tabular-nums">
                      {fmtMoneyPrecise(amt)}
                    </span>
                  </div>
                ) : null}
                {balanceLabel ? (
                  <div className="flex justify-between items-baseline gap-3 text-sm pt-2.5 border-t border-slate-200">
                    <span className="text-slate-700 font-semibold">Balance now</span>
                    <span
                      className={`font-extrabold text-base tabular-nums ${
                        bal != null && bal <= 0.01 ? "text-emerald-700" : "text-slate-900"
                      }`}
                      data-testid="balance-now"
                    >
                      {balanceLabel}
                    </span>
                  </div>
                ) : null}
              </div>
              <p className="text-sm text-[#64748b] leading-relaxed">
                Thank you. Your payment is being applied to your invoice and will appear in our
                records shortly.
              </p>
            </>
          ) : (
            <p className="text-sm text-[#64748b] leading-relaxed">
              {msg || "The card was not charged. You can return to your payment link and try again."}
            </p>
          )}
        </div>
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