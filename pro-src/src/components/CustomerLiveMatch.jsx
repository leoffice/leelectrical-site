// Live QBO match dropdown for secondary customer fields (person, phone, billing).
import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store.jsx";
import { CustomerMatchResults } from "./CustomerMatchPanel.jsx";

const MATCH_DISMISS_MS = 4000;

export default function CustomerLiveMatch({
  value,
  onChange,
  onPick,
  label,
  testId,
  placeholder,
  showNewCustomer = true,
  dismissMs = MATCH_DISMISS_MS,
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

  useEffect(() => {
    if (!open || picked || !results.length) return;
    const t = setTimeout(() => {
      setOpen(false);
      setResults([]);
    }, dismissMs);
    return () => clearTimeout(t);
  }, [open, picked, results, dismissMs]);

  const choose = (c) => {
    setPicked(true);
    setOpen(false);
    setResults([]);
    onPick && onPick(c);
  };

  const dismissAsNew = () => {
    setPicked(true);
    setOpen(false);
    setResults([]);
  };

  const handleSearchChange = (text) => {
    setPicked(false);
    setOpen(true);
    onChange(text);
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
        onFocus={() => {
          if (picked) {
            setOpen(false);
            return;
          }
          setOpen(true);
        }}
        aria-label={label}
        data-testid={testId}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && q.length >= 2 && (
        <CustomerMatchResults
          searchValue={value}
          onSearchChange={handleSearchChange}
          searchLabel={label}
          onNewCustomer={dismissAsNew}
          showNewCustomer={showNewCustomer}
          newCustomerLabel="This is a new customer"
          results={results}
          loading={loading}
          onPick={choose}
          testId={testId + "-results"}
        />
      )}
    </div>
  );
}