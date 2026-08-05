// Customer header card — contact info on top, tappable fields, edit in corner.
// Transactions toggle (always on customer info) opens the compact ledger — estimates live only there from the list expand path.
// Optional onCardTap: tap empty card area (e.g. on a job opened from customer) to collapse job info back to the customer default page.
import React from "react";
import { CustomerAvatar } from "./JobCard.jsx";
import { CustomerAmountSubline } from "./AmountDisplay.jsx";
import Toggle from "./Toggle.jsx";
import { fmt$ } from "../lib/format.js";
import { effectiveServiceAddress } from "../lib/customerSync.js";
import { emailHref, googleMapsHref, isDesktop } from "../lib/contactLinks.js";

const FIELD_LINK = "text-brand font-semibold active:opacity-80";

function ContactValue({ value, onClick, href, newTab }) {
  if (onClick) {
    return (
      <button type="button" className={`${FIELD_LINK} text-left`} data-no-card-open onClick={onClick}>
        {value}
      </button>
    );
  }
  if (href) {
    return (
      <a
        href={href}
        className={FIELD_LINK}
        target={newTab ? "_blank" : undefined}
        rel="noreferrer"
        data-no-card-open
      >
        {value}
      </a>
    );
  }
  return value;
}

export default function CustomerCard({
  contact,
  summary,
  mapAddress,
  onEdit,
  onText,
  onEmail,
  primaryJob,
  showSummary = true,
  shortTxns = false,
  onShortTxnsChange,
  /** Paperwork / permit tracker enable (Levi 2026-08-05 — above Transaction history). */
  paperworkOn = false,
  onPaperworkChange,
  onCardTap,
  showServiceAddress = true,
}) {
  const displayName = contact.businessName || contact.name;
  const addr = mapAddress || (primaryJob ? effectiveServiceAddress(primaryJob) : "");
  const mapHref = googleMapsHref(addr);

  const billing = String(contact.billingAddress || "").trim();
  const service = String(addr || "").trim();
  // On the customer page the header is the customer + where they're billed;
  // service addresses belong to the list below it (Levi 2026-07-27). A job or
  // project card still shows the site address it's actually about.
  const showServiceRow = showServiceAddress && service && (mapAddress || service !== billing);

  const contactRows = [
    ...(contact.businessName && contact.businessName !== displayName
      ? [["Business", contact.businessName, null]]
      : []),
    ["Person", contact.personName, null],
    [
      "Phone",
      contact.phone,
      contact.phone ? { href: `tel:${contact.phone}` } : null,
    ],
    [
      "Email",
      contact.email,
      contact.email
        ? {
            onClick: onEmail ? () => onEmail(contact) : undefined,
            href: !onEmail ? emailHref(contact.email) : undefined,
            newTab: !onEmail && isDesktop(),
          }
        : null,
    ],
    ...(showServiceRow ? [["Service address", service, { href: mapHref, newTab: true }]] : []),
    [
      "Billing address",
      contact.billingAddress,
      contact.billingAddress ? { href: googleMapsHref(contact.billingAddress), newTab: true } : null,
    ],
  ].filter(([, v]) => v);

  // Card body tap: explicit onCardTap (e.g. back to customer on job detail), else
  // toggle transaction history when that control is on the card (Levi 2026-08-02).
  const canToggleTxns = typeof onShortTxnsChange === "function";
  const handleCardClick =
    onCardTap || canToggleTxns
      ? (e) => {
          if (e.target.closest("[data-no-card-open]")) return;
          if (onCardTap) {
            onCardTap();
            return;
          }
          onShortTxnsChange(!shortTxns);
        }
      : undefined;

  return (
    <div
      className={
        "card relative px-3 py-3 lg:px-4 lg:py-4" +
        (handleCardClick ? " cursor-pointer active:bg-slate-50/80" : "")
      }
      data-testid="customer-card"
      onClick={handleCardClick}
      role={handleCardClick ? "button" : undefined}
      aria-label={
        handleCardClick
          ? onCardTap
            ? "Back to customer overview"
            : shortTxns
              ? "Hide transaction history"
              : "Show transaction history"
          : undefined
      }
      aria-pressed={canToggleTxns && !onCardTap ? !!shortTxns : undefined}
    >
      {onEdit ? (
        <button
          type="button"
          className="absolute top-2 right-2 z-10 text-[10px] font-semibold text-slate-500 hover:text-brand px-2 py-1 rounded-lg border border-slate-200 bg-white shadow-sm"
          onClick={onEdit}
          aria-label="Edit customer info"
          data-testid="customer-edit-btn"
          data-no-card-open
        >
          ✏️ Edit
        </button>
      ) : null}

      <div className="flex items-start gap-2 lg:gap-3 pr-14">
        <CustomerAvatar name={contact.name} className="lg:w-10 lg:h-10 lg:rounded-2xl lg:text-base" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2 min-w-0">
            <div className="min-w-0 flex-1">
              <div
                className={`text-base font-bold text-slate-900 leading-snug break-words lg:text-lg lg:font-extrabold ${
                  showSummary ? "line-clamp-3 max-lg:line-clamp-4 lg:truncate" : ""
                }`}
                title={displayName || "(no customer)"}
              >
                {displayName || "(no customer)"}
              </div>
              {summary ? (
                <div className="text-[11px] text-slate-500 mt-0.5 lg:text-xs">
                  {summary.jobCount} job{summary.jobCount === 1 ? "" : "s"} · {summary.openInvoices} open invoice
                  {summary.openInvoices === 1 ? "" : "s"}
                </div>
              ) : null}
            </div>
            {showSummary && summary ? (
              <div className="text-right shrink-0 pl-1 max-w-[46%] lg:max-w-none">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider lg:text-[11px]">Total due</div>
                <div
                  className="text-base font-bold text-slate-900 tabular-nums lg:text-lg lg:font-extrabold"
                  data-testid="customer-total-due"
                >
                  {fmt$(summary.due) || "$0"}
                </div>
                <CustomerAmountSubline
                  invoiced={summary.invoiced}
                  paid={summary.paid}
                  openInvoices={0}
                  className="text-[9px] leading-snug mt-0.5"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {contactRows.length > 0 && (
        <dl className="mt-3 space-y-1 text-xs lg:mt-3.5 lg:text-sm">
          {contactRows.map(([k, v, action]) => (
            <div key={k} className="flex gap-2 items-baseline">
              <dt className="font-semibold text-slate-800 shrink-0 w-14 lg:w-24">{k}</dt>
              <dd className="text-slate-500 break-words min-w-0">
                {action ? (
                  <ContactValue
                    value={v}
                    onClick={action.onClick}
                    href={action.href}
                    newTab={action.newTab}
                  />
                ) : (
                  v
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {typeof onPaperworkChange === "function" || canToggleTxns ? (
        <div
          className="mt-3 pt-2 border-t border-slate-100 space-y-2"
          data-testid="customer-card-toggles"
          data-no-card-open
        >
          {/* One row: Paperwork | Transaction history (Levi 2026-08-05 — named, parallel). */}
          <div className="flex items-center justify-end gap-4 flex-wrap" data-testid="customer-short-txns-row">
            {typeof onPaperworkChange === "function" ? (
              <div className="flex items-center gap-1.5" data-testid="customer-paperwork-toggle-row">
                <span className="text-[11px] font-semibold text-slate-600">Paperwork</span>
                <Toggle
                  on={!!paperworkOn}
                  onChange={onPaperworkChange}
                  small
                  label="Paperwork"
                />
              </div>
            ) : null}
            {canToggleTxns ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-600">Transaction history</span>
                <Toggle
                  on={!!shortTxns}
                  onChange={onShortTxnsChange}
                  small
                  label="Transaction history"
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}