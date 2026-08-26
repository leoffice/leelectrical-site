import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { isPaid, nextAction, progressPct, stageOf } from "../lib/stages.js";
import {
  agingStripeColor,
  faceOpenBalance,
  invoiceAgeDays,
  openBalance,
} from "../lib/customers.js";
import { jobInvoiceDateDisplay } from "../lib/customerDocLists.js";
import { fmt$ } from "../lib/format.js";
import {
  isProgressDrawInvoice,
  progressPaidStatusLabel,
  totalPaid,
  normalizePayments,
} from "../lib/payments.js";
import AmountDisplay from "./AmountDisplay.jsx";

export function StagePill({ job }) {
  const cur = stageOf(job);
  const tone =
    {
      Lead: "bg-sky-100 text-sky-700",
      "Site Visit": "bg-sky-100 text-sky-700",
      Estimate: "bg-amber-100 text-amber-700",
      Accepted: "bg-amber-100 text-amber-700",
      Invoiced: "bg-violet-100 text-violet-700",
      "Deposit Receipt": "bg-violet-100 text-violet-700",
      Paperwork: "bg-slate-200 text-slate-700",
      Scheduled: "bg-brand-soft text-brand",
      Done: "bg-emerald-100 text-emerald-700",
      "Follow-up": "bg-orange-100 text-orange-700",
      Paid: "bg-emerald-100 text-emerald-700",
    }[cur] || "bg-slate-100 text-slate-600";
  return <span className={`pill ${tone}`}>{cur}</span>;
}

/**
 * Levi 2026-08-05: progress invoices (qty 0.5 / 50%) must not show solid Paid.
 * Settled draw → "deposit_paid" (Deposit / Progress paid in full). Still-open
 * draw with money applied → "partial". Only true progress draws — not every
 * invoice that once had estimate lines (that was painting full pays as partial).
 */
export function paymentStatusKind(job) {
  if (!job) return "unpaid";
  // Face due — provisional unpaid renews still show the fee (not rollup $0)
  const due = faceOpenBalance(job);
  const paidAmt = totalPaid(normalizePayments(job));
  const isProgressDraw = isProgressDrawInvoice(job);
  // Progress draw settled for this invoice → deposit/progress paid (not full contract).
  if (isProgressDraw) {
    if (due <= 0.01 && (paidAmt > 0.01 || job.paid)) return "deposit_paid";
    if (paidAmt > 0.01) return "partial";
    return "unpaid";
  }
  if (isPaid(job) || (job.paid && due <= 0.01) || (due <= 0.01 && paidAmt > 0.01)) {
    return "paid";
  }
  if (paidAmt > 0.01 && due > 0.01) return "partial";
  return "unpaid";
}

export function PaidPill({ job }) {
  const kind = paymentStatusKind(job);
  if (kind === "paid") {
    return <span className="pill bg-emerald-500 text-white">Paid ✓</span>;
  }
  if (kind === "deposit_paid") {
    return (
      <span
        className="pill bg-emerald-100 text-emerald-800 border border-emerald-200"
        data-testid="deposit-paid-pill"
      >
        {progressPaidStatusLabel(job, { short: true })}
      </span>
    );
  }
  if (kind === "partial") {
    return (
      <span className="pill bg-amber-100 text-amber-800 border border-amber-200" data-testid="partially-paid-pill">
        Partially paid
      </span>
    );
  }
  return <span className="pill bg-slate-100 text-slate-500">Unpaid</span>;
}

