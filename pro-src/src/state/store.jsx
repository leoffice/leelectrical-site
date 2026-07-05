// App store — jobs from the adapter + the staged-changes save model.
// Edits accumulate in `pending` (jobId -> patch); nothing hits the network
// until Save. Discard drops everything. The SaveBar shows the count.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import api from "../data/adapter.js";
import { applyOverlay, deepMerge } from "../data/merge.js";

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  const [events, setEvents] = useState([]);
  const [commands, setCommands] = useState([]);
  const [pending, setPending] = useState({}); // jobId -> staged patch
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToastMsg] = useState("");
  const toastT = useRef(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToastMsg(""), 2600);
  }, []);

  const refresh = useCallback(async (quiet) => {
    if (!quiet) setLoading(true);
    try {
      const [js, evs, cmds] = await Promise.all([
        api.listJobs(),
        api.listEvents().catch(() => []),
        api.listCommands().catch(() => []),
      ]);
      setJobs(js);
      setEvents(evs);
      setCommands(cmds);
      setError("");
    } catch (e) {
      setError(String((e && e.message) || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(() => refresh(true), 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  /** Stage an edit (deep-merged into any prior staged edits for that job). */
  const patchJob = useCallback((id, patch) => {
    setPending((p) => ({ ...p, [id]: deepMerge(p[id] || {}, patch) }));
  }, []);

  /** Merged job + staged edits applied on top (what the UI renders). */
  const effectiveJob = useCallback(
    (id) => {
      const base = jobs.find((j) => String(j.id) === String(id));
      if (!base) return null;
      return pending[id] ? applyOverlay(base, pending[id]) : base;
    },
    [jobs, pending]
  );

  const effectiveJobs = useMemo(
    () => jobs.map((j) => (pending[j.id] ? applyOverlay(j, pending[j.id]) : j)),
    [jobs, pending]
  );

  const dirtyCount = Object.keys(pending).length;

  const saveAll = useCallback(async () => {
    if (!dirtyCount || saving) return;
    setSaving(true);
    try {
      for (const [id, patch] of Object.entries(pending)) {
        await api.saveJob(id, patch);
      }
      setPending({});
      showToast(`Saved ${dirtyCount} job${dirtyCount > 1 ? "s" : ""} ✓`);
      await refresh(true);
    } catch (e) {
      showToast("Save failed — changes kept. " + ((e && e.message) || ""));
    } finally {
      setSaving(false);
    }
  }, [pending, dirtyCount, saving, refresh, showToast]);

  const discardAll = useCallback(() => {
    setPending({});
    showToast("Changes discarded");
  }, [showToast]);

  const enqueue = useCallback(
    async (type, jobId, payload, lane) => {
      try {
        const c = await api.enqueueCommand(type, jobId, payload, lane);
        setCommands((cs) => [...cs, c]);
        showToast("Queued: " + type.replace(/_/g, " "));
        return c;
      } catch (e) {
        showToast("Could not queue command");
        return null;
      }
    },
    [showToast]
  );

  const value = {
    jobs: effectiveJobs,
    rawJobs: jobs,
    events,
    commands,
    pending,
    dirtyCount,
    loading,
    saving,
    error,
    toast,
    refresh,
    patchJob,
    effectiveJob,
    saveAll,
    discardAll,
    enqueue,
    showToast,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}
