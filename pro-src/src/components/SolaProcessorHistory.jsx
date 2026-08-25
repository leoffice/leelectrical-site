import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchSolaTransactions,
  summarizeSolaVerify,
  verifySolaTransactions,
} from "../lib/solaVerify.js";
import { fmtMoneyPrecise } from "../lib/payFees.js";

const MATCH_PILL = {
  matched: { text: "Matched", cls: "bg-emerald-100 text-emerald-800" },
  missing_in_app: { text: "In Sola only", cls: "bg-amber-100 text-amber-900" },
  amount_mismatch: { text: "Amount mismatch", cls: "bg-rose-100 text-rose-800" },
  declined: { text: "Declined", cls: "bg-slate-200 text-slate-600" },
  voided: { text: "Voided", cls: "bg-slate-200 text-slate-600" },
  other: { text: "Other", cls: "bg-slate-100 text-slate-600" },
};

function money(n) {
  const s = fmtMoneyPrecise(n);
  return s || "$0";
}

export default function SolaProcessorHistory({ jobs }) {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [payload, setPayload] = useState(null);
  const [tab, setTab] = useState("transactions"); // transactions | batches

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await fetchSolaTransactions();
      setPayload(data);
    } catch (e) {
      setErr(String(e?.message || e || "Could not load Sola"));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const verified = useMemo(
    () => verifySolaTransactions(payload?.transactions || [], jobs),
    [payload, jobs]
  );
  const summary = useMemo(() => summarizeSolaVerify(verified), [verified]);
  const batches = payload?.batches || [];

  return (
    <div
      className="card px-3 py-2.5 space-y-2"
      data-testid="sola-processor-history"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
            Payment Processor · SOLA
          </p>
          <p className="text-[10px] text-slate-400 leading-snug mt-0.5">
            Live from the Sola portal — batches, approvals, and match vs payments in LE Pro.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600"
          data-testid="sola-processor-refresh"
          onClick={load}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {err ? (
        <p
          className="rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-semibold px-2 py-1.5"
          data-testid="sola-processor-error"
        >
          {err}
        </p>
      ) : null}

      {!err && !loading && payload ? (
        <div className="flex flex-wrap gap-1.5" data-testid="sola-processor-summary">
          <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
            Matched {summary.matched}
          </span>
          <span className="rounded-full bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 text-[10px] font-bold">
            Sola only {summary.missing_in_app}
          </span>
          <span className="rounded-full bg-rose-50 text-rose-800 border border-rose-200 px-2 py-0.5 text-[10px] font-bold">
            Mismatch {summary.amount_mismatch}
          </span>
          <span className="rounded-full bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 text-[10px] font-bold">
            Declined {summary.declined}
          </span>
          <span className="rounded-full bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 text-[10px] font-bold">
            Batches {batches.length}
          </span>
        </div>
      ) : null}

      <div className="flex gap-1.5">
        <button
          type="button"
          className={
            "rounded-lg border px-2 py-1 text-[10px] font-bold " +
            (tab === "transactions"
              ? "bg-brand-soft text-brand border-brand/30"
              : "bg-slate-50 text-slate-500 border-slate-200")
          }
          data-testid="sola-tab-transactions"
          onClick={() => setTab("transactions")}
        >
          Transactions
        </button>
        <button
          type="button"
          className={
            "rounded-lg border px-2 py-1 text-[10px] font-bold " +
            (tab === "batches"
              ? "bg-brand-soft text-brand border-brand/30"
              : "bg-slate-50 text-slate-500 border-slate-200")
          }
          data-testid="sola-tab-batches"
          onClick={() => setTab("batches")}
        >
          Batches
        </button>
      </div>

      {loading && !payload ? (
        <p className="text-[11px] text-slate-400 font-semibold py-2">Pulling Sola…</p>
      ) : null}

      {tab === "batches" ? (
        <div className="space-y-1.5" data-testid="sola-batch-list">
          {!batches.length && !loading ? (
            <p className="text-[11px] text-slate-400 font-semibold">No batches in this window.</p>
          ) : null}
          {batches.map((b) => (
            <div
              key={b.batch}
              className="rounded-xl border border-slate-100 bg-white px-2.5 py-2 flex items-center justify-between gap-2"
              data-testid={"sola-batch-" + b.batch}
            >
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-slate-800 truncate">
                  Batch {b.batch}
                </p>
                <p className="text-[10px] text-slate-500 font-semibold">
                  {[b.date, b.time].filter(Boolean).join(" · ")} · {b.totalCount || 0} txn
                </p>
              </div>
              <p className="text-[13px] font-extrabold tabular-nums text-slate-900 shrink-0">
                {money(b.totalAmount || b.netTotalAmount)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5" data-testid="sola-txn-list">
          {!verified.length && !loading ? (
            <p className="text-[11px] text-slate-400 font-semibold">
              No Sola transactions in this window.
            </p>
          ) : null}
          {verified.map((t) => {
            const pill = MATCH_PILL[t.match] || MATCH_PILL.other;
            const jobId = t.appPayments?.[0]?.jobId || t.jobId || "";
            return (
              <button
                key={t.ref}
                type="button"
                className="w-full text-left rounded-xl border border-slate-100 bg-white px-2.5 py-2 space-y-1 hover:border-slate-200"
                data-testid={"sola-txn-" + t.ref}
                data-match={t.match}
                onClick={() => {
                  if (jobId) nav("/job/" + jobId + "?fold=1&focus=job&payhist=1");
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-slate-800 truncate">
                      {t.name || "Card payment"}
                    </p>
                    <p className="text-[10px] text-slate-500 font-semibold truncate">
                      {t.enteredAt || "—"}
                      {t.maskedCard ? ` · ${t.maskedCard}` : ""}
                      {t.ref ? ` · #${t.ref}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[13px] font-extrabold tabular-nums text-slate-900">
                      {money(t.principalAmount || t.chargeAmount)}
                    </p>
                    {t.chargeAmount && t.principalAmount && t.chargeAmount !== t.principalAmount ? (
                      <p className="text-[9px] text-slate-400 font-semibold tabular-nums">
                        charged {money(t.chargeAmount)}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={
                      "inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-bold " + pill.cls
                    }
                  >
                    {pill.text}
                  </span>
                  {t.appPayments?.[0]?.invoiceNo ? (
                    <span className="text-[9px] font-bold text-slate-500">
                      Inv {t.appPayments[0].invoiceNo}
                    </span>
                  ) : t.jobId ? (
                    <span className="text-[9px] font-bold text-slate-400">Job linked</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
