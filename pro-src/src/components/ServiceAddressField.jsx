// Service address — pick an existing customer site or type a new one.
import React, { useMemo, useState } from "react";
import { Fld } from "./Sheet.jsx";
import AddressAutocompleteField from "./AddressAutocompleteField.jsx";
import { serviceAddressLabel, serviceAddressHint } from "../lib/customerSync.js";
import { serviceAddressesForJobs } from "../lib/customerHierarchy.js";
import { customerKeyForName, jobsForCustomerKey } from "../lib/customers.js";

/** Split "123 Main, Apt 2B" into street + unit when picking a saved site. */
export function parseServiceAddressPick(label) {
  const m = String(label || "").match(/^(.+?),\s*Apt\s+(.+)$/i);
  if (m) return { serviceAddress: m[1].trim(), apartment: m[2].trim() };
  return { serviceAddress: String(label || "").trim(), apartment: "" };
}

function addressChoicesForJob(job, jobs, explicit) {
  if (explicit) return explicit;
  const j = job || {};
  const ck = (j.qboCustomerId && "q:" + j.qboCustomerId) || customerKeyForName(j.businessName || j.customer);
  if (!ck) return [];
  return serviceAddressesForJobs(jobsForCustomerKey(jobs, ck));
}

/**
 * @param {"chips"|"dropdown"} sitePicker — chips show all sites; dropdown keeps the list hidden until tapped
 * @param {boolean} compact — no outer Fld wrapper when parent lays out address + apt on one row
 */
export default function ServiceAddressField({
  job,
  jobs = [],
  events = [],
  value,
  onChange,
  onServiceBlur,
  onApartmentChange,
  suggestAddresses,
  testId = "service-address",
  hint,
  addressChoices: explicitChoices,
  partialOk = true,
  sitePicker = "chips",
  compact = false,
}) {
  const [sitesOpen, setSitesOpen] = useState(false);
  const addressChoices = useMemo(
    () => addressChoicesForJob(job, jobs, explicitChoices),
    [job, jobs, explicitChoices]
  );

  const pickAddress = (label) => {
    const { serviceAddress, apartment } = parseServiceAddressPick(label);
    onChange(serviceAddress);
    if (apartment && onApartmentChange) onApartmentChange(apartment);
    setSitesOpen(false);
  };

  const label = serviceAddressLabel(job);
  const baseHint = hint || serviceAddressHint(job);
  const fieldHint = baseHint + (partialOk && !addressChoices.length ? " — partial address OK" : "");

  const sitesDropdown =
    sitePicker === "dropdown" && addressChoices.length > 0 ? (
      <div className="relative shrink-0" data-testid={testId + "-choices"}>
        <button
          type="button"
          className="h-10 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap"
          onClick={() => setSitesOpen((v) => !v)}
          data-testid={testId + "-sites-toggle"}
          aria-expanded={sitesOpen}
          aria-label="Choose saved site"
        >
          Sites ▾
        </button>
        {sitesOpen ? (
          <div
            className="absolute z-20 left-0 top-full mt-1 min-w-[14rem] max-w-[min(20rem,80vw)] max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg"
            data-testid={testId + "-sites-menu"}
          >
            {addressChoices.map((a) => {
              const street = parseServiceAddressPick(a.label).serviceAddress;
              const active = String(value || "").trim() === street;
              return (
                <button
                  key={a.key}
                  type="button"
                  className={
                    "w-full text-left text-xs px-3 py-2 border-b border-slate-100 last:border-0 truncate " +
                    (active
                      ? "bg-brand/5 text-brand font-semibold"
                      : "text-slate-700 hover:bg-slate-50")
                  }
                  onClick={() => pickAddress(a.label)}
                  data-testid={testId + "-pick-" + a.key}
                >
                  📍 {a.label}
                </button>
              );
            })}
            <button
              type="button"
              className="w-full text-left text-xs px-3 py-2 text-slate-500 border-t border-dashed border-slate-200"
              onClick={() => {
                onChange("");
                setSitesOpen(false);
              }}
              data-testid={testId + "-new"}
            >
              ＋ New address
            </button>
          </div>
        ) : null}
      </div>
    ) : null;

  const chips =
    sitePicker !== "dropdown" && addressChoices.length > 0 ? (
      <div className="mb-2 flex flex-wrap gap-1.5" data-testid={testId + "-choices"}>
        {addressChoices.map((a) => {
          const street = parseServiceAddressPick(a.label).serviceAddress;
          const active = String(value || "").trim() === street;
          return (
            <button
              key={a.key}
              type="button"
              className={`text-left text-xs px-2.5 py-1.5 rounded-lg border max-w-full truncate ${
                active
                  ? "border-brand bg-brand/5 text-brand font-semibold"
                  : "border-slate-200 bg-slate-50 text-slate-700 active:bg-slate-100"
              }`}
              onClick={() => pickAddress(a.label)}
              data-testid={testId + "-pick-" + a.key}
            >
              📍 {a.label}
            </button>
          );
        })}
        <button
          type="button"
          className="text-xs px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-500 shrink-0"
          onClick={() => onChange("")}
          data-testid={testId + "-new"}
        >
          ＋ New
        </button>
      </div>
    ) : null;

  const field = (
    <div className={compact ? "flex-1 min-w-0 flex items-stretch gap-1.5" : undefined}>
      {chips}
      {sitesDropdown}
      <div className={compact ? "flex-1 min-w-0" : undefined}>
        <AddressAutocompleteField
          label={label}
          value={value}
          onChange={onChange}
          onBlurExtra={onServiceBlur}
          jobs={jobs}
          events={events}
          suggestAddresses={suggestAddresses}
          testId={testId}
          ariaLabel={label}
        />
      </div>
    </div>
  );

  if (compact) return field;

  return (
    <Fld label={label} hint={fieldHint}>
      {field}
    </Fld>
  );
}
