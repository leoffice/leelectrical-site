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
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store.jsx";
import { CustomerMatchResults } from "./CustomerMatchPanel.jsx";
import {
  buildAppCustomerIndex,
  mergeCustomerSearchResults,
} from "../lib/appCustomerIndex.js";

// Session cache for the full QBO customer index (the `searchCustomers("")` list
// used to enrich/dedupe matches). Fetched at most once per session, and only
// when a search is actually opened — so merely opening the customer info on an
// existing invoice (which mounts CustomerSearch) no longer re-pulls the whole
// customer list. The per-query search still hits the live API, so brand-new
// customers always show up regardless of this cache.
let _qboIndexCache = null; // resolved list, or null until first load
let _qboIndexPromise = null; // in-flight load shared across instances

function loadQboCustomerIndex(api) {
  if (_qboIndexCache) return Promise.resolve(_qboIndexCache);
  if (!_qboIndexPromise) {
    _qboIndexPromise = api
      .searchCustomers("")
      .then((list) => {
        _qboIndexCache = Array.isArray(list) ? list : [];
        return _qboIndexCache;
      })
      .catch(() => {
        _qboIndexPromise = null; // allow a retry on the next open
        return [];
      });
  }
  return _qboIndexPromise;
}

export default function CustomerSearch({
  value,
  onChangeText,
  onPick,
  label = "Customer name",
  placeholder = "Search existing customers…",
  testId = "customer-search-input",
  jobs: jobsProp,
}) {
  const { api, jobs: storeJobs } = useStore();
  const jobs = jobsProp || storeJobs;
  const appIndex = useMemo(() => buildAppCustomerIndex(jobs), [jobs]);
  const appIndexRef = useRef(appIndex);
  const qboIndexRef = useRef([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(false); // suppress dropdown right after a pick
  const timer = useRef(null);
  const alive = useRef(true);

  useEffect(() => {
    appIndexRef.current = appIndex;
  }, [appIndex]);

  useEffect(() => () => {
    alive.current = false;
    clearTimeout(timer.current);
  }, []);

  // Load the QBO index only once the user actually opens the picker (focus/type),
  // reusing the session cache — never on a plain mount of a prefilled form.
  useEffect(() => {
    if (!open) return;
    if (_qboIndexCache) {
      qboIndexRef.current = _qboIndexCache;
      return;
    }
    let cancelled = false;
    loadQboCustomerIndex(api).then((list) => {
      if (!cancelled && Array.isArray(list)) qboIndexRef.current = list;
    });
    return () => {
      cancelled = true;
    };
  }, [open, api]);

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
          const qbo = Array.isArray(list) ? list : [];
          const merged = mergeCustomerSearchResults(
            qbo,
            appIndexRef.current,
            q,
            qboIndexRef.current
          );
          setResults(merged.length ? merged : qbo);
          setLoading(false);
        }
      } catch {
        if (alive.current) {
          setResults(
            mergeCustomerSearchResults([], appIndexRef.current, q, qboIndexRef.current)
          );
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

  const handleSearchChange = (text) => {
    setPicked(false);
    setOpen(true);
    onChangeText(text);
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
        <CustomerMatchResults
          searchValue={value}
          onSearchChange={handleSearchChange}
          searchLabel={label}
          onNewCustomer={() => choose({ name: value, _newCustomer: true })}
          newCustomerLabel="This is a new customer"
          results={results}
          loading={loading}
          onPick={choose}
          testId="customer-search-results"
        />
      )}
    </div>
  );
}