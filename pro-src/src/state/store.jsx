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
// Dual context: typing only invalidates EditCtx. Shell watchers that only need
// jobs/events/commands subscribe via useStoreData and stay idle while you type.
import api from "../data/adapter.js";
import { applyOverlay, deepMerge, isPlainObject, mergeJobsStaleGuard } from "../data/merge.js";
import { STAGES } from "../lib/stages.js";
import { calendarServiceLocation } from "../lib/customerSync.js";
import { evStart, fmt$, parseAmount, todayStr } from "../lib/format.js";
import { normalizePayments } from "../lib/payments.js";
import { unhandledCount } from "../lib/sas.js";
import { activeReminderCount } from "../lib/followUpReminders.js";
import { customerSyncPayload, qboCustomerToJobPatch } from "../lib/customerSync.js";
import { customerQboJobPatch } from "../lib/customerQboLink.js";
import {
  clearPendingDocSync,
  flushPendingDocSync,
  hasPendingDocSync,
  markPendingDocSyncFailure,
  peekPendingDocSync,
} from "../lib/docSyncChain.js";
import { runDailyDedupeScan } from "../lib/dedupeScan.js";
import { flushDocOutbox, pendingDocSaveCount } from "../lib/docOutbox.js";
import { touchCustomerJob } from "../lib/customerRecency.js";
import { hydrateDismissed } from "../lib/customers.js";
import {
  calendarUpsertDescription,
  calendarUpsertLinksJob,
  isCalendarUnlinkCommand,
  isPendingCalEventId,
  jobIdFromEventDescription,
  mergePendingCalendarEvents,
  parseCalendarUpsertResult,
  promotePendingCalendarEvent as promotePendingCalEvent,
} from "../lib/calendarLink.js";
import { productName } from "../lib/tenantBranding.js";
import { flushAllDebouncedPatches } from "../lib/useDebouncedPatch.js";
import {
  AUDIT_OV_KEY,
  planMutation,
  auditPatchOnly,
} from "../lib/auditTrail.js";
import { readSession } from "../lib/session.js";

const DataCtx = createContext(null);
const EditCtx = createContext(null);
/** Toast only — a flash message must NOT invalidate DataCtx (Jobs, chat, prompts). */
const ToastCtx = createContext(null);
const DRAFT_KEY = "lepro_draft_v1";

