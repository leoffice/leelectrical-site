// Service address — pick an existing customer site or type a new one.
import React, { useMemo } from "react";
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
}) {
  const addressChoices = useMemo(
    () => addressChoicesForJob(job, jobs, explicitChoices),
    [job, jobs, explicitChoices]
  );

  const pickAddress = (label) => {
    const { serviceAddress, apartment } = parseServiceAddressPick(label);
    onChange(serviceAddress);
    if (apartment && onApartmentChange) onApartmentChange(apartment);
  };

  const label = serviceAddressLabel(job);
  const baseHint = hint || serviceAddressHint(job);
  const fieldHint = baseHint + (partialOk && !addressChoices.length ? " — partial address OK" : "");

  return (
    <Fld label={label} hint={fieldHint}>
      {addressChoices.length > 0 ? (
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
      ) : null}
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
    </Fld>
  );
}