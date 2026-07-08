// Customer thank-you / declined page after Sola Cardknox redirect.
import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fmtMoneyPrecise } from "../lib/payFees.js";

const LOGO = import.meta.env.BASE_URL + "le-logo.png?v=5";

export default function PayThanks() {
  const [params] = useSearchParams();
  const ok = params.get("ok") === "1";
  const inv = params.get("inv") || "";
  const amt = params.get("amt") || "";
  const msg = params.get("msg") || "";

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      <header className="bg-white border-b border-slate-200 px-4 py-5 pt-safe shadow-sm">
        <div className="max-w-lg mx-auto flex flex-col items-center gap-2">
          <img
            src={LOGO}
            alt="BLZ Electric"
            className="h-36 w-auto max-w-[360px] object-contain"
          />
          <div className="min-w-0">
            <div className="font-extrabold text-lg tracking-tight leading-tight text-slate-900">BLZ Electric</div>
            <div className="text-slate-500 text-sm">Brooklyn, NY · Licensed &amp; insured</div>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-10">
        <div className="card p-6 text-center">
          <div className="text-5xl mb-4">{ok ? "✓" : "✕"}</div>
          <h1 className="text-xl font-extrabold text-[#0f172a] mb-2">
            {ok ? "Payment received" : "Payment not completed"}
          </h1>
          {ok ? (
            <>
              {inv ? (
                <p className="text-sm text-[#64748b] mb-1">
                  Invoice <span className="font-bold text-[#0f172a]">#{inv}</span>
                </p>
              ) : null}
              {amt ? (
                <p className="text-lg font-bold text-brand mb-3">{fmtMoneyPrecise(amt)}</p>
              ) : null}
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