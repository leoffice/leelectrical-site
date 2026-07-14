// No job on calendar event — pick service address for customer, then create from appointment.
import React, { useMemo } from "react";
import Sheet, { Opt } from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";
import { prefillFromEvent, prefillAtServiceAddress } from "../lib/prefillFromEvent.js";
import { suggestJobsForEvent } from "../lib/calendarLink.js";
import { serviceAddressesForJobs, serviceAddressKey } from "../lib/customerHierarchy.js";
import { clientKey, customerKeyForName, jobsForCustomerKey } from "../lib/customers.js";
import { evStart } from "../lib/format.js";

export default function CreateJobFromEventSheet({ event, suggestions: propSuggestions, onClose, onCreateNew }) {
  const { jobs, setNewJob } = useStore();

  const prefill = useMemo(() => prefillFromEvent(event), [event]);

  const customerJobs = useMemo(() => {
    const matched = propSuggestions || suggestJobsForEvent(event, jobs);
    const anchor = matched[0];
    if (anchor) return jobsForCustomerKey(jobs, clientKey(anchor));
    const ck = customerKeyForName(prefill.businessName || prefill.customer);
    if (ck) return jobsForCustomerKey(jobs, ck);
    return [];
  }, [propSuggestions, event, jobs, prefill]);

  const customerName = useMemo(() => {
    if (customerJobs.length) return customerJobs[0].businessName || customerJobs[0].customer || "";
    return prefill.businessName || prefill.customer || "";
  }, [customerJobs, prefill]);

  const addressChoices = useMemo(() => serviceAddressesForJobs(customerJobs), [customerJobs]);

  const calendarKey = useMemo(
    () => serviceAddressKey({ serviceAddress: prefill.serviceAddress, apartment: prefill.apartment }),
    [prefill]
  );

  const calendarInList = addressChoices.some((a) => a.key === calendarKey);

  const openForm = (atAddressKey = "") => {
    const merged = prefillAtServiceAddress(event, customerJobs, atAddressKey);
    onClose();
    setNewJob({ step: "form", prefill: merged });
    onCreateNew?.();
  };

  const calendarLabel =
    prefill.serviceAddress + (prefill.apartment && !calendarInList ? ", Apt " + prefill.apartment : "");

  if (!customerName && !addressChoices.length && !prefill.serviceAddress) {
    return (
      <Sheet title="Create a job?" onClose={onClose}>
        <p className="text-sm text-slate-500 mb-3">
          No job is linked to <b className="text-slate-800">{event?.summary || "this appointment"}</b> (
          {evStart(event).replace("T", " ").slice(0, 16)}). Create one with the calendar details filled in?
        </p>
        <button type="button" className="btn-brand w-full mb-2" onClick={() => openForm("")} data-testid="create-job-from-event">
          ＋ Create job from appointment
        </button>
        <button type="button" className="btn-ghost w-full" onClick={onClose}>
          Not now
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet title="Create a job?" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">
        {customerName ? (
          <>
            Pick a service address for <b className="text-slate-800">{customerName}</b>.
          </>
        ) : (
          <>
            No job is linked to <b className="text-slate-800">{event?.summary || "this appointment"}</b> (
            {evStart(event).replace("T", " ").slice(0, 16)}).
          </>
        )}
      </p>

      {addressChoices.length > 0 ? (
        <div className="mb-3 space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Service addresses</p>
          {addressChoices.map((a) => (
            <Opt
              key={a.key}
              icon="📍"
              title={a.label}
              note={a.key === calendarKey ? "Matches this appointment" : undefined}
              onClick={() => openForm(a.key)}
              data-testid={"pick-addr-" + a.key}
            />
          ))}
        </div>
      ) : null}

      {prefill.serviceAddress && !calendarInList ? (
        <Opt
          icon="📅"
          title={calendarLabel}
          note="From this appointment"
          onClick={() => openForm("")}
          data-testid="pick-calendar-addr"
        />
      ) : null}

      <Opt
        icon="＋"
        title="New address"
        note="Type a different service address"
        onClick={() => openForm("")}
        data-testid="create-new-job-instead"
      />

      <button type="button" className="btn-ghost w-full mt-1" onClick={onClose}>
        Not now
      </button>
    </Sheet>
  );
}