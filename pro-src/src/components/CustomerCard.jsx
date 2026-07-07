// Customer header card — contact info on top, compact actions, edit + sync.
import React from "react";
import { CustomerAvatar } from "./JobCard.jsx";
import { CustomerAmountSubline } from "./AmountDisplay.jsx";
import { fmt$ } from "../lib/format.js";
import { effectiveServiceAddress } from "../lib/customerSync.js";

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

export default function CustomerCard({
  contact,
  summary,
  mapAddress,
  onEdit,
  onSync,
  primaryJob,
  showSummary = true,
}) {
  const displayName = contact.businessName || contact.name;
  const contactRows = [
    ...(contact.businessName && contact.businessName !== displayName
      ? [["Business", contact.businessName, ""]]
      : []),
    ["Person", contact.personName, ""],
    ["Phone", contact.phone, contact.phone ? `tel:${contact.phone}` : ""],
    ["Email", contact.email, contact.email ? `mailto:${contact.email}` : ""],
    ["Billing address", contact.billingAddress, ""],
  ].filter(([, v]) => v);

  const mapHref = mapAddress
    ? `https://maps.apple.com/?q=${encodeURIComponent(mapAddress)}`
    : primaryJob
    ? `https://maps.apple.com/?q=${encodeURIComponent(effectiveServiceAddress(primaryJob))}`
    : "";

  return (
    <div className="card px-3 py-3 lg:px-4 lg:py-4" data-testid="customer-card">
      <div className="flex items-start gap-2 lg:gap-3">
        <CustomerAvatar name={contact.name} className="lg:w-10 lg:h-10 lg:rounded-2xl lg:text-base" />
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold text-slate-900 leading-snug break-words lg:text-lg lg:font-extrabold">
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
          <div className="text-right shrink-0">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider lg:text-[11px]">Total due</div>
            <div className="text-base font-bold text-slate-900 lg:text-lg lg:font-extrabold" data-testid="customer-total-due">
              {fmt$(summary.due) || "$0"}
            </div>
            <CustomerAmountSubline
              invoiced={summary.invoiced}
              paid={summary.paid}
              openInvoices={summary.openInvoices}
              className="text-[10px]"
            />
          </div>
        ) : null}
      </div>

      {contactRows.length > 0 && (
        <dl className="mt-3 space-y-1 text-xs lg:mt-3.5 lg:text-sm">
          {contactRows.map(([k, v, href]) => (
            <div key={k} className="flex gap-2 items-baseline">
              <dt className="font-semibold text-slate-800 shrink-0 w-14 lg:w-24">{k}</dt>
              <dd className="text-slate-500 break-words min-w-0">
                {href ? (
                  <a href={href} className="text-brand font-semibold">
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
        <CustomerActionButton href={contact.email ? `mailto:${contact.email}` : undefined} icon="✉️" label="Email" disabled={!contact.email} />
        <CustomerActionButton href={mapHref || undefined} icon="📍" label="Map" disabled={!mapHref} newTab />
      </div>

      {(onEdit || onSync) && (
        <div className="flex gap-2 mt-2.5 lg:mt-3">
          {onEdit ? (
            <button type="button" className="btn bg-brand-soft text-brand flex-1 !py-1.5 !text-xs lg:!py-2 lg:!text-sm" onClick={onEdit}>
              ✏️ Edit
            </button>
          ) : null}
          {onSync ? (
            <button type="button" className="btn bg-brand-soft text-brand flex-1 !py-1.5 !text-xs lg:!py-2 lg:!text-sm" onClick={onSync}>
              ⇄ Sync
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}