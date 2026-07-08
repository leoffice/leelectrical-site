// Location input with tap-to-confirm address suggestions.
import React, { useMemo, useState } from "react";
import { Fld } from "./Sheet.jsx";
import { addressCandidatesForJob, filterAddressCandidates } from "../lib/addressSuggest.js";

export default function LocationSuggestField({ job, jobs, events, value, onChange, hint = "Service address" }) {
  const [open, setOpen] = useState(false);
  const candidates = useMemo(() => addressCandidatesForJob(job, jobs, events), [job, jobs, events]);
  const shown = useMemo(() => filterAddressCandidates(candidates, value), [candidates, value]);

  const pick = (addr) => {
    onChange(addr);
    setOpen(false);
  };

  return (
    <Fld label="Location" hint={hint}>
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="Location"
        data-testid="appt-location"
        autoComplete="off"
      />
      {open && shown.length > 0 ? (
        <div
          className="mt-1.5 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
          data-testid="location-suggestions"
        >
          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 border-b border-slate-100">
            Confirm address
          </div>
          {shown.map((c) => (
            <button
              key={c.label + c.value}
              type="button"
              className="w-full text-left px-3 py-2.5 text-sm border-b border-slate-50 last:border-0 active:bg-slate-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c.value)}
            >
              <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">{c.label}</span>
              <span className="block text-slate-800 leading-snug">{c.value}</span>
            </button>
          ))}
        </div>
      ) : null}
    </Fld>
  );
}