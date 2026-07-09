// Live QBO match dropdown for secondary customer fields (person, phone, billing).
import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store.jsx";

export default function CustomerLiveMatch({
  value,
  onChange,
  onPick,
  label,
  testId,
  placeholder,
}) {
  const { api } = useStore();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(false);
  const timer = useRef(null);
  const alive = useRef(true);

  useEffect(
    () => () => {
      alive.current = false;
      clearTimeout(timer.current);
    },
    []
  );

  const q = (value || "").trim();

  useEffect(() => {
    clearTimeout(timer.current);
    if (!open || picked || q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const list = await api.searchCustomers(q);
        if (alive.current) {
          setResults(Array.isArray(list) ? list : []);
          setLoading(false);
        }
      } catch {
        if (alive.current) {
          setResults([]);
          setLoading(false);
        }
      }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q, open, picked, api]);

  const resultNote = (c) => {
    const bits = [c.personName, c.phone, c.email, c.billingAddress]
      .map((x) => String(x || "").trim())
      .filter(Boolean);
    return bits.length ? bits.join(" · ") : "Existing QuickBooks customer";
  };

  const choose = (c) => {
    setPicked(true);
    setOpen(false);
    setResults([]);
    onPick && onPick(c);
  };

  return (
    <div className="relative">
      <input
        className="input"
        value={value || ""}
        onChange={(e) => {
          setPicked(false);
          setOpen(true);
          onChange(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        aria-label={label}
        data-testid={testId}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && q.length >= 2 && results.length > 0 && (
        <div
          className="mt-1 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm max-h-56 overflow-y-auto z-10"
          data-testid={testId + "-results"}
        >
          {loading && <div className="px-3 py-2 text-xs text-slate-400">Searching…</div>}
          {results.map((c) => (
            <button
              key={c.id ?? c.name}
              type="button"
              data-testid="customer-match"
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100 border-b border-slate-100 last:border-b-0"
              onClick={() => choose(c)}
            >
              <span className="block font-semibold text-slate-800 truncate">{c.businessName || c.name}</span>
              <span className="block text-[11px] text-slate-400 truncate">{resultNote(c)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}