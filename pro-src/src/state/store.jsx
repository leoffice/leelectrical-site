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
import { calendarServiceLocation } from "../lib/customerSync.js";
import { fmt$, parseAmount, todayStr } from "../lib/format.js";
import { normalizePayments } from "../lib/payments.js";
import { unhandledCount } from "../lib/sas.js";
import { customerSyncPayload, qboCustomerToJobPatch } from "../lib/customerSync.js";
import { runDailyDedupeScan } from "../lib/dedupeScan.js";
import {
  calendarUpsertLinksJob,
  isCalendarUnlinkCommand,
  isPendingCalEventId,
  jobIdFromEventDescription,
  parseCalendarUpsertResult,
} from "../lib/calendarLink.js";

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
  const [eventsSyncedAt, setEventsSyncedAt] = useState(0);
  const [commands, setCommands] = useState([]);
  const [devTasks, setDevTasks] = useState([]);
  const [sasCalls, setSasCalls] = useState([]); // SAS inbound lead tickets
  const [sasTickets, setSasTickets] = useState({}); // ov._sasTickets handled-state map
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
  const lastSavedTs = useRef(0); // ts of our latest overlay save (see refreshJobs)
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
      if (!stale && (incoming.length || !jobsCountRef.current)) setJobs(incoming);
      setSyncedAt(meta.syncedAt || 0);
      setError("");
      return meta;
    } catch (e) {
      setError(String((e && e.message) || e));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCommands = useCallback(async () => {
    try {
      setCommands(await api.listCommands());
    } catch {}
  }, []);

  const appliedCalUpserts = useRef(new Set());
  const appliedFetchPayments = useRef(new Set());

  const refreshEvents = useCallback(async ({ pull = false, awaitPull = true } = {}) => {
    try {
      const meta = await api.listEventsMeta();
      setEvents(meta.events || []);
      setEventsSyncedAt(meta.syncedAt || 0);
      if (pull && api.pullCalendar) {
        const run = async () => {
          const evs = await api.pullCalendar();
          setEvents(evs);
          const m = await api.listEventsMeta();
          setEventsSyncedAt(m.syncedAt || 0);
        };
        if (awaitPull) await run();
        else run().catch(() => {});
      }
    } catch {}
  }, []);

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
      setDevTasks(await api.listDevTasks());
    } catch {}
  }, []);

  /** SAS lead tickets + their handled-state (ov._sasTickets). */
  const refreshSas = useCallback(async () => {
    try {
      const [calls, tickets] = await Promise.all([api.listSasCalls(), api.getSasTickets()]);
      setSasCalls(Array.isArray(calls) ? calls : []);
      setSasTickets(tickets || {});
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
      ]);
    },
    [refreshJobs, refreshEvents, refreshCommands, refreshDev, refreshSas]
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
    const vis = () => {
      if (!document.hidden) {
        refreshJobs(true);
        refreshEvents({ pull: false });
        refreshEvents({ pull: true, awaitPull: false });
        refreshCommands();
        refreshSas();
      }
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      [t1, t2, t3, t4, t5, t6].forEach(clearInterval);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [refresh, refreshJobs, refreshCommands, refreshDev, refreshEvents, refreshSas]);

  /** Once-daily customer + invoice dedupe scan after jobs load. */
  useEffect(() => {
    if (loading) return;
    const scan = runDailyDedupeScan(jobs);
    setDedupeScan(scan);
    if (scan.ran && (scan.customerCount > 0 || scan.invoiceCount > 0)) {
      const parts = [];
      if (scan.customerCount) parts.push(scan.customerCount + " customer pair" + (scan.customerCount === 1 ? "" : "s"));
      if (scan.invoiceCount) parts.push(scan.invoiceCount + " invoice dupe" + (scan.invoiceCount === 1 ? "" : "s"));
      showToast("Daily dedupe scan — " + parts.join(", "));
    }
  }, [jobs, loading]); // eslint-disable-line react-hooks/exhaustive-deps

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
        refresh(true, { pullCalendar: true, awaitPull: false }),
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

      for (const [id, patch] of entries) {
        const r = await api.saveJob(id, patch);
        if (r && r.ts) lastSavedTs.current = Math.max(lastSavedTs.current, r.ts);
        setJobs((js) => js.map((j) => (String(j.id) === String(id) ? applyOverlay(j, patch) : j)));
      }
      setPending({});
      showToast("Saved ✓ synced to all devices");

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
        await enqueueRef.current(
          "record_payment",
          j.id,
          {
            invoiceNo: j.invoiceNo,
            amount: pay.amount,
            method: pay.method || "",
            ref: pay.ref || "",
            date: pay.date || todayStr(),
          },
          "deterministic",
          idem
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
        const r = await api.saveJob(id, patch);
        if (r && r.ts) lastSavedTs.current = Math.max(lastSavedTs.current, r.ts);
      } catch (e) {
        showToast("Sync failed — will retry on next save");
      }
    },
    [showToast]
  );

  // When calendar_upsert finishes on the Mac, store the real Google event id on the job.
  useEffect(() => {
    for (const cmd of commands || []) {
      if (cmd.type !== "calendar_upsert" || cmd.status !== "done") continue;
      const mark = String(cmd.id || cmd.idempotencyKey || "");
      if (!mark || appliedCalUpserts.current.has(mark)) continue;

      const eventId = parseCalendarUpsertResult(cmd.result)?.eventId;
      if (!eventId || !cmd.jobId) continue;

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
      setEvents((evs) => {
        const jid = String(cmd.jobId);
        const pending = evs.find(
          (e) => isPendingCalEventId(e.id) && jobIdFromEventDescription(e.description) === jid
        );
        const rest = evs.filter(
          (e) => !(isPendingCalEventId(e.id) && jobIdFromEventDescription(e.description) === jid)
        );
        if (rest.some((e) => String(e.id) === String(eventId))) return rest;
        return pending ? rest.concat([{ ...pending, id: eventId }]) : rest;
      });
    }
  }, [commands, jobs, patchAndSave]);

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
      else if (choice === "pull_qbo") showToast("Updated LE Pro from QuickBooks");
      else showToast("Approved — running…");
    },
    [commands, effectiveJob, enqueue, patchAndSave, refreshCommands, showToast]
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
      const serviceAddr = g.serviceAddress || g.address || "";
      const ov = {
        _new: true,
        customer: g.businessName || g.customer || "",
        businessName: g.businessName || g.customer || "",
        personName: g.personName || "",
        title: g.title || "",
        amount: g.amount ? fmt$(g.amount) : "",
        phone: g.phone || "",
        email: g.email || "",
        address: serviceAddr,
        serviceAddress: serviceAddr,
        apartment: g.apartment || "",
        billingAddress: g.billingAddress || "",
        qboCustomerId: g.qboCustomerId || "",
        description: g.description || "",
        estimateNo: g.estimateNo || "",
        invoiceNo: g.invoiceNo || "",
        paid: false,
        notes: "",
        followUp: { text: "", date: "" },
        status,
        calEventId: calEventId || "",
      };
      setJobs((js) => [...js, { id, ...JSON.parse(JSON.stringify(ov)) }]);
      api
        .saveJob(id, ov)
        .then((r) => {
          if (r && r.ts) lastSavedTs.current = Math.max(lastSavedTs.current, r.ts);
        })
        .catch(() => showToast("Offline — job kept locally"));
      if (g.date) {
        enqueueRef.current(
          "calendar_upsert",
          id,
          {
            calEventId: calEventId || "",
            summary: (g.title || "Job") + " — " + (g.customer || ""),
            start: g.date,
            location: calendarServiceLocation({ serviceAddress: serviceAddr, apartment: g.apartment, billingAddress: g.billingAddress }),
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

  const value = {
    jobs: effectiveJobs,
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
    refreshSas,
    markSasHandled,
    pending,
    dirtyCount,
    dirtyJobs,
    syncedAt,
    busy,
    syncProgress,
    dedupeScan,
    loading,
    saving,
    error,
    toast,
    docConfirm,
    showDocConfirm,
    newJob,
    setNewJob,
    leaveReq,
    setLeaveReq,
    chatOpen,
    setChatOpen,
    chatUnread,
    setChatUnread,
    toggleChat,
    guardNav,
    refresh,
    refreshCommands,
    refreshDev,
    syncNow,
    patchJob,
    patchAndSave,
    patchLocalEvent,
    removeLocalEvent,
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