// Background polls fire every 8–60s. When the fetched snapshot is byte-for-byte
// what we already hold, returning the SAME reference lets React bail out of the
// render — so idle ticks never re-render the tree (and never stutter typing in
// an open sheet or drag of a floating card). The stringify cost is trivial next
// to a full-tree re-render.
function sameSnapshot(a, b) {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
/** setState that no-ops (keeps identity) when the next value equals the current. */
function keepIfSame(setter, next) {
  setter((prev) => (sameSnapshot(prev, next) ? prev : next));
}
const DRAFT_PERSIST_MS = 400;

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
  const [eventsSyncedAt, setEventsSyncedAt] = useState(0);
  const [commands, setCommands] = useState([]);
  const [devTasks, setDevTasks] = useState([]);
  const [sasCalls, setSasCalls] = useState([]); // SAS inbound lead tickets
  const [sasTickets, setSasTickets] = useState({}); // ov._sasTickets handled-state map
  const [emailInsights, setEmailInsights] = useState([]); // Energy Services email insights
  const [pending, setPending] = useState(loadDraft); // jobId -> staged patch
  const [syncedAt, setSyncedAt] = useState(0);
  const [busy, setBusy] = useState(false); // sync chip pulse
  const [syncProgress, setSyncProgress] = useState(null); // { steps: [{id,label,done,active}], pct }
  const [dedupeScan, setDedupeScan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToastMsg] = useState("");
  const [docConfirm, setDocConfirm] = useState(null); // {kind,no,amount,customer}
  const [newJob, setNewJob] = useState(null); // {step:"choose"|"cal"|"cal-lead"|"form", prefill}
  const [leaveReq, setLeaveReq] = useState(null); // {cb}
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const toastT = useRef(null);
  const docConfirmT = useRef(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const syncInFlightRef = useRef(false);
  const jobsCountRef = useRef(0);
  jobsCountRef.current = jobs.length;
  const syncAnimRef = useRef({ iv: null, resolve: null });

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToastMsg(""), 2600);
  }, []);

  const showDocConfirm = useCallback((info) => {
    setDocConfirm(info);
    clearTimeout(docConfirmT.current);
    docConfirmT.current = setTimeout(() => setDocConfirm(null), 5000);
  }, []);

  /* ---------- crash-safe draft + beforeunload guard ---------- */
  // Debounce disk writes — keystroke-by-keystroke stringify of pending blocked the UI thread.
  // Clear immediately on discard/save so leave-guard tests and crash recovery stay correct.
  useEffect(() => {
    if (!Object.keys(pending).length) {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
      return;
    }
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(pending));
      } catch {}
    }, DRAFT_PERSIST_MS);
    return () => clearTimeout(t);
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
  const lastSavedTs = useRef(0); // ts of our latest overlay save (see refreshJobs)
  /** First full createJob overlay save per id — thin create_customer must wait on this. */
  const jobFirstSaveRef = useRef(new Map());
  const refreshJobs = useCallback(async (quiet) => {
    if (!quiet) setLoading(true);
    try {
      const meta = await api.listJobsMeta();
      // The overlay lives in eventually-consistent storage: a snapshot older
      // than our last save would silently revert just-saved edits on screen.
      // Keep the local (already saved) state and let the next poll catch up.
      const stale = lastSavedTs.current && meta.stateTs && meta.stateTs < lastSavedTs.current;
      const incoming = meta.jobs || [];
      // Never wipe the list when the server returns empty during a sync blip.
      // Always keep local _new jobs (estimate generator just created) until the
      // server snapshot includes them — a mid-save refresh was dropping the job
      // and showing "Job local-… not found" right after Save + Create.
      if (stale || incoming.length || !jobsCountRef.current) {
        setJobs((prev) => {
          // Adapter returns the same array ref when jobsdata+state are unchanged
          // (304 polls). Keep identity so the Jobs list and badge memos bail out
          // without re-stringifying multi-MB snapshots.
          if (!stale && incoming.length && incoming === prev) return prev;
          const merged = mergeJobsStaleGuard(prev, incoming.length ? incoming : prev);
          // When not stale and server has data, prefer server fields but keep
          // any local-only _new rows the snapshot has not caught up with yet.
          if (!stale && incoming.length) {
            return sameSnapshot(prev, merged) ? prev : merged;
          }
          if (stale) {
            return sameSnapshot(prev, merged) ? prev : merged;
          }
          // Empty incoming blip — keep prev
          return prev;
        });
      }
      setSyncedAt(meta.syncedAt || 0);
      setError("");
      return meta;
    } catch (e) {
      const msg = String((e && e.message) || e);
      // Prefer a plain phrase for timeouts (shown in the red retry banner).
      setError(msg.includes("timed out") ? "Jobs took too long to load — tap Retry" : msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCommands = useCallback(async () => {
    try {
      keepIfSame(setCommands, await api.listCommands());
    } catch {}
  }, []);

  const appliedCalUpserts = useRef(new Set());
  const appliedFetchPayments = useRef(new Set());

  const mergePendingEvents = useCallback((prev, pulled) => mergePendingCalendarEvents(prev, pulled), []);

  const refreshEvents = useCallback(async ({ pull = false, awaitPull = true } = {}) => {
    try {
      const meta = await api.listEventsMeta();
      setEvents((prev) => {
        const merged = mergePendingEvents(prev, meta.events || []);
        return sameSnapshot(prev, merged) ? prev : merged;
      });
      setEventsSyncedAt(meta.syncedAt || 0);
      if (pull && api.pullCalendar) {
        const beforeSync = meta.syncedAt || 0;
        const run = async () => {
          const evs = await api.pullCalendar();
          setEvents((prev) => {
            const merged = mergePendingEvents(prev, evs);
            return sameSnapshot(prev, merged) ? prev : merged;
          });
          const m = await api.listEventsMeta();
          setEventsSyncedAt(m.syncedAt || 0);
          return (m.syncedAt || 0) > beforeSync;
        };
        if (awaitPull) {
          const fresh = await run();
          if (!fresh) showToast("Calendar refresh timed out — showing last sync");
        } else {
          run().catch(() => showToast("Couldn't refresh calendar"));
        }
      }
    } catch (e) {
      setError(String((e && e.message) || e));
    }
  }, [mergePendingEvents, showToast]);

  const pullCalendarNow = useCallback(async () => {
    await refreshEvents({ pull: true, awaitPull: true });
  }, [refreshEvents]);

  const appendLocalEvent = useCallback((event) => {
    if (!event) return;
    setEvents((evs) => {
      const id = event.id || "";
      const next = id ? evs.filter((e) => String(e.id) !== String(id)) : evs.slice();
      return next.concat([event]);
    });
  }, []);

  const patchLocalEvent = useCallback((eventId, patch) => {
    setEvents((evs) => evs.map((e) => (String(e.id) === String(eventId) ? { ...e, ...patch } : e)));
  }, []);

  const removeLocalEvent = useCallback((eventId) => {
    setEvents((evs) => evs.filter((e) => String(e.id) !== String(eventId)));
  }, []);

  const refreshDev = useCallback(async () => {
    try {
      keepIfSame(setDevTasks, await api.listDevTasks());
    } catch {}
  }, []);

  /** SAS lead tickets + their handled-state (ov._sasTickets). */
  const refreshSas = useCallback(async () => {
    try {
      const [calls, tickets] = await Promise.all([api.listSasCalls(), api.getSasTickets()]);
      keepIfSame(setSasCalls, Array.isArray(calls) ? calls : []);
      keepIfSame(setSasTickets, tickets || {});
    } catch {}
  }, []);

  const refreshEmailInsights = useCallback(async () => {
    if (!api.listEmailInsights) return;
    try {
      keepIfSame(setEmailInsights, await api.listEmailInsights());
    } catch {}
  }, []);

  const patchEmailInsight = useCallback(
    async (id, patch) => {
      if (!api.patchEmailInsight) return;
      // Optimistic local patch so "Got it" / Ignore close instantly (Levi 2026-07-30).
      setEmailInsights((prev) =>
        (prev || []).map((x) => (String(x.id) === String(id) ? { ...x, ...patch } : x))
      );
      try {
        await api.patchEmailInsight(id, patch);
      } catch (e) {
        throw e;
      }
    },
    []
  );

  const refreshNomerge = useCallback(async () => {
    try {
      const pairs = await api.getNomergePairs?.();
      if (pairs?.length) hydrateDismissed(pairs);
    } catch {}
  }, []);

  const refresh = useCallback(
    async (quiet, opts = {}) => {
      const pullCal = opts.pullCalendar === true;
      const awaitPull = opts.awaitPull !== false;
      await Promise.all([
        refreshJobs(quiet),
        refreshEvents({ pull: pullCal, awaitPull }),
        refreshCommands(),
        refreshDev(),
        refreshSas(),
        refreshEmailInsights(),
        refreshNomerge(),
      ]);
    },
    [refreshJobs, refreshEvents, refreshCommands, refreshDev, refreshSas, refreshEmailInsights, refreshNomerge]
  );

  useEffect(() => {
    refresh(false);
    refreshEvents({ pull: true, awaitPull: false });
    const t1 = setInterval(() => refreshJobs(true), 60_000);
    const t2 = setInterval(refreshCommands, 8_000);
    const t3 = setInterval(refreshDev, 30_000);
    const t4 = setInterval(() => refreshEvents({ pull: false }), 30_000);
    const t5 = setInterval(refreshSas, 60_000);
    const t6 = setInterval(() => refreshEvents({ pull: true, awaitPull: false }), 180_000);
    const t7 = setInterval(refreshEmailInsights, 60_000);
    const vis = () => {
      if (!document.hidden) {
        refreshJobs(true);
        refreshEvents({ pull: false });
        refreshEvents({ pull: true, awaitPull: false });
        refreshCommands();
        refreshSas();
        refreshEmailInsights();
      }
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      [t1, t2, t3, t4, t5, t6, t7].forEach(clearInterval);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [refresh, refreshJobs, refreshCommands, refreshDev, refreshEvents, refreshSas, refreshEmailInsights]);

  /** Once-daily customer + invoice dedupe scan after jobs load — deferred so the list can paint first. */
  const dedupeFpRef = useRef("");
  useEffect(() => {
    if (loading) return;
    if (!jobs || !jobs.length) return;
    // Quiet polls reuse the same job set — skip re-scanning thousands of customers.
    const fp = `${jobs.length}:${syncedAt || 0}`;
    if (fp === dedupeFpRef.current && dedupeScan) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      const scan = runDailyDedupeScan(jobs);
      if (cancelled) return;
      dedupeFpRef.current = fp;
      setDedupeScan(scan);
      if (scan.ran && (scan.customerCount > 0 || scan.invoiceCount > 0)) {
        const parts = [];
        if (scan.customerCount) parts.push(scan.customerCount + " customer pair" + (scan.customerCount === 1 ? "" : "s"));
        if (scan.invoiceCount) parts.push(scan.invoiceCount + " invoice dupe" + (scan.invoiceCount === 1 ? "" : "s"));
        showToast("Daily dedupe scan — " + parts.join(", "));
      }
    };
    // Let React paint the jobs list before the merge scan touches the main thread.
    let idleId = 0;
    let t = 0;
    if (typeof requestIdleCallback === "function") {
      idleId = requestIdleCallback(run, { timeout: 1500 });
    } else {
      t = setTimeout(run, 80);
    }
    return () => {
      cancelled = true;
      if (idleId && typeof cancelIdleCallback === "function") cancelIdleCallback(idleId);
      if (t) clearTimeout(t);
    };
  }, [jobs, loading, syncedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const SYNC_PHASES = useMemo(
    () => [
      { id: "calendar", label: "Calendar" },
      { id: "refresh", label: "Refreshing" },
    ],
    []
  );

  const stopSyncAnim = useCallback(() => {
    clearInterval(syncAnimRef.current.iv);
    syncAnimRef.current.iv = null;
    if (syncAnimRef.current.resolve) {
      const done = syncAnimRef.current.resolve;
      syncAnimRef.current.resolve = null;
      done();
    }
  }, []);

  const animateSyncPct = useCallback(
    (label, from, to, ms) => {
      stopSyncAnim();
      const start = Date.now();
      setSyncProgress({ label, pct: from });
      return new Promise((resolve) => {
        syncAnimRef.current.resolve = resolve;
        syncAnimRef.current.iv = setInterval(() => {
          const t = Math.min(1, (Date.now() - start) / ms);
          const pct = Math.round(from + (to - from) * t);
          setSyncProgress({ label, pct });
          if (t >= 1) stopSyncAnim();
        }, 120);
      });
    },
    [stopSyncAnim]
  );

  const setSyncPhase = useCallback(
    (index, pct) => {
      const phase = SYNC_PHASES[index] || SYNC_PHASES[SYNC_PHASES.length - 1];
      setSyncProgress({ label: phase.label, pct: pct ?? Math.min(100, Math.round((index / SYNC_PHASES.length) * 100)), index });
    },
    [SYNC_PHASES]
  );

  /** Header chip: calendar request → refresh local data. QBO pulls run per-action
   *  (import customer, save/sync, fetch payments) — not on every chip tap. */
  const syncNow = useCallback(async () => {
    if (busy || syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    setBusy(true);
    const isTest = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.MODE === "test";
    const calendarAnimMs = isTest ? 40 : 1800;
    try {
      setSyncPhase(0, 10);
      await Promise.all([
        api.requestCalendarSync?.().catch(() => {}),
        animateSyncPct("Calendar", 10, 45, calendarAnimMs),
      ]);

      setSyncPhase(1, 50);
      await Promise.all([
        refresh(true, { pullCalendar: true, awaitPull: true }),
        animateSyncPct("Refreshing", 50, 95, isTest ? 40 : 1200),
      ]);
      await refreshJobs(true);
      await refreshCommands();

      setSyncProgress({ label: "Done", pct: 100, index: SYNC_PHASES.length });
      showToast("Refreshed — calendar & jobs updated");
    } finally {
      stopSyncAnim();
      syncInFlightRef.current = false;
      setBusy(false);
      setTimeout(() => setSyncProgress(null), 700);
    }
  }, [busy, refresh, refreshJobs, refreshCommands, showToast, setSyncPhase, animateSyncPct, stopSyncAnim, SYNC_PHASES.length]);

  /* ---------- staged edits ---------- */
  const patchJob = useCallback((id, patch) => {
    setPending((p) => {
      const next = { ...p, [id]: deepMerge(p[id] || {}, patch) };
      // Keep ref in sync so saveAll can flush debounced text then read immediately.
      pendingRef.current = next;
      return next;
    });
  }, []);

  /** Merged job + staged edits. Reads pending via ref so the callback identity
   *  stays stable while typing (shell watchers won't re-render). */
  const effectiveJob = useCallback((id) => {
    const base = jobs.find((j) => String(j.id) === String(id));
    if (!base) return null;
    const ov = pendingRef.current[id];
    return ov ? applyOverlay(base, ov) : base;
  }, [jobs]);

  // Overlay only jobs with staged edits. Reuse prior row objects when that
  // job's pending patch is unchanged so list memoization can skip work.
  const effJobsRef = useRef({ jobs, pending, list: jobs, byId: null });
  const effectiveJobs = useMemo(() => {
    const prev = effJobsRef.current;
    if (!Object.keys(pending).length) {
      effJobsRef.current = { jobs, pending, list: jobs, byId: null };
      return jobs;
    }
    const prevById =
      prev.byId && prev.jobs === jobs
        ? prev.byId
        : prev.list && prev.jobs === jobs
          ? new Map(prev.list.map((j) => [j.id, j]))
          : null;
    const list = new Array(jobs.length);
    const byId = new Map();
    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      const ov = pending[j.id];
      let row;
      if (!ov) {
        row = j;
      } else if (prevById && prev.pending && prev.pending[j.id] === ov) {
        row = prevById.get(j.id) || applyOverlay(j, ov);
      } else {
        row = applyOverlay(j, ov);
      }
      list[i] = row;
      byId.set(j.id, row);
    }
    effJobsRef.current = { jobs, pending, list, byId };
    return list;
  }, [jobs, pending]);

  const dirtyCount = useMemo(() => countLeaves(pending), [pending]);
  const dirtyJobs = Object.keys(pending).length;

  /** Resolve actor for the universal audit trail (session uid or local). */
  const auditActor = useCallback(() => {
    try {
      const s = readSession();
      return (s && (s.uid || s.access_token?.slice?.(0, 8))) || "local";
    } catch {
      return "local";
    }
  }, []);

  /**
   * Append immutable audit row(s) to ov._auditLog via the same saveJob path.
   * Uses byId keys so deepMerge keeps prior rows (arrays would be replaced).
   * Fire-and-forget relative to the entity save — never blocks the UI.
   * Non-destructive sync flags resolve through this same layer.
   */
  const appendAuditEntries = useCallback(async (entries) => {
    const list = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
    if (!list.length) return;
    try {
      await api.saveJob(AUDIT_OV_KEY, auditPatchOnly(list));
    } catch {
      // Audit must not break the user save path.
    }
  }, []);

  const saveAll = useCallback(async () => {
    // Pull any still-debounced text fields into pending before we read it.
    flushAllDebouncedPatches();
    const entries = Object.entries(pendingRef.current);
    if (!entries.length || saving) return;

    const newPaymentsToSync = [];
    for (const [id, patch] of entries) {
      if (!patch?.payments && !patch?.payment) continue;
      const base = jobs.find((j) => String(j.id) === String(id));
      if (!base) continue;
      const after = effectiveJob(id);
      const beforeIds = new Set(normalizePayments(base).map((p) => p.id));
      for (const p of normalizePayments(after)) {
        if (!beforeIds.has(p.id) && parseAmount(p.amount) > 0) {
          newPaymentsToSync.push({ job: after, payment: p });
        }
      }
    }

    // Instant local commit — screen never waits on the network.
    // Plan audit rows (immutable prior-state snapshots) before applying.
    const plannedById = new Map();
    const auditBatch = [];
    for (const [id, patch] of entries) {
      const base = jobs.find((j) => String(j.id) === String(id)) || null;
      const planned = planMutation(base, patch, {
        actor: auditActor(),
        entityId: id,
        entityHint: "job",
      });
      plannedById.set(String(id), planned);
      if (planned.entry && String(id).charAt(0) !== "_") auditBatch.push(planned.entry);
    }
    const patchById = new Map(
      entries.map(([id]) => {
        const planned = plannedById.get(String(id));
        return [String(id), planned?.patch || entries.find(([i]) => String(i) === String(id))?.[1]];
      })
    );
    const touched = [];
    setJobs((js) =>
      js.map((j) => {
        const patch = patchById.get(String(j.id));
        if (!patch) return j;
        const merged = applyOverlay(j, patch);
        touched.push(merged);
        return merged;
      })
    );
    touched.forEach((j) => touchCustomerJob(j));
    pendingRef.current = {};
    setPending({});
    showToast("Saved ✓ syncing…");

    setSaving(true);
    try {
      for (const [id] of entries) {
        const planned = plannedById.get(String(id));
        const patch = planned?.patch || patchById.get(String(id));
        try {
          const r = await api.saveJob(id, patch);
          if (r && r.ts) lastSavedTs.current = Math.max(lastSavedTs.current, r.ts);
        } catch {
          await new Promise((res) => setTimeout(res, 400));
          const r = await api.saveJob(id, patch);
          if (r && r.ts) lastSavedTs.current = Math.max(lastSavedTs.current, r.ts);
        }
      }
      if (auditBatch.length) void appendAuditEntries(auditBatch);

      for (const { job: j, payment: pay } of newPaymentsToSync) {
        if (!j.invoiceNo) continue;
        const payAmt = parseAmount(pay.amount);
        if (payAmt <= 0) {
          showToast("Skipped QuickBooks payment — no amount on " + (j.invoiceNo || j.id));
          continue;
        }
        const idem = [
          "record_payment",
          j.id,
          j.invoiceNo || "",
          pay.id || "",
          pay.amount,
          pay.date || "",
          pay.ref || "",
        ].join(":");
        // Permit-renew mock invoices stay LE Pro-only (no QBO Doc). Flag localOnly
        // so the host keeps the payment without "Document not found" (LE-2701).
        // Real LE- invoices still try QBO; host falls back to local if not found.
        const pr = j.permitRenew || j.permitRenewMock || {};
        const localOnly = !!(pr.mock || pr.phase === "A" || pr.phase === 1);
        void enqueueRef.current(
          "record_payment",
          j.id,
          {
            invoiceNo: j.invoiceNo,
            // Always enqueue a plain number — host rejects / crashed on "$20000" (2026-08-04).
            amount: payAmt,
            method: pay.method || "",
            ref: pay.ref || "",
            date: pay.date || todayStr(),
            note: pay.note || "",
            depositTo: pay.depositTo || "",
            email: j.email || "",
            sendReceipt: true,
            ...(localOnly ? { localOnly: true } : {}),
          },
          "deterministic",
          idem
        );
      }
      // No trailing full-blob refetch here: the optimistic setJobs above already
      // applied every saved patch (last-write-wins, same as the server now
      // holds), so re-downloading the whole ~4k-job blob only to re-merge and
      // re-group the identical result was pure post-save jank. Payment syncs
      // reconcile via their record_payment/fetch_payments command-completion
      // refresh (below), and cross-device changes arrive on the 60s poll.
    } catch (e) {
      // Re-stage failed patches so the bar comes back; local job rows already show edits.
      const restore = {};
      for (const [id, patch] of entries) restore[id] = patch;
      pendingRef.current = { ...pendingRef.current, ...restore };
      setPending((p) => ({ ...p, ...restore }));
      showToast("Save failed — changes kept. " + ((e && e.message) || ""));
    } finally {
      setSaving(false);
    }
  }, [saving, jobs, effectiveJob, refreshJobs, showToast, auditActor, appendAuditEntries]);

  const discardAll = useCallback(() => {
    pendingRef.current = {};
    setPending({});
    // Soft-delete unfinished draft change orders (created on misclick, never emailed/confirmed).
    // Discard must remove them — they are saved immediately, not only staged in pending.
    setJobs((js) => {
      const draftIds = [];
      const next = js.map((j) => {
        if (
          j &&
          j.changeOrder &&
          j._draftChangeOrder &&
          !j._docEmailed &&
          !j._invoiceConfirmed &&
          !j._estimateConfirmed &&
          !j._deleted
        ) {
          draftIds.push(j.id);
          return { ...j, _deleted: true };
        }
        return j;
      });
      for (const id of draftIds) {
        api.saveJob(id, { _deleted: true }).catch(() => {});
      }
      if (draftIds.length) {
        showToast(
          draftIds.length === 1
            ? "Changes discarded — draft change order removed"
            : "Changes discarded — draft change orders removed"
        );
      } else {
        showToast("Changes discarded");
      }
      return next;
    });
  }, [showToast]);

  /** Patch + save immediately (archive / restore / delete / combine).
   *  Every mutation writes an immutable audit row (universal archive). */
  const patchAndSave = useCallback(
    async (id, patch) => {
      let merged = null;
      let before = null;
      let planned = null;
      // Local apply first so the screen never waits on the network.
      setJobs((js) =>
        js.map((j) => {
          if (String(j.id) !== String(id)) return j;
          before = j;
          planned = planMutation(j, patch, {
            actor: auditActor(),
            entityId: id,
            entityHint: "job",
          });
          merged = applyOverlay(j, planned.patch);
          return merged;
        })
      );
      // Overlay-only / metadata keys (e.g. _projects) may not be in jobs[].
      if (!planned && patch) {
        planned = planMutation(null, patch, {
          actor: auditActor(),
          entityId: id,
          entityHint: String(id).charAt(0) === "_" ? "unknown" : "job",
        });
        merged = planned.patch;
      }
      if (merged && String(id).charAt(0) !== "_") touchCustomerJob(merged);
      // Invoice/estimate Save is authoritative — drop staged leaves for this job so
      // the bottom bar does not still say "Unsaved on N jobs" (Levi 2026-08-05).
      setPending((p) => {
        if (!p || !(id in p)) return p;
        const next = { ...p };
        delete next[id];
        pendingRef.current = next;
        return next;
      });
      const toSave = planned?.patch || patch;
      const trySave = () => api.saveJob(id, toSave);
      // Network in the background so Save never freezes the UI (SNAPPY rule #1).
      // Local setJobs above already applied the Inv/Est # and lines.
      void (async () => {
        try {
          let r = await trySave();
          if (r && r.ts) lastSavedTs.current = Math.max(lastSavedTs.current, r.ts);
          if (planned?.entry && String(id).charAt(0) !== "_") {
            void appendAuditEntries(planned.entry);
          }
        } catch {
          // One automatic retry, then surface — agent/host can pick up longer outages.
          try {
            await new Promise((res) => setTimeout(res, 400));
            const r = await trySave();
            if (r && r.ts) lastSavedTs.current = Math.max(lastSavedTs.current, r.ts);
            if (planned?.entry && String(id).charAt(0) !== "_") {
              void appendAuditEntries(planned.entry);
            }
          } catch {
            showToast("Sync failed — will retry on next save");
          }
        }
      })();
    },
    [showToast, auditActor, appendAuditEntries]
  );

  const promotePendingCalendarEvent = useCallback(
    (evs, eventId, pl, match) => promotePendingCalEvent(evs, eventId, pl, match),
    []
  );

  /* ---------- doc outbox: replay any invoice whose save never confirmed ----------
   * Levi 2026-08-11 (invoice LE-251859 reached a customer and existed nowhere).
   * Creating an invoice writes it to the outbox synchronously and moves on; if
   * the network save never confirmed — failed request, closed tab, dead phone —
   * this replays it once the app is back. Runs at idle: nothing on screen waits.
   */
  const outboxFlushedRef = useRef(false);
  useEffect(() => {
    if (loading || outboxFlushedRef.current) return;
    if (!pendingDocSaveCount()) return;
    outboxFlushedRef.current = true;
    let cancelled = false;
    const idle =
      typeof window !== "undefined" && window.requestIdleCallback
        ? window.requestIdleCallback
        : (fn) => setTimeout(fn, 1200);
    idle(() => {
      if (cancelled) return;
      flushDocOutbox(patchAndSave)
        .then(({ replayed }) => {
          if (!cancelled && replayed > 0) {
            showToast(
              replayed === 1
                ? "Recovered 1 unsaved document"
                : `Recovered ${replayed} unsaved documents`
            );
          }
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [loading, patchAndSave, showToast]);


  // When calendar_upsert finishes on the Mac, store the real Google event id on the job.
  useEffect(() => {
    for (const cmd of commands || []) {
      if (cmd.type !== "calendar_upsert" || cmd.status !== "done") continue;
      const mark = String(cmd.id || cmd.idempotencyKey || "");
      if (!mark || appliedCalUpserts.current.has(mark)) continue;

      const eventId = parseCalendarUpsertResult(cmd.result)?.eventId;
      if (!eventId || !cmd.jobId) continue;

      const idk = String(cmd.idempotencyKey || "");
      const pl = cmd.payload || {};
      const isDuplicate = idk.startsWith("caldup:");
      const isUnlinkedBus = String(cmd.jobId) === "today" || idk.startsWith("todaycal:");

      if (isDuplicate || isUnlinkedBus) {
        appliedCalUpserts.current.add(mark);
        setEvents((evs) =>
          promotePendingCalendarEvent(evs, eventId, pl, (e) =>
            isDuplicate && jobIdFromEventDescription(e.description)
              ? jobIdFromEventDescription(e.description) === String(cmd.jobId)
              : false
          )
        );
        if (isDuplicate) continue;
      }

      const job = jobs.find((j) => String(j.id) === String(cmd.jobId));
      if (!job) continue;

      if (isCalendarUnlinkCommand(cmd) || !calendarUpsertLinksJob(cmd, cmd.jobId)) {
        appliedCalUpserts.current.add(mark);
        if (String(job.calEventId) === String(eventId) || isPendingCalEventId(job.calEventId)) {
          patchAndSave(cmd.jobId, { calEventId: "", _calUnlinked: true });
        }
        continue;
      }

      if (job._calUnlinked) {
        appliedCalUpserts.current.add(mark);
        continue;
      }

      const dismissed = new Set((job.calDismissedEventIds || []).map((id) => String(id)));
      if (eventId && dismissed.has(String(eventId))) {
        appliedCalUpserts.current.add(mark);
        continue;
      }

      if (String(job.calEventId) === String(eventId) && !isPendingCalEventId(job.calEventId)) {
        appliedCalUpserts.current.add(mark);
        continue;
      }

      appliedCalUpserts.current.add(mark);
      patchAndSave(cmd.jobId, { calEventId: eventId, _calUnlinked: false });
      setEvents((evs) =>
        promotePendingCalendarEvent(evs, eventId, pl, (e) => jobIdFromEventDescription(e.description) === String(cmd.jobId))
      );
    }
  }, [commands, jobs, patchAndSave, promotePendingCalendarEvent]);

  const appliedImportCustomer = useRef(new Set());

  useEffect(() => {
    for (const cmd of commands || []) {
      if (cmd.type !== "fetch_payments" || cmd.status !== "done") continue;
      const mark = String(cmd.idempotencyKey || cmd.id || "");
      if (!mark || appliedFetchPayments.current.has(mark)) continue;
      appliedFetchPayments.current.add(mark);
      refreshJobs(true);
    }
  }, [commands, refreshJobs]);

  useEffect(() => {
    for (const cmd of commands || []) {
      if (cmd.type !== "import_customer" || cmd.status !== "done") continue;
      const mark = String(cmd.idempotencyKey || cmd.id || "");
      if (!mark || appliedImportCustomer.current.has(mark)) continue;
      appliedImportCustomer.current.add(mark);
      refreshJobs(true);
      let imported = 0;
      try {
        const res = typeof cmd.result === "string" ? JSON.parse(cmd.result) : cmd.result || {};
        imported = Number(res.imported) || 0;
      } catch {}
      showToast(imported ? "Imported — open invoices added as jobs" : "Customer linked — refresh if jobs are missing");
    }
  }, [commands, refreshJobs, showToast]);

  /* ---------- command bus ---------- */
  const enqueue = useCallback(
    async (type, jobId, payload, lane, idempotencyKey) => {
      try {
        const idk = idempotencyKey || type + ":" + jobId + ":" + todayStr();
        const { command, deduped } = await api.enqueueCommand(
          type,
          jobId,
          payload,
          lane || "judgment",
          idk
        );
        if (deduped) {
          // If the prior attempt failed, re-queue it instead of dead-ending Save & sync.
          const sameKey = (commands || []).find((c) => String(c.idempotencyKey || "") === String(idk));
          const failedSame =
            sameKey?.status === "failed"
              ? sameKey
              : (commands || []).find(
                  (c) => c.type === type && String(c.jobId) === String(jobId) && c.status === "failed"
                );
          if (failedSame?.id) {
            await api
              .updateCommand(failedSame.id, { status: "queued", attempts: 0, error: null }, "auto-retry after re-save")
              .catch(() => {});
            showToast("Re-trying the failed QuickBooks sync…");
            refreshCommands();
            return failedSame;
          }
          // Prior create was lost from the short command history and the job still
          // has no QuickBooks number — allow one fresh attempt (not a double on done).
          if (type === "create_invoice" || type === "create_estimate") {
            const j = effectiveJob(jobId) || {};
            const hasNo =
              type === "create_estimate"
                ? !!(j.estimateNo || j._estimateConfirmed)
                : !!(j.invoiceNo || j._invoiceConfirmed);
            if (!hasNo && (!sameKey || sameKey.status !== "done")) {
              const retryKey = idk + ":r" + Date.now();
              const again = await api.enqueueCommand(type, jobId, payload, lane || "judgment", retryKey);
              refreshCommands();
              if (!again?.deduped) showToast("Queued again for QuickBooks…");
              else showToast("Already sent — no double-send.");
              return again?.command || command;
            }
          }
          showToast("Already sent — deduped, no double-send.");
        }
        refreshCommands();
        return command;
      } catch (e) {
        showToast("Network error — command not queued");
        return null;
      }
    },
    [commands, effectiveJob, refreshCommands, showToast]
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
      const cmd = (commands || []).find((c) => String(c.id) === String(id));
      const approval = { choice, matchId: matchId || "", by: "levi", ts: Date.now() };
      if (cmd && cmd.type === "customer_sync") {
        // The host listener re-runs the same fuzzy search whenever a
        // customer_sync goes back to "queued" — it never reads `approval` —
        // so requeueing loops back to needs_approval forever. Do what the
        // classic dashboard does instead: close this command out and enqueue
        // the concrete follow-up (create_customer / update_customer).
        const prop = (cmd.result && cmd.result.proposed) || cmd.payload || {};
        await api
          .updateCommand(
            id,
            { status: "done", result: { action: "resolved", choice }, approval },
            "user chose " + choice + " (pro)"
          )
          .catch(() => {});
        if (choice === "pull_qbo") {
          const qb = (cmd.result && cmd.result.customer) || {};
          const patch = qboCustomerToJobPatch(qb);
          setPending((prev) => {
            const next = { ...prev };
            delete next[cmd.jobId];
            return next;
          });
          await patchAndSave(cmd.jobId, patch);
        } else {
          const j = effectiveJob(cmd.jobId) || {};
          const merged = {
            ...j,
            ...prop,
            businessName: prop.businessName || prop.name || j.businessName || j.customer || "",
            billingAddress:
              prop.billingAddr || prop.billingAddress || prop.addr || j.billingAddress || "",
          };
          const info = customerSyncPayload(merged);
          if (choice === "create") {
            await enqueue(
              "create_customer",
              cmd.jobId,
              info,
              "deterministic",
              "create_customer|" + cmd.jobId + "|" + Date.now()
            );
          } else if (choice === "update" && matchId) {
            await enqueue(
              "update_customer",
              cmd.jobId,
              { id: matchId, ...info },
              "deterministic",
              "update_customer|" + cmd.jobId + "|" + Date.now()
            );
          }
        }
      } else {
        await api
          .updateCommand(id, { status: "queued", approval }, "approval: " + choice + " (pro)")
          .catch(() => {});
      }
      refreshCommands();
      if (choice === "skip") showToast("Skipped");
      else if (choice === "pull_qbo") showToast(`Updated ${productName()} from QuickBooks`);
      else showToast("Approved — running…");
    },
    [commands, effectiveJob, enqueue, patchAndSave, refreshCommands, showToast]
  );

  /** Append to the job's send history immediately — never stages a phantom unsaved change. */
  const logSend = useCallback(
    (id, kind, to) => {
      const j = effectiveJob(id) || {};
      const hist = (j.invoiceHistory || []).concat([{ date: todayStr(), to: to || j.email || "", kind }]);
      patchAndSave(id, { invoiceHistory: hist }).catch(() => {});
    },
    [effectiveJob, patchAndSave]
  );

  const appliedCustomerQbo = useRef(new Set());

  useEffect(() => {
    for (const cmd of commands || []) {
      if (cmd.type !== "create_customer" && cmd.type !== "update_customer") continue;
      if (cmd.status !== "done") continue;
      const mark = String(cmd.idempotencyKey || cmd.id || "");
      if (!mark || appliedCustomerQbo.current.has(mark)) continue;
      const patch = customerQboJobPatch(cmd.result, cmd);
      if (!patch || !cmd.jobId) continue;
      const job = effectiveJob(cmd.jobId);
      // Already fully linked with matching id — skip re-save unless name missing
      // (thin race left qboCustomerId only; re-apply identity fields).
      if (
        job &&
        String(job.qboCustomerId || "") === patch.qboCustomerId &&
        (job.customer || job.businessName)
      ) {
        appliedCustomerQbo.current.add(mark);
        continue;
      }
      const pendingDoc = hasPendingDocSync(cmd.jobId);
      patchAndSave(cmd.jobId, patch)
        .then(async () => {
          // NEVER consume the stash before the flush succeeds. The old code
          // called takePendingDocSync() here, so a flush that did not queue
          // (or threw into the swallowed .catch below) destroyed the invoice
          // the user had already been told was on its way — that is how
          // Mordechai Nemni's invoice vanished on 2026-08-10.
          const pending = peekPendingDocSync(cmd.jobId);
          if (!pending) {
            appliedCustomerQbo.current.add(mark);
            return;
          }
          const linkedJob = { ...(effectiveJob(cmd.jobId) || {}), ...patch };
          const label = pending.kind === "estimate" ? "estimate" : "invoice";
          let queued = false;
          let failure = "";
          try {
            queued = await flushPendingDocSync({
              enqueue: enqueueRef.current,
              logSend,
              jobId: cmd.jobId,
              job: linkedJob,
              bundle: pending,
            });
          } catch (err) {
            failure = String(err?.message || err);
          }
          if (queued) {
            clearPendingDocSync(cmd.jobId);
            appliedCustomerQbo.current.add(mark);
            showToast(
              pending.send
                ? "Customer ready — sending your " + label + " to QuickBooks now"
                : "Customer ready — syncing your " + label + " to QuickBooks now"
            );
            return;
          }
          // Keep the bundle AND leave this command unmarked so the next pass
          // retries. flushPendingDocSync enqueues with idempotency keys, so a
          // retry cannot double-send.
          //
          // Levi 2026-08-11: no toast here — sending must look and feel exactly
          // as it did before. This is silent bookkeeping only: the sole change
          // from the original flow is that a failed flush no longer DESTROYS
          // the queued doc, which is invisible on the happy path.
          markPendingDocSyncFailure(cmd.jobId, failure);
        })
        .catch((err) => {
          // Never silently swallow: a failed link used to leave the user
          // believing the invoice had gone out.
          markPendingDocSyncFailure(cmd.jobId, err?.message || err);
        });
      if (!pendingDoc) {
        appliedCustomerQbo.current.add(mark);
        showToast("Customer linked to QuickBooks");
      }
    }
  }, [commands, effectiveJob, logSend, patchAndSave, showToast]);

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
      if (g.estimateNo || (Array.isArray(g.estimateLines) && g.estimateLines.length)) {
        status.Estimate = { s: "done", d: todayStr() };
      }
      if (g.invoiceNo) status.Invoiced = { s: "done", d: todayStr() };
      if (g.date) status.Scheduled = { s: "done", d: g.date };
      const serviceAddr = g.serviceAddress || g.address || "";
      // Calendar/form sometimes puts first name in customer and last name in personName.
      // Never drop the last name on save — join single-token personal pairs.
      const rawBiz = String(g.businessName || g.customer || "").trim();
      const rawPerson = String(g.personName || "").trim();
      const single = (s) => s && s.split(/\s+/).length === 1 && /^[A-Za-z][A-Za-z.'-]{0,40}$/.test(s);
      let customerName = rawBiz || rawPerson;
      let personName = rawPerson;
      if (single(rawBiz) && single(rawPerson) && rawBiz.toLowerCase() !== rawPerson.toLowerCase()) {
        customerName = `${rawBiz} ${rawPerson}`;
        personName = customerName;
      } else if (!personName && customerName) {
        personName = customerName;
      }
      const ov = {
        _new: true,
        customer: customerName,
        businessName: customerName,
        personName,
        title: g.title || "",
        amount: g.amount ? fmt$(g.amount) : "",
        phone: g.phone || "",
        email: g.email || "",
        address: serviceAddr,
        serviceAddress: serviceAddr,
        apartment: g.apartment || "",
        billingAddress: g.billingAddress || "",
        qboCustomerId: g.qboCustomerId || "",
        // Sub-company / parent (Levi 2026-08-10 — was dropped so 234 Schenectady LLC under Hackner never stuck)
        parentCustomerName: g.parentCustomerName || "",
        parentQboCustomerId: g.parentQboCustomerId || "",
        description: g.description || "",
        estimateNo: g.estimateNo || "",
        invoiceNo: g.invoiceNo || "",
        paid: false,
        notes: g.notes || "",
        followUp: { text: "", date: "" },
        status,
        calEventId: calEventId || "",
        _sasCallId: g.sasCallId || "",
        _sasRecordingUrl: g.sasRecordingUrl || "",
        // Estimate generator / line prefill (service upgrade, etc.)
        ...(Array.isArray(g.estimateLines) && g.estimateLines.length
          ? { estimateLines: g.estimateLines, _estimateConfirmed: false }
          : {}),
        ...(Array.isArray(g.invoiceLines) && g.invoiceLines.length ? { invoiceLines: g.invoiceLines } : {}),
        ...(g._estimator ? { _estimator: g._estimator } : {}),
        ...(g._fromEstimateGenerator ? { _fromEstimateGenerator: true } : {}),
        ...(g._estimateConfirmed ? { _estimateConfirmed: true } : {}),
        // Change-order fields (must survive create — Discard removes draft COs).
        ...(g.changeOrder
          ? {
              changeOrder: true,
              changeOrderKind: g.changeOrderKind || "invoice",
              changeOrderSourceId: g.changeOrderSourceId || "",
              changeOrderSeq: g.changeOrderSeq || 0,
              changeOrderLabel: g.changeOrderLabel || "",
              _estimateConfirmed: false,
              _invoiceConfirmed: false,
              _docEmailed: false,
              _draftChangeOrder: true,
            }
          : {}),
      };
      setJobs((js) => [...js, { id, ...JSON.parse(JSON.stringify(ov)) }]);
      // Optimistic stamp so a concurrent refreshJobs does not treat the blob
      // as fresher and wipe this brand-new local job before save lands.
      lastSavedTs.current = Math.max(lastSavedTs.current, Date.now());
      // SNAPPY (Levi 2026-08-10): never block Add customer / New job on the state
      // POST (can sit ~30s on a slow blob). Local list updates now; network +
      // calendar enqueue run in background. Thin create_customer must await
      // whenJobSaved(id) so it cannot race ahead of this full shell.
      const saveP = (async () => {
        try {
          const r = await api.saveJob(id, ov);
          if (r && r.ts) lastSavedTs.current = Math.max(lastSavedTs.current, r.ts);
        } catch {
          showToast("Offline — job kept locally");
        }
        if (g.date) {
          // P0 data-loss fix (2026-07-31): never replace Google event notes with
          // "Created in LE Pro". Prefer job/event description; when updating an
          // existing calEventId with no real notes, omit description so the host
          // PATCH leaves the user's text alone (gcal_upsert only writes if set).
          const calDesc = calendarUpsertDescription({
            notes: g.description,
            calEventId: calEventId || "",
            createFallback: `Created in ${productName()}`,
          });
          const calPayload = {
            calEventId: calEventId || "",
            summary: (g.title || "Job") + " — " + (g.customer || ""),
            start: g.date,
            location: calendarServiceLocation({
              serviceAddress: serviceAddr,
              apartment: g.apartment,
              billingAddress: g.billingAddress,
            }),
          };
          if (calDesc != null) calPayload.description = calDesc;
          enqueueRef.current("calendar_upsert", id, calPayload, "judgment", "njcal:" + id);
        }
      })();
      jobFirstSaveRef.current.set(id, saveP);
      void saveP.finally(() => {
        // Keep resolved promise briefly for late waiters, then drop.
        setTimeout(() => {
          if (jobFirstSaveRef.current.get(id) === saveP) jobFirstSaveRef.current.delete(id);
        }, 60_000);
      });
      showToast("Job created");
      return id;
    },
    [showToast]
  );

  /** Wait until createJob's first full overlay save finished (or no pending save). */
  const whenJobSaved = useCallback((id) => {
    const key = String(id || "");
    if (!key) return Promise.resolve();
    return jobFirstSaveRef.current.get(key) || Promise.resolve();
  }, []);

  /* ---------- dev board ---------- */
  const addDevTask = useCallback(
    async (task) => {
      try {
        await api.addDevTask(task);
      } catch {
        showToast("Network error — request not sent, try again");
        return false;
      }
      refreshDev();
      showToast("Sent to Dispatch");
      return true;
    },
    [refreshDev, showToast]
  );

  const patchDevTask = useCallback(
    async (id, patch) => {
      try {
        await api.patchDevTask(id, patch);
      } catch {
        showToast("Network error — change not saved");
        return false;
      }
      refreshDev();
      return true;
    },
    [refreshDev, showToast]
  );

  /* ---------- SAS lead tickets (Calls tab) ---------- */
  /** Mark a ticket handled (dismiss or converted-to-job). Optimistic local
   *  update + persist under the reserved ov._sasTickets key. NO QBO commands
   *  ever originate here — these are leads, not QuickBooks customers. */
  const markSasHandled = useCallback(async (callId, info) => {
    if (!callId) return;
    const patch = { handled: true, ts: Date.now(), ...(info || {}) };
    setSasTickets((t) => ({ ...t, [callId]: { ...(t[callId] || {}), ...patch } }));
    try {
      await api.markSasTicket(callId, patch);
    } catch {
      showToast("Offline — ticket state kept locally");
    }
  }, [showToast]);

  const sasBadge = useMemo(() => unhandledCount(sasCalls, sasTickets), [sasCalls, sasTickets]);

  // Use base jobs (not effectiveJobs) so typing staged notes doesn't recompute
  // badges and invalidate DataCtx for the whole shell.
  const reminderBadge = useMemo(
    () => activeReminderCount(events, jobs, todayStr(), new Date(), commands),
    [events, jobs, commands]
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

  const toggleChat = useCallback(() => setChatOpen((o) => !o), []);

  const appendInvoiceEditFeedback = useCallback(
    async (entry) => {
      if (!api.appendInvoiceEditFeedback) return;
      try {
        await api.appendInvoiceEditFeedback(entry);
      } catch {}
    },
    [api]
  );

  const appendPaymentVisionFeedback = useCallback(
    async (entry) => {
      if (!api.appendPaymentVisionFeedback) return;
      try {
        await api.appendPaymentVisionFeedback(entry);
      } catch {}
    },
    [api]
  );

  const getPaymentVisionLearning = useCallback(async () => {
    if (!api.getPaymentVisionLearning) return [];
    try {
      return (await api.getPaymentVisionLearning()) || [];
    } catch {
      return [];
    }
  }, [api]);

  const getSettings = useCallback(async () => {
    if (!api.getSettings) throw new Error("Settings not available");
    return api.getSettings();
  }, [api]);

  const saveSettings = useCallback(
    async (doc) => {
      if (!api.saveSettings) throw new Error("Settings not available");
      return api.saveSettings(doc);
    },
    [api]
  );

  // DataCtx: stable while typing (actions + base data). EditCtx: pending state only.
  // Typing a note must not re-render FollowUpPrompts / chat / sync shell / watchers.
  const dataValue = useMemo(
    () => ({
      // Base jobs (no staged overlay). Lists that show live edits use useStoreEdit().jobs.
      jobs,
      rawJobs: jobs,
      events,
      eventsSyncedAt,
      pullCalendarNow,
      appendLocalEvent,
      commands,
      devTasks,
      devBadge,
      sasCalls,
      sasTickets,
      sasBadge,
      reminderBadge,
      refreshSas,
      markSasHandled,
      emailInsights,
      refreshEmailInsights,
      patchEmailInsight,
      syncedAt,
      busy,
      syncProgress,
      dedupeScan,
      loading,
      error,
      // toast lives in ToastCtx — flash messages must not re-render the tree
      docConfirm,
      showDocConfirm,
      newJob,
      setNewJob,
      chatOpen,
      setChatOpen,
      chatUnread,
      setChatUnread,
      toggleChat,
      refresh,
      refreshJobs,
      refreshCommands,
      refreshDev,
      syncNow,
      appendInvoiceEditFeedback,
      appendPaymentVisionFeedback,
      getPaymentVisionLearning,
      patchLocalEvent,
      removeLocalEvent,
      enqueue,
      retryCommand,
      resolveApproval,
      logSend,
      createJob,
      whenJobSaved,
      addDevTask,
      patchDevTask,
      getSettings,
      saveSettings,
      showToast,
      api,
      // Stable actions — safe to call without subscribing to pending.
      guardNav,
      patchJob,
      patchAndSave,
      effectiveJob,
      saveAll,
      discardAll,
    }),
    [
      jobs,
      events,
      eventsSyncedAt,
      pullCalendarNow,
      appendLocalEvent,
      commands,
      devTasks,
      devBadge,
      sasCalls,
      sasTickets,
      sasBadge,
      reminderBadge,
      refreshSas,
      markSasHandled,
      emailInsights,
      refreshEmailInsights,
      patchEmailInsight,
      syncedAt,
      busy,
      syncProgress,
      dedupeScan,
      loading,
      error,
      docConfirm,
      showDocConfirm,
      newJob,
      chatOpen,
      chatUnread,
      toggleChat,
      refresh,
      refreshJobs,
      refreshCommands,
      refreshDev,
      syncNow,
      appendInvoiceEditFeedback,
      appendPaymentVisionFeedback,
      getPaymentVisionLearning,
      patchLocalEvent,
      removeLocalEvent,
      enqueue,
      retryCommand,
      resolveApproval,
      logSend,
      createJob,
      whenJobSaved,
      addDevTask,
      patchDevTask,
      getSettings,
      saveSettings,
      showToast,
      guardNav,
      patchJob,
      patchAndSave,
      effectiveJob,
      saveAll,
      discardAll,
    ]
  );

  const toastValue = useMemo(() => ({ toast }), [toast]);

  const editValue = useMemo(
    () => ({
      // Live list with staged overlays — Jobs/Detail/Customers use this.
      jobs: effectiveJobs,
      rawJobs: jobs,
      pending,
      dirtyCount,
      dirtyJobs,
      saving,
      leaveReq,
      setLeaveReq,
      // Also exposed here for call-sites that only import useStoreEdit.
      guardNav,
      patchJob,
      patchAndSave,
      effectiveJob,
      saveAll,
      discardAll,
    }),
    [
      effectiveJobs,
      jobs,
      pending,
      dirtyCount,
      dirtyJobs,
      saving,
      leaveReq,
      guardNav,
      patchJob,
      patchAndSave,
      effectiveJob,
      saveAll,
      discardAll,
    ]
  );

  return (
    <DataCtx.Provider value={dataValue}>
      <EditCtx.Provider value={editValue}>
        <ToastCtx.Provider value={toastValue}>{children}</ToastCtx.Provider>
      </EditCtx.Provider>
    </DataCtx.Provider>
  );
}

/** Jobs/events/commands/UI — does NOT update on every keystroke of a staged edit. */
export function useStoreData() {
  const v = useContext(DataCtx);
  if (!v) throw new Error("useStoreData outside StoreProvider");
  return v;
}

/** Staged edits, dirty counts, save/discard, effective job overlays. */
export function useStoreEdit() {
  const v = useContext(EditCtx);
  if (!v) throw new Error("useStoreEdit outside StoreProvider");
  return v;
}

/** Toast flash only — subscribe here so banners don't re-render Jobs/chat/prompts. */
export function useStoreToast() {
  const v = useContext(ToastCtx);
  if (!v) throw new Error("useStoreToast outside StoreProvider");
  return v;
}

/** Full store (data + edits). Re-renders on either side — prefer the split hooks in shell widgets. */
export function useStore() {
  const data = useContext(DataCtx);
  const edit = useContext(EditCtx);
  const toastBag = useContext(ToastCtx);
  if (!data || !edit) throw new Error("useStore outside StoreProvider");
  // edit.jobs is the overlay-applied list (matches historical useStore().jobs).
  return useMemo(
    () => ({
      ...data,
      ...edit,
      ...(toastBag || {}),
      jobs: edit.jobs,
      rawJobs: edit.rawJobs,
    }),
    [data, edit, toastBag]
  );
}
