// Per-job summary — awareness bubbles under title, then service address + doc tabs.
import React, { useMemo } from "react";
import AmountDisplay from "./AmountDisplay.jsx";
import { amountPaid, invoiceTotal, isJobFullyPaid, openBalance, paidPct } from "../lib/customers.js";
import { serviceAddressDisplay } from "../lib/customerSync.js";
import { jobInvoiceDateDisplay, jobServiceDateDisplay } from "../lib/customerDocLists.js";
import { fmt$, parseAmount } from "../lib/format.js";
import { bubbleStyle, jobAwarenessBubbles } from "../lib/jobAwareness.js";
import JobDocTabs from "./JobDocTabs.jsx";
import SasRecordingLink from "./SasRecordingLink.jsx";
import Toggle from "./Toggle.jsx";


const BUBBLE_LAYOUT =
  "inline-flex items-center gap-1 rounded-2xl border px-2 py-1 text-[10px] leading-tight lg:rounded-full lg:px-2.5 lg:py-1 lg:text-xs";
const HEADER_BTN =
  "text-[10px] font-semibold text-slate-500 hover:text-brand px-1.5 py-0.5 rounded border border-slate-200 bg-white shrink-0";
/** Visually separate destructive-ish CO action from Est/Inv so misclicks are rarer. */
const HEADER_BTN_CO =
  "text-[10px] font-semibold text-amber-800 hover:text-amber-900 px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 shrink-0 ml-1";

function stopBubble(e) {
  e.stopPropagation();
}

function AwarenessBubble({ bubble, onClick }) {
  const pillClass = bubbleStyle(bubble.tone);
  const inner = (
    <>
      <span className="font-extrabold uppercase tracking-wide shrink-0 opacity-90">{bubble.branchLabel}</span>
      <span className="font-bold uppercase tracking-wide shrink-0 opacity-60">{bubble.timing}</span>
      <span className="font-semibold truncate min-w-0 opacity-90">{bubble.upNext}</span>
    </>
  );
  if (!onClick) {
    return (
      <div className={`${BUBBLE_LAYOUT} ${pillClass} max-w-full`} data-testid={"awareness-pill-" + bubble.key}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`${BUBBLE_LAYOUT} active:opacity-80 ${pillClass} max-w-full`}
      data-testid={"awareness-pill-" + bubble.key}
      onClick={(e) => {
        stopBubble(e);
        onClick(bubble);
      }}
    >
      {inner}
    </button>
  );
}