/** Customer initial badge — fixed square, never stretches with wrapped text. */
export function CustomerAvatar({ name, className = "" }) {
  return (
    <span
      className={`grid place-items-center w-7 h-7 rounded-lg bg-accent-soft text-accent font-semibold text-xs shrink-0 self-start lg:w-8 lg:h-8 lg:rounded-xl lg:text-sm ${className}`}
    >
      {(name || "").trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

/** One job inside an expanded customer group — short row, no progress bar.
 *  Open invoices get a vertical aging rail (older = darker red).
 *  openInvoiceOnly rows lead with Inv # + due (no estimates / payments).
 *  leadWithDoc: search hit for closed inv/est — lead with Inv # / Est # so tap is obvious. */
export function GroupJobRow({ job, openInvoiceOnly = false, to, leadWithDoc = false }) {
  const href = to || `/job/${encodeURIComponent(job.id)}`;
  const cur = stageOf(job);
  const due = openBalance(job);
  const isOpenInv = due > 0;
  if (openInvoiceOnly && !isOpenInv) return null;
  const age = isOpenInv ? invoiceAgeDays(job) : 0;
  const rail = isOpenInv ? agingStripeColor(age, due) : "transparent";
  const invLabel = job.invoiceNo ? `Inv #${job.invoiceNo}` : "";
  const estLabel = job.estimateNo ? `Est #${job.estimateNo}` : "";
  const title =
    (openInvoiceOnly || leadWithDoc) && invLabel
      ? invLabel
      : leadWithDoc && estLabel
        ? estLabel
        : job.title || "(untitled job)";
  const docBit =
    openInvoiceOnly || leadWithDoc
      ? null
      : invLabel
        ? invLabel
        : estLabel || "";
  // Show invoice date on glance rows when known (not "today" for old invoices).
  const invDate = jobInvoiceDateDisplay(job);
  const sub = openInvoiceOnly
    ? [
        invDate || null,
        job.title && job.title !== invLabel ? job.title : null,
        `${fmt$(due)} due`,
        age >= 30 ? `${age}d` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : [
        invDate || null,
        isOpenInv ? `${fmt$(due)} due` : null,
        isOpenInv && age >= 30
          ? `${age}d`
          : paymentStatusKind(job) === "paid"
            ? "Paid"
            : paymentStatusKind(job) === "deposit_paid"
              ? progressPaidStatusLabel(job, { short: true })
              : paymentStatusKind(job) === "partial"
                ? "Partially paid"
                : cur,
        docBit,
        leadWithDoc && job.title && job.title !== invLabel && job.title !== estLabel ? job.title : null,
      ]
        .filter(Boolean)
        .join(" · ");
  return (
    <Link
      to={href}
      className={`flex items-stretch gap-0 rounded-xl bg-white border border-slate-100 overflow-hidden active:bg-slate-50 relative ${
        job._fromEstimateGenerator || job._estimator?.kind === "service_upgrade" ? "ring-1 ring-emerald-200/80" : ""
      }`}
      data-testid="group-job-row"
      data-open-invoice={isOpenInv ? "1" : "0"}
      data-age-days={isOpenInv ? String(age) : undefined}
      data-invoice-no={job.invoiceNo ? String(job.invoiceNo) : undefined}
      data-estimate-no={job.estimateNo ? String(job.estimateNo) : undefined}
    >
      <span
        className="w-1.5 shrink-0 self-stretch"
        style={{ backgroundColor: rail }}
        data-testid="invoice-aging-rail"
        aria-hidden
      />
      <div className="flex items-center gap-2 min-w-0 flex-1 px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-900 truncate">{title}</div>
          <div className="text-[10px] text-slate-500 truncate mt-0.5">{sub}</div>
        </div>
        <AmountDisplay job={job} size="sm" showSub={false} />
      </div>
    </Link>
  );
}

export default function JobCard({ job, compact, stackN, onQuickSend, onMarkPaid }) {
  const pct = progressPct(job);
  const nav = useNavigate();
  const href = `/job/${encodeURIComponent(job.id)}`;
  return (
    <Link to={href} className="block card px-3 py-2.5 lg:px-4 lg:py-3.5 active:scale-[0.99] transition-transform relative">
      {job._fromEstimateGenerator || job._estimator?.kind ? (
        <span
          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-300/80 via-emerald-400/70 to-emerald-300/50 rounded-t-[inherit]"
          data-testid="job-estimator-stripe"
          title="Created with estimate generator"
        />
      ) : null}
      {stackN ? (
        <span className="absolute -top-2 right-3 pill bg-accent text-white shadow">{stackN} jobs</span>
      ) : null}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {!compact && (
            <div className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2 break-words lg:text-base lg:font-bold">
              {job.customer || "(no customer)"}
            </div>
          )}
          <div
            className={`leading-snug line-clamp-2 break-words ${
              compact ? "text-xs font-medium text-slate-900" : "text-xs text-slate-500 lg:text-sm"
            }`}
          >
            {job.title || "(untitled job)"}
          </div>
        </div>
        <AmountDisplay job={job} size={compact ? "sm" : "md"} />
      </div>
      <div className="mt-2.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
        <StagePill job={job} />
        <PaidPill job={job} />
        <span className="text-xs text-slate-500 truncate ml-auto max-w-[55%]">{nextAction(job)}</span>
      </div>
      {(onQuickSend || onMarkPaid) && (
        <div
          className="mt-2.5 hidden lg:flex gap-1.5"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {job.phone && (
            <a href={`tel:${job.phone}`} className="flex-1 text-center text-xs font-bold text-brand bg-brand-soft rounded-lg py-1.5">
              📞 Call
            </a>
          )}
          {job.invoiceNo && !job.paid && onQuickSend && (
            <button className="flex-1 text-xs font-bold text-brand bg-brand-soft rounded-lg py-1.5" onClick={() => onQuickSend(job)}>
              📤 Invoice
            </button>
          )}
          {!job.paid && onMarkPaid && (
            <button className="flex-1 text-xs font-bold text-brand bg-brand-soft rounded-lg py-1.5" onClick={() => onMarkPaid(job)}>
              💵 Paid?
            </button>
          )}
          <button className="flex-1 text-xs font-bold text-slate-500 bg-slate-100 rounded-lg py-1.5" onClick={() => nav(href)}>
            Open ›
          </button>
        </div>
      )}
    </Link>
  );
}
