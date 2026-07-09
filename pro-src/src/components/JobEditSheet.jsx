// Edit job title + service address; shows other invoices at the same address.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import Sheet, { Fld } from "./Sheet.jsx";
import { jobsAtSameAddress } from "../lib/customerHierarchy.js";
import { sortJobs } from "../lib/stages.js";
import { fmtAmountDue, openBalance } from "../lib/customers.js";
import { fmt$ } from "../lib/format.js";

export default function JobEditSheet({ job, fromCust = "", onClose }) {
  const { jobs, patchAndSave, showToast } = useStore();
  const nav = useNavigate();
  const [title, setTitle] = useState(job.title || "");
  const [serviceAddress, setServiceAddress] = useState(job.serviceAddress || job.address || "");
  const [apartment, setApartment] = useState(job.apartment || "");

  const sameAddr = sortJobs(jobsAtSameAddress(jobs, job).filter((j) => j.id !== job.id));

  const save = async () => {
    await patchAndSave(job.id, {
      title: title.trim(),
      serviceAddress: serviceAddress.trim(),
      address: serviceAddress.trim(),
      apartment: apartment.trim(),
    });
    showToast("Job info saved");
    onClose();
  };

  const openJob = (j) => {
    onClose();
    const q = fromCust ? "?from=" + encodeURIComponent(fromCust) : "";
    nav("/job/" + j.id + q);
  };

  return (
    <Sheet title="Edit job information" onClose={onClose}>
      <Fld label="Job title">
        <input className="input" aria-label="Job title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Fld>
      <Fld label="Service address" hint="Stays on this invoice/estimate only — not the customer billing address">
        <input className="input" aria-label="Service address" value={serviceAddress} onChange={(e) => setServiceAddress(e.target.value)} />
      </Fld>
      <Fld label="Apartment / unit">
        <input className="input" aria-label="Apartment / unit" value={apartment} onChange={(e) => setApartment(e.target.value)} placeholder="Optional" />
      </Fld>

      {sameAddr.length ? (
        <div className="mt-4 mb-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">
            Other invoices at this address ({sameAddr.length})
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x" data-testid="job-edit-same-addr">
            {sameAddr.map((j) => {
              const due = openBalance(j);
              const tone = j.paid || due <= 0.01 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50";
              return (
                <button
                  key={j.id}
                  type="button"
                  className={`snap-start shrink-0 w-[72%] max-w-[240px] rounded-xl border px-3 py-2.5 text-left ${tone}`}
                  onClick={() => openJob(j)}
                >
                  <div className="text-xs font-bold text-slate-800 truncate">
                    {j.invoiceNo ? "Inv #" + j.invoiceNo : j.title || "Job"}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {j.paid ? "Paid" : fmtAmountDue(j) || fmt$(due) || "—"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <button type="button" className="btn-brand w-full" onClick={save} data-testid="job-edit-save">
        Save
      </button>
    </Sheet>
  );
}