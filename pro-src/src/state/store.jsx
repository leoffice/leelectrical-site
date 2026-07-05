// App store — jobs from the adapter + the staged-changes save model.
// Edits accumulate in `pending` (jobId -> patch); nothing hits the network
// until Save. Discard drops everything. The SaveBar shows the count.
// Pending edits are crash-safe (mirrored to localStorage) and guarded by a
// beforeunload prompt + an in-app leave sheet (Save & continue / Discard / Stay).
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import api from "../data/adapter.js";
import { applyOverlay, deepMerge, isPlainObject } from "../data/merge.js";
import { STAGES } from "../lib/stages.js";
import { fmt$, todayStr } from "../lib/format.js";

const Ctx = createContext(null);
const DRAFT_KEY = "lepro_draft_v1";

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    return d && isPlainObject(d) ? d : {};
  } catch {
    return {};
  }
}

/** Count leaf-level staged edits (matches sleek's pendCount). */
export function countLeaves(pending) {
  let n = 0;
  const walk = (o) => {
    for (const k in o) {
      const v = o[k];
      if (v && typeof v === "object" && !Array.isArray(v)) walk(v);
      else n++;
    }
  };
  Object.values(pending || {}).forEach(walk);
  return n;
}

export function StoreProvider({ children }) {
  const [jobs, setJobs] = useState([]); // merged base+overlay, incl. _archived
  const [events, setEvents] = useState([]);
  const [commands, setCommands] = useState([]);
  const [devTasks, setDevTasks] = useState([]);
  const [pending, setPending] = useState(loadDraft); // jobId -> staged patch
  const [syncedAt, setSyncedAt] = useState(0);
  const [busy, setBusy] = useState(false); // sync chip pulse
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToastMsg] = useState("");
  const [newJob, setNewJob] = useState(null); // {step:"choose"|"cal"|"form", prefill}
  const [leaveReq, setLeaveReq] = useState(null); // {cb}
  const toastT = useRef(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToastMsg(""), 2600);
  }, []);

  /* ---------- crash-safe draft + beforeunload guard ---------- */
  useEffect(() => {
    try {
      if (Object.keys(pending).length) localStorage.setItem(DRAFT_KEY, JSON.stringify(pending));
      else localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }, [pending]);

  useEffect(() => {
    const h = (e) => {
      if (Object.keys(pendingRef.current).length) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  /* ---------- pulls ---------- */
  const refreshJobs = useCallback(async (quiet) => {
    if (!quiet) setLoading(true);
    try {
      const meta = await api.listJobsMeta();
      setJobs(meta.jobs);
      setSyncedAt(meta.syncedAt || 0);
      setError("");
    } catch (e) {
      setError(String((e && e.message) || e));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCommands = useCallback(async () => {
    try {
      setCommands(await api.listCommands());
    } catch {}
  }, []);

  const refreshEvents = useCallback(async () => {
    try {
      setEvents(await api.listEvents());
    } catch {}
  }, []);

  const refreshDev = useCallback(async () => {
    try {
      setDevTasks(await api.listDevTasks());
    } catch {}
  }, []);

  const refresh = useCallback(
    async (quiet) => {
      await Promise.all([refreshJobs(quiet), refreshEvents(), refreshCommands(), refreshDev()]);
    },
    [refreshJobs, refreshEvents, refreshCommands, refreshDev]
  );

  useEffect(() => {
    refresh();
    const t1 = setInterval(() => refreshJobs(true), 60_000);
    const t2 = setInterval(refreshCommands, 8_000);
    const t3 = setInterval(refreshDev, 30_000);
    const t4 = setInterval(refreshEvents, 120_000);
    const vis = () => {
      if (!document.hidden) {
        refreshJobs(true);
        refreshCommands();
      }
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      [t1, t2, t3, t4].forEach(clearInterval);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [refresh, refreshJobs, refreshCommands, refreshDev, refreshEvents]);

  /** Header chip: request a fresh QBO pull, then re-pull everything. */
  const syncNow = useCallback(async () => {
    setBusy(true);
    try {
      await api.requestSync().catch(() => {});
      await refresh(true);
      showToast("Refreshed. Fresh QBO pull requested.");
    } finally {
      setBusy(false);
    }
  }, [refresh, showToast]);

  /* ---------- staged edits ---------- */
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

  const dirtyCount = useMemo(() => countLeaves(pending), [pending]);
  const dirtyJobs = Object.keys(pending).length;

  const saveAll = useCallback(async () => {
    const entries = Object.entries(pendingRef.current);
    if (!entries.length || saving) return;
    setSaving(true);
    try {
      // Which jobs are flipping to paid with this save? (record_payment after)
      const payFlips = entries
        .filter(([id, p]) => p && p.paid === true)
        .map(([id]) => id)
        .filter((id) => {
          const base = jobs.find((j) => String(j.id) === String(id));
          return !(base && base.paid === true);
        })
        .map((id) => effectiveJob(id))
        .filter((j) => j && j.invoiceNo);

      for (const [id, patch] of entries) {
        await api.saveJob(id, patch);
        setJobs((js) => js.map((j) => (String(j.id) === String(id) ? applyOverlay(j, patch) : j)));
      }
      setPending({});
      showToast("Saved ✓ synced to all devices");

      for (const j of payFlips) {
        const pay = j.payment || {};
        await enqueueRef.current(
          "record_payment",
          j.id,
          {
            invoiceNo: j.invoiceNo,
            amount: pay.amount || j.amount,
            method: pay.method || "",
            ref: pay.ref || "",
            date: pay.date || todayStr(),
          },
          "deterministic",
          "record_payment:" + j.id + ":" + (j.invoiceNo || "")
        );
      }
      refreshJobs(true);
    } catch (e) {
      showToast("Save failed — changes kept. " + ((e && e.message) || ""));
    } finally {
      setSaving(false);
    }
  }, [saving, jobs, effectiveJob, refreshJobs, showToast]);

  const discardAll = useCallback(() => {
    setPending({});
    showToast("Changes discarded");
  }, [showToast]);

  /** Patch + save immediately (archive / restore / delete / combine). */
  const patchAndSave = useCallback(
    async (id, patch) => {
      setJobs((js) => js.map((j) => (String(j.id) === String(id) ? applyOverlay(j, patch) : j)));
      try {
        await api.saveJob(id, patch);
      } catch (e) {
        showToast("Sync failed — will retry on next save");
      }
    },
    [showToast]
  );

  /* ---------- command bus ---------- */
  const enqueue = useCallback(
    async (type, jobId, payload, lane, idempotencyKey) => {
      try {
        const { command, deduped } = await api.enqueueCommand(
          type,
          jobId,
          payload,
          lane || "judgment",
          idempotencyKey || type + ":" + jobId + ":" + todayStr()
        );
        if (deduped) showToast("Already sent — deduped, no double-send.");
        refreshCommands();
        return command;
      } catch (e) {
        showToast("Network error — command not queued");
        return null;
      }
    },
    [refreshCommands, showToast]
  );
  const enqueueRef = useRef(enqueue);
  enqueueRef.current = enqueue;

  const retryCommand = useCallback(
    async (id) => {
      await api
        .updateCommand(id, { status: "queued", attempts: 0, error: null }, "manual retry (pro)")
        .catch(() => {});
      refreshCommands();
      showToast("Retrying…");
    },
    [refreshCommands, showToast]
  );

  const resolveApproval = useCallback(
    async (id, choice, matchId) => {
      await api
        .updateCommand(
          id,
          { status: "queued", approval: { choice, matchId: matchId || "", by: "levi", ts: Date.now() } },
          "approval: " + choice + " (pro)"
        )
        .catch(() => {});
      refreshCommands();
      showToast(choice === "skip" ? "Skipped" : "Approved — running…");
    },
    [refreshCommands, showToast]
  );

  /** Append to the job's send history (staged like every other edit). */
  const logSend = useCallback(
    (id, kind, to) => {
      const j = effectiveJob(id) || {};
      const hist = (j.invoiceHistory || []).concat([{ date: todayStr(), to: to || j.email || "", kind }]);
      patchJob(id, { invoiceHistory: hist });
    },
    [effectiveJob, patchJob]
  );

  /* ---------- new job (overlay job, saved immediately like sleek) ---------- */
  const createJob = useCallback(
    async (fields, calEventId) => {
      const g = fields || {};
      if (!g.customer && !g.title) {
        showToast("Give it at least a customer or title");
        return null;
      }
      const id = "local-" + Date.now();
      const status = {};
      STAGES.forEach((s) => (status[s] = { s: "" }));
      status.Lead = { s: "done", d: todayStr() };
      if (g.estimateNo) status.Estimate = { s: "done" };
      if (g.invoiceNo) status.Invoiced = { s: "done", d: todayStr() };
      if (g.date) status.Scheduled = { s: "done", d: g.date };
      const ov = {
        _new: true,
        customer: g.customer || "",
        title: g.title || "",
        amount: g.amount ? fmt$(g.amount) : "",
        phone: g.phone || "",
        email: g.email || "",
        address: g.address || "",
        estimateNo: g.estimateNo || "",
        invoiceNo: g.invoiceNo || "",
        paid: false,
        notes: "",
        followUp: { text: "", date: "" },
        status,
        calEventId: calEventId || "",
      };
      setJobs((js) => [...js, { id, ...JSON.parse(JSON.stringify(ov)) }]);
      api.saveJob(id, ov).catch(() => showToast("Offline — job kept locally"));
      if (g.date) {
        enqueueRef.current(
          "calendar_upsert",
          id,
          {
            calEventId: calEventId || "",
            summary: (g.title || "Job") + " — " + (g.customer || ""),
            start: g.date,
            location: g.address || "",
            description: "Created in LE Pro",
          },
          "judgment",
          "njcal:" + id
        );
      }
      showToast("Job created");
      return id;
    },
    [showToast]
  );

  /* ---------- dev board ---------- */
  const addDevTask = useCallback(
    async (task) => {
      await api.addDevTask(task);
      refreshDev();
      showToast("Sent to Dispatch");
    },
    [refreshDev, showToast]
  );

  const patchDevTask = useCallback(
    async (id, patch) => {
      await api.patchDevTask(id, patch);
      refreshDev();
    },
    [refreshDev]
  );

  const devBadge = useMemo(
    () => devTasks.filter((t) => ["question", "verify"].includes(t.status)).length,
    [devTasks]
  );

  /* ---------- leave guard ---------- */
  const guardNav = useCallback((cb) => {
    if (!Object.keys(pendingRef.current).length) return cb();
    setLeaveReq({ cb });
  }, []);

  const value = {
    jobs: effectiveJobs,
    rawJobs: jobs,
    events,
    commands,
    devTasks,
    devBadge,
    pending,
    dirtyCount,
    dirtyJobs,
    syncedAt,
    busy,
    loading,
    saving,
    error,
    toast,
    newJob,
    setNewJob,
    leaveReq,
    setLeaveReq,
    guardNav,
    refresh,
    refreshCommands,
    refreshDev,
    syncNow,
    patchJob,
    patchAndSave,
    effectiveJob,
    saveAll,
    discardAll,
    enqueue,
    retryCommand,
    resolveApproval,
    logSend,
    createJob,
    addDevTask,
    patchDevTask,
    showToast,
    api,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}
