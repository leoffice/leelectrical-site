// Smart customer field (#49) — a text input backed by a live search against
// the QBO customer index (/customers). Matches business name, person name,
// phone, or email as you type; pick one to link + prefill (see NewJobFlow
// #55), or take the "add as a new customer" row to keep the typed name as-is.
//
// Props:
//   value        current text (controlled by the parent form)
//   onChangeText(text)  user typed — parent updates its own state
//   onPick(customer)    a row was chosen. customer = {name,id} for an existing
//                       QBO match, or {name, _newCustomer:true} for "add new".
//   label / placeholder optional
import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store.jsx";

export default function CustomerSearch({
  value,
  onChangeText,
  onPick,
  label = "Customer name",
  placeholder = "Search existing customers…",
  testId = "customer-search-input",
}) {
  const { api } = useStore();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(false); // suppress dropdown right after a pick
  const timer = useRef(null);
  const alive = useRef(true);
  useEffect(() => () => {
    alive.current = false;
    clearTimeout(timer.current);
  }, []);

  const q = (value || "").trim();

  // Debounced lookup — only while the dropdown is open (i.e. the user is
  // actively editing), so prefilled forms never fire a background request.
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

  const handleType = (e) => {
    setPicked(false);
    setOpen(true);
    onChangeText(e.target.value);
  };
  const choose = (c) => {
    setPicked(true);
    setOpen(false);
    setResults([]);
    onPick && onPick(c);
  };

  const norm = (s) => String(s || "").trim().toLowerCase();
  const digits = (s) => String(s || "").replace(/\D/g, "");
  const exact = results.some((c) => {
    const nq = norm(q);
    if ([c.name, c.businessName, c.personName].some((x) => norm(x) === nq)) return true;
    if (c.email && norm(c.email) === nq) return true;
    const qd = digits(q);
    return qd.length >= 7 && digits(c.phone) === qd;
  });

  const resultNote = (c) => {
    const bits = [c.personName, c.phone, c.email].map((x) => String(x || "").trim()).filter(Boolean);
    return bits.length ? bits.join(" · ") : "Existing QuickBooks customer";
  };

  return (
    <div className="relative">
      <input
        className="input"
        value={value || ""}
        onChange={handleType}
        onFocus={() => setOpen(true)}
        aria-label={label}
        data-testid={testId}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && q.length >= 2 && (
        <div
          className="mt-1 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm max-h-56 overflow-y-auto"
          data-testid="customer-search-results"
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
              {c.businessName && c.name && norm(c.businessName) !== norm(c.name) ? (
                <span className="block text-[11px] text-slate-500 truncate">{c.name}</span>
              ) : null}
              <span className="block text-[11px] text-slate-400 truncate">{resultNote(c)}</span>
            </button>
          ))}
          {!loading && !exact && (
            <button
              type="button"
              data-testid="customer-add-new"
              className="w-full text-left px-3 py-2 text-sm text-accent font-semibold hover:bg-slate-50 active:bg-slate-100"
              onClick={() => choose({ name: value, _newCustomer: true })}
            >
              ➕ Add “{value}” as a new customer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
