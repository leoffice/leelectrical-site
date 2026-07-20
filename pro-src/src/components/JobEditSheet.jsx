// Edit job title + service address + customer re-link; archive / delete with confirm.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import Sheet, { Fld } from "./Sheet.jsx";
import ServiceAddressField from "./ServiceAddressField.jsx";
import CustomerSearch from "./CustomerSearch.jsx";
import { DeleteConfirmSheet } from "./JobSheets.jsx";
import { jobsAtSameAddress } from "../lib/customerHierarchy.js";
import { sortJobs } from "../lib/stages.js";
import { customerPickPatch, fmtAmountDue, normalizeCustomer, openBalance } from "../lib/customers.js";
import { fmt$ } from "../lib/format.js";
import { deleteDocLabel } from "../lib/deleteDoc.js";

function currentCustomerName(job) {
  return job.businessName || job.customer || "";
}

function relinkDocLabel(job) {
  if (job.invoiceNo && job.estimateNo) {
    return "Invoice #" + job.invoiceNo + " / Estimate #" + job.estimateNo;
  }
  if (job.invoiceNo) return "Invoice #" + job.invoiceNo;
  if (job.estimateNo) return "Estimate #" + job.estimateNo;
  return "this record";
}

function pickHasCustomer(c) {
  if (!c) return false;
  const name = normalizeCustomer(c.businessName || c.name || c.customer || "");
  const qboId = String(c.qboCustomerId || c.id || "").trim();
  // Guardrail: never re-link to an empty/blank customer with no qbo id.
  return !!(name || qboId);
}

export default function JobEditSheet({ job, fromCust = "", onClose }) {
  const { jobs, events, api, patchAndSave, showToast } = useStore();
  const nav = useNavigate();
  const [title, setTitle] = useState(job.title || "");
  const [serviceAddress, setServiceAddress] = useState(job.serviceAddress || job.address || "");
  const [apartment, setApartment] = useState(job.apartment || "");
  const [pickedCustomer, setPickedCustomer] = useState(null);
  const [customerText, setCustomerText] = useState(currentCustomerName(job));
  const [confirm, setConfirm] = useState(null); // 'archive' | 'delete'

  const sameAddr = sortJobs(jobsAtSameAddress(jobs, job).filter((j) => j.id !== job.id));
  const displayCustomer = currentCustomerName(job) || "(no customer)";

  const save = async () => {
    const patch = {
      title: title.trim(),
      serviceAddress: serviceAddress.trim(),
      address: serviceAddress.trim(),
      apartment: apartment.trim(),
    };
    if (pickedCustomer && pickHasCustomer(pickedCustomer)) {
      Object.assign(patch, customerPickPatch(pickedCustomer, jobs));
    }
    await patchAndSave(job.id, patch);
    showToast("Job info saved");
    onClose();
  };

  const goBack = () => {
    if (fromCust) nav("/customer/" + encodeURIComponent(fromCust));
    else nav("/");
  };

  const archive = async () => {
    await patchAndSave(job.id, { _archived: true });
    showToast("Archived");
    onClose();
    goBack();
  };

  const remove = async () => {
    await patchAndSave(job.id, { _deleted: true });
    showToast("Removed from app");
    onClose();
    goBack();
  };

  const openJob = (j) => {
    onClose();
    const q = fromCust ? "?from=" + encodeURIComponent(fromCust) : "";
    nav("/job/" + j.id + q);
  };

  const onPickCustomer = (c) => {
    setPickedCustomer(c);
    setCustomerText(c?.businessName || c?.name || c?.customer || "");
  };

  if (confirm === "archive") {
    return (
      <DeleteConfirmSheet
        title="Archive this job?"
        note="Moves to the Archive tab — restore anytime. QuickBooks stays unchanged."
        confirmLabel="Archive"
        onClose={() => setConfirm(null)}
        onConfirm={archive}
      />
    );
  }

  if (confirm === "delete") {
    return (
      <DeleteConfirmSheet
        title={"Remove " + deleteDocLabel(job) + "?"}
        note="This deletes the ENTIRE job from your dashboard (not just one field). QuickBooks stays unchanged."
        confirmLabel="Delete entire job"
        typeToConfirm="DELETE"
        onClose={() => setConfirm(null)}
        onConfirm={remove}
      />
    );
  }

  const newName = pickedCustomer
    ? pickedCustomer.businessName || pickedCustomer.name || pickedCustomer.customer || ""
    : "";

  return (
    <Sheet title="Edit job information" onClose={onClose}>
      <div className="mb-3" data-testid="job-edit-customer">
        <p className="text-sm font-semibold text-slate-800 mb-2" data-testid="job-edit-current-customer">
          {displayCustomer}
        </p>
        <Fld label="Customer">
          <CustomerSearch
            label="Customer"
            testId="job-edit-customer-search"
            value={customerText}
            onChangeText={(t) => {
              setCustomerText(t);
              setPickedCustomer(null);
            }}
            onPick={onPickCustomer}
            jobs={jobs}
          />
        </Fld>
        {pickedCustomer && pickHasCustomer(pickedCustomer) ? (
          <p className="text-[11px] text-slate-500 mt-1 px-0.5" data-testid="job-edit-relink-note">
            Will re-link {relinkDocLabel(job)} to “{newName}”. Line items and amounts stay.
          </p>
        ) : null}
      </div>

      <Fld label="Job title">
        <input className="input" aria-label="Job title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Fld>
      <ServiceAddressField
        job={job}
        jobs={jobs}
        events={events}
        value={serviceAddress}
        onChange={setServiceAddress}
        onApartmentChange={setApartment}
        suggestAddresses={api.suggestAddresses?.bind(api)}
        testId="job-edit-service"
        hint="Stays on this invoice/estimate only — not the customer billing address"
      />
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

      <div className="flex gap-2 mt-2" data-testid="job-edit-actions">
        <button type="button" className="btn-brand flex-1 min-h-[44px] text-sm" onClick={save} data-testid="job-edit-save">
          Save
        </button>
        <button
          type="button"
          className="btn-ghost flex-1 min-h-[44px] text-sm border border-slate-200"
          onClick={() => setConfirm("archive")}
          data-testid="job-edit-archive"
        >
          Archive
        </button>
        <button
          type="button"
          className="btn-ghost flex-1 min-h-[44px] text-sm border-2 border-red-400 bg-red-50 text-red-800 font-bold"
          onClick={() => setConfirm("delete")}
          data-testid="job-edit-delete"
        >
          Delete job
        </button>
      </div>
    </Sheet>
  );
}
