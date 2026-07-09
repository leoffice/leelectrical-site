// Customer header card — contact info on top, compact actions, edit in corner.
import React from "react";
import { CustomerAvatar } from "./JobCard.jsx";
import { CustomerAmountSubline } from "./AmountDisplay.jsx";
import { fmt$ } from "../lib/format.js";
import { effectiveServiceAddress } from "../lib/customerSync.js";
import QboSyncButton from "./QboSyncButton.jsx";
const OFFICE_EMAIL = "office@leelectrical.us";

export function CustomerActionButton({ href, icon, label, disabled, newTab }) {
  return (
    <a
      href={disabled ? undefined : href}
      target={newTab && !disabled ? "_blank" : undefined}
      rel="noreferrer"
      className={`flex-1 flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-semibold transition-colors lg:rounded-xl lg:py-2 lg:text-[11px] ${
        disabled ? "bg-slate-50 text-slate-300" : "bg-brand-soft text-brand"
      }`}
      onClick={(e) => disabled && e.preventDefault()}
    >
      <span className="text-sm leading-none lg:text-base">{icon}</span>
      {label}
    </a>
  );
}

function isDesktop() {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(min-width: 1024px)").matches;
}

function googleMapsHref(address) {
  if (!address) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function emailHref(email) {
  if (!email) return "";
  if (isDesktop()) {
    return (
      "https://mail.google.com/mail/?view=cm&fs=1&to=" +
      encodeURIComponent(email) +
      "&authuser=" +
      encodeURIComponent(OFFICE_EMAIL)
    );
  }
  return `mailto:${email}`;
}

export default function CustomerCard({
  contact,
  summary,
  mapAddress,
  onEdit,
  primaryJob,
  customerJobs,
  showSummary = true,
}) {
  const displayName = contact.businessName || contact.name;
  const addr = mapAddress || (primaryJob ? effectiveServiceAddress(primaryJob) : "");
  const mapHref = googleMapsHref(addr);

  const contactRows = [
    ...(contact.businessName && contact.businessName !== displayName
      ? [["Business", contact.businessName, ""]]
      : []),
    ["Person", contact.personName, ""],
    ["Phone", contact.phone, contact.phone ? `tel:${contact.phone}` : ""],
    ["Email", contact.email, contact.email ? emailHref(contact.email) : ""],
    ["Billing address", contact.billingAddress, ""],
  ].filter(([, v]) => v);

  return (
    <div className="card relative px-3 py-3 lg:px-4 lg:py-4" data-testid="customer-card">
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        {primaryJob ? (
          <QboSyncButton job={primaryJob} customerJobs={customerJobs} compact />
        ) : null}
        {onEdit ? (
          <button
            type="button"
            className="text-[10px] font-semibold text-slate-500 hover:text-brand px-2 py-1 rounded-lg border border-slate-200 bg-white shadow-sm"
            onClick={onEdit}
            aria-label="Edit customer info"
            data-testid="customer-edit-btn"
          >
            ✏️ Edit
          </button>
        ) : null}
      </div>

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
          {contactRows.map(([k, v, href]) => (
            <div key={k} className="flex gap-2 items-baseline">
              <dt className="font-semibold text-slate-800 shrink-0 w-14 lg:w-24">{k}</dt>
              <dd className="text-slate-500 break-words min-w-0">
                {href ? (
                  <a href={href} className="text-brand font-semibold" target={k === "Email" && isDesktop() ? "_blank" : undefined} rel="noreferrer">
                    {v}
                  </a>
                ) : (
                  v
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex gap-1.5 mt-3 lg:gap-2 lg:mt-3.5">
        <CustomerActionButton href={contact.phone ? `tel:${contact.phone}` : undefined} icon="📞" label="Call" disabled={!contact.phone} />
        <CustomerActionButton href={contact.phone ? `sms:${contact.phone}` : undefined} icon="💬" label="Text" disabled={!contact.phone} />
        <CustomerActionButton href={contact.email ? emailHref(contact.email) : undefined} icon="✉️" label="Email" disabled={!contact.email} newTab={isDesktop()} />
        <CustomerActionButton href={mapHref || undefined} icon="📍" label="Map" disabled={!mapHref} newTab />
      </div>
    </div>
  );
}