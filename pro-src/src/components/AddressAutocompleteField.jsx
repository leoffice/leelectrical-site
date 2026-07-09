// Address input with Google Places-style tap-to-complete suggestions.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { collectAddressSeeds, filterLocalAddressSuggestions } from "../lib/addressComplete.js";

function useAddressSuggestions(value, { jobs, events, suggestAddresses }) {
  const [remote, setRemote] = useState([]);
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(0);

  const seeds = useMemo(() => collectAddressSeeds(jobs, events), [jobs, events]);
  const local = useMemo(() => filterLocalAddressSuggestions(seeds, value), [seeds, value]);

  useEffect(() => {
    const q = String(value || "").trim();
    if (!suggestAddresses || q.length < 3) {
      setRemote([]);
      setLoading(false);
      return;
    }
    const id = ++reqRef.current;
    setLoading(true);
    const t = setTimeout(() => {
      suggestAddresses(q)
        .then((list) => {
          if (reqRef.current !== id) return;
          setRemote(Array.isArray(list) ? list : []);
        })
        .catch(() => {
          if (reqRef.current !== id) return;
          setRemote([]);
        })
        .finally(() => {
          if (reqRef.current === id) setLoading(false);
        });
    }, 220);
    return () => clearTimeout(t);
  }, [value, suggestAddresses]);

  const suggestions = useMemo(() => {
    const merged = [];
    const seen = new Set();
    for (const v of [...local, ...remote]) {
      const s = String(v || "").trim();
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(s);
      if (merged.length >= 8) break;
    }
    return merged;
  }, [local, remote]);

  return { suggestions, loading };
}

export function AddressSuggestionList({
  value,
  onPick,
  open,
  jobs = [],
  events = [],
  suggestAddresses,
  testId = "address",
  loadingLabel = "Finding addresses…",
  title = "Suggested addresses",
}) {
  const { suggestions, loading } = useAddressSuggestions(value, { jobs, events, suggestAddresses });
  if (!open || !suggestions.length) return null;
  return (
    <div
      className="mt-1.5 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
      data-testid={testId + "-suggestions"}
    >
      <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 border-b border-slate-100">
        {loading ? loadingLabel : title}
      </div>
      {suggestions.map((addr) => (
        <button
          key={addr}
          type="button"
          className="w-full text-left px-3 py-2.5 text-sm border-b border-slate-50 last:border-0 active:bg-slate-50 text-slate-800 leading-snug"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(addr)}
        >
          {addr}
        </button>
      ))}
    </div>
  );
}

export default function AddressAutocompleteField({
  label,
  value,
  onChange,
  jobs = [],
  events = [],
  suggestAddresses,
  testId,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label={ariaLabel || label}
        data-testid={testId}
        autoComplete="off"
      />
      <AddressSuggestionList
        value={value}
        onPick={(addr) => {
          onChange(addr);
          setOpen(false);
        }}
        open={open}
        jobs={jobs}
        events={events}
        suggestAddresses={suggestAddresses}
        testId={testId || "address"}
      />
    </>
  );
}