export default function JobInfoCard({
  job,
  events,
  commands,
  sasCalls,
  onOpen,
  onEstimate,
  onInvoice,
  onPayment,
  onCalendar,
  onChangeOrders,
  changeOrdersActive = false,
  onStatement,
  jobs,
  onBubbleTap,
  showOpenLink = false,
  onCardTap,
  onEditJob,
  onAddJob,
  onAddChangeOrder,
  canAddChangeOrder = true,
  onAddAttachment,
  /** Job-only transaction history (this invoice), not customer-wide. */
  jobTxns = false,
  onJobTxnsChange,
  /** Paperwork / permit tracker enable — same style as Transaction history, above it (Levi 2026-08-05). */
  paperworkOn = false,
  onPaperworkChange,
  /** Open Con Edison / DOB expand panel (peer tabs when paperwork on). */
  onConed,
  onDob,
  paperTrackOpen = null,
  /** When opened from History, soft-highlight this invoice # (Levi 2026-08-04). */
  highlightInvoiceNo = "",
}) {
  const total = invoiceTotal(job);
  const paid = amountPaid(job);
  const balance = openBalance(job);
  const pct = paidPct(job);
  const svc = serviceAddressDisplay(job);
  const serviceDate = jobServiceDateDisplay(job);
  const invoiceDate = jobInvoiceDateDisplay(job);
  const bubbles = useMemo(() => jobAwarenessBubbles(job, events, commands), [job, events, commands]);

  // Balance is truth — never "Paid in full" while openBalance > 0 (Beth Rivkah #251825).
  const fullyPaid = isJobFullyPaid(job);
  // % paid / paid status row hosts the Transaction History toggle (Levi: condensed).
  const pctLabel = total > 0 && !fullyPaid ? pct + "%" : fullyPaid ? "Paid in full" : null;
  const pctKey = total > 0 && !fullyPaid ? "% paid" : fullyPaid ? "Status" : null;

  const rows = [
    svc ? ["Service address", svc] : null,
    serviceDate ? ["Service date", serviceDate] : null,
    invoiceDate ? ["Invoice date", invoiceDate] : null,
    job.invoiceNo ? ["Invoice", job.invoiceNo] : null,
    job.estimateNo ? ["Estimate", job.estimateNo] : null,
    job.linkedPermitJobId ? ["Linked permit", "Connected"] : null,
    job.linkedInvoiceNo && !job.invoiceNo ? ["Linked invoice", "#" + job.linkedInvoiceNo] : null,
    total > 0 ? ["Invoice amount", fmt$(total)] : null,
    // Surface invoice discount so mobile users see the credit stuck (Levi 2026-08-11).
    parseAmount(job?.discount) > 0.01
      ? [
          "Discount",
          job?.discountType === "percent" && parseAmount(job?.discountPercent) > 0
            ? `−${fmt$(job.discount)} (${parseAmount(job.discountPercent)}%)`
            : `−${fmt$(job.discount)}`,
        ]
      : null,
    paid > 0 ? ["Paid", fmt$(paid)] : null,
    balance > 0.01 ? ["Balance due", fmt$(balance)] : null,
  ].filter(Boolean);

  const showTxnToggle = typeof onJobTxnsChange === "function";
  const showPaperworkToggle = typeof onPaperworkChange === "function";
  // When there's no %/status line, still show the toggle on its own condensed row.
  const showPctRow = pctKey || showTxnToggle;
  const showToggleBlock = showPaperworkToggle || showPctRow;

  const bubbleStrip = bubbles.length ? (
    <div
      className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5 w-full auto-rows-fr"
      data-testid="awareness-bubbles"
      data-no-card-open
      onClick={stopBubble}
    >
      {bubbles.map((b) => (
        <AwarenessBubble key={b.key} bubble={b} onClick={onBubbleTap} />
      ))}
    </div>
  ) : null;

  const handleCardClick = onCardTap
    ? (e) => {
        if (e.target.closest("[data-no-card-open]")) return;
        onCardTap();
      }
    : onOpen
      ? (e) => {
          if (e.target.closest("[data-no-card-open]")) return;
          onOpen();
        }
      : undefined;

  return (
    <div
      className={`card px-3 py-3 lg:px-4 lg:py-4 ${handleCardClick ? "cursor-pointer active:bg-slate-50/80" : ""}`}
      data-testid="job-info-card"
      onClick={handleCardClick}
      role={handleCardClick ? "button" : undefined}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider shrink-0">
              Job information
            </h3>
            {onEditJob ? (
              <button
                type="button"
                className={HEADER_BTN}
                onClick={(e) => {
                  stopBubble(e);
                  onEditJob();
                }}
                data-testid="job-edit-btn"
              >
                ✏️ Edit
              </button>
            ) : null}
            {onAddJob ? (
              <button
                type="button"
                className={HEADER_BTN}
                onClick={(e) => {
                  stopBubble(e);
                  onAddJob();
                }}
                data-testid="job-add-btn"
              >
                ＋ Add job
              </button>
            ) : null}
            {onAddChangeOrder ? (
              <button
                type="button"
                className={`${HEADER_BTN_CO} disabled:opacity-40`}
                disabled={!canAddChangeOrder}
                onClick={(e) => {
                  stopBubble(e);
                  onAddChangeOrder();
                }}
                data-testid="add-change-order-btn"
                title="Create a new change-order invoice or estimate on this job"
              >
                ＋ Add change order
              </button>
            ) : null}
            {onAddAttachment ? (
              <button
                type="button"
                className={HEADER_BTN}
                onClick={(e) => {
                  stopBubble(e);
                  onAddAttachment();
                }}
                data-testid="add-attachment-btn"
                aria-label="Add attachment"
                title="Add attachment"
              >
                📋 Attach
              </button>
            ) : null}
          </div>
          <div className="font-semibold text-sm text-slate-800 break-words leading-snug lg:text-base">
            {job.title || (job.invoiceNo ? "Invoice #" + job.invoiceNo : "Job")}
          </div>
        </div>
        <div data-no-card-open onClick={stopBubble}>
          <AmountDisplay job={job} size="sm" highlightDue label="Total due" />
        </div>
      </div>

      {bubbleStrip}

      <SasRecordingLink job={job} sasCalls={sasCalls} />

      {(rows.length > 0 || showToggleBlock) && (
        <dl className="mt-2 space-y-1 text-xs lg:text-sm min-w-0 w-full">
          {rows.map(([k, v]) => {
            const hl =
              highlightInvoiceNo &&
              (k === "Invoice" || k === "Linked invoice") &&
              String(v).replace(/^#/, "") === String(highlightInvoiceNo).replace(/^#/, "");
            return (
              <div
                key={k}
                className={
                  "flex gap-2 items-baseline rounded-md px-1 -mx-1 " +
                  (hl ? "bg-sky-100/70 ring-1 ring-sky-200/80" : "")
                }
                data-hl-invoice={hl ? "1" : undefined}
              >
                <dt className="font-semibold text-slate-800 shrink-0 w-[5.5rem] lg:w-32">{k}</dt>
                <dd
                  className={
                    "break-words min-w-0 " + (hl ? "text-sky-900 font-semibold text-sm" : "text-slate-500")
                  }
                >
                  {v}
                </dd>
              </div>
            );
          })}
          {/* Paperwork + Transaction history: compact right stack (not a full-width
              Paperwork line). Label sits tight next to each toggle (Levi 2026-08-05). */}
          {showToggleBlock ? (
            <div
              className="flex gap-2 items-center min-w-0"
              data-testid="job-info-pct-row"
            >
              {pctKey ? (
                <dt className="font-semibold text-slate-800 shrink-0 w-[5.5rem] lg:w-32">
                  {pctKey}
                </dt>
              ) : null}
              {pctKey ? (
                <dd className="text-slate-500 break-words min-w-0 flex-1">{pctLabel}</dd>
              ) : (
                <div className="flex-1 min-w-0" />
              )}
              {(showPaperworkToggle || showTxnToggle) ? (
                <div
                  className="flex flex-col items-end gap-0.5 shrink-0 ml-auto"
                  data-no-card-open
                  onClick={stopBubble}
                >
                  {showPaperworkToggle ? (
                    <div
                      className="flex items-center gap-1.5"
                      data-testid="job-paperwork-toggle-row"
                    >
                      <span className="text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                        Paperwork
                      </span>
                      <Toggle
                        small
                        on={!!paperworkOn}
                        onChange={onPaperworkChange}
                        label="Enable paperwork / permit tracker"
                      />
                    </div>
                  ) : null}
                  {showTxnToggle ? (
                    <div
                      className="flex items-center gap-1.5"
                      data-testid="job-txn-history-toggle"
                    >
                      <span className="text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                        Transaction history
                      </span>
                      <Toggle
                        small
                        on={!!jobTxns}
                        onChange={onJobTxnsChange}
                        label="Transaction history for this job"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </dl>
      )}

      {onEstimate && onInvoice && onCalendar ? (
        <div data-no-card-open onClick={stopBubble}>
          <JobDocTabs
            job={job}
            jobs={jobs}
            events={events}
            commands={commands}
            onEstimate={onEstimate}
            onInvoice={onInvoice}
            onPayment={onPayment}
            onCalendar={onCalendar}
            onChangeOrders={onChangeOrders}
            changeOrdersActive={changeOrdersActive}
            onStatement={onStatement}
            paperworkOn={paperworkOn}
            onConed={onConed}
            onDob={onDob}
            paperTrackOpen={paperTrackOpen}
          />
        </div>
      ) : null}

      {showOpenLink && onOpen ? (
        <button
          type="button"
          className="w-full mt-2.5 text-sm font-semibold text-brand text-left"
          data-no-card-open
          onClick={(e) => {
            stopBubble(e);
            onOpen();
          }}
          data-testid="customer-job-row"
        >
          Open full job ›
        </button>
      ) : null}
    </div>
  );
}