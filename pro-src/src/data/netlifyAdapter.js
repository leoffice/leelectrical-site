// NetlifyStoreAdapter — the DEFAULT, working-today backend.
// Talks to the existing Netlify Functions used by the dashboards:
//   jobsdata  base jobs synced from QuickBooks/Calendar (POST op:request = fresh pull)
//   state     user-edit overlay { ov: { [jobId]: patch } }
//   command   durable command bus (queued/working/done/failed/needs_approval)
//   calendar  upcoming Google Calendar events
//   devtasks  shared development task list (op:add / op:patch)
//   chat      floating-bubble conversations (op:msg)
//   iterate   nudges Dispatch to look at the message
import { deepMerge, isPlainObject, mergeJobs } from "./merge.js";
import { functionsBase } from "../lib/functionsBase.js";

const base = functionsBase;

async function http(path, body) {
  const res = await fetch(`${base()}/${path}`, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const cb = () => "cb=" + Date.now();

export function createNetlifyAdapter() {
  // saveJob is fetch-latest -> merge -> post; two CONCURRENT saves could
  // clobber each other's keys (e.g. convert-to-job writes the new job and
  // the _sasTickets mark back-to-back). Serialize them per adapter.
  let saveQ = Promise.resolve();
  // ts of our latest state POST. Netlify Blobs is eventually consistent, so a
  // GET right after our own write can return the PREVIOUS snapshot — merging
  // into that (saveJob) or rendering it (refresh) silently reverts edits.
  let lastWriteTs = 0;
  const freshState = async () => {
    for (let i = 0; ; i++) {
      const state = (await http(`state?${cb()}`)) || { ov: {}, ts: 0 };
      if (!lastWriteTs || (state.ts || 0) >= lastWriteTs || i >= 3) return state;
      await new Promise((r) => setTimeout(r, 350 * (i + 1))); // blob lag — retry
    }
  };
  return {
    name: "netlify",

    /** Merged view + sync metadata: jobsdata.jobs + state.ov (overlay wins). */
    async listJobsMeta() {
      const [data, state] = await Promise.all([http(`jobsdata?${cb()}`), http(`state?${cb()}`)]);
      return {
        jobs: mergeJobs(data.jobs || [], (state && state.ov) || {}),
        syncedAt: data.syncedAt || 0,
        stateTs: (state && state.ts) || 0,
      };
    },

    async listJobs() {
      return (await this.listJobsMeta()).jobs;
    },

    async getJob(id) {
      const jobs = await this.listJobs();
      return jobs.find((j) => String(j.id) === String(id)) || null;
    },

    /** Ask the pipeline for a fresh QuickBooks pull (sleek's syncNow). */
    async requestSync() {
      return http("jobsdata", { op: "request" });
    },

    /** Request a QBO jobs pull, then poll until syncedAt advances. */
    async pullJobs(opts = {}) {
      const testMode = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.MODE === "test";
      // QBO pull can take ~60–90s (open invoices + paid-status checks).
      const maxWaitMs = opts.maxWaitMs ?? (testMode ? 80 : 120000);
      const intervalMs = opts.intervalMs ?? (testMode ? 15 : 2500);
      const before = await this.listJobsMeta();
      await this.requestSync().catch(() => {});
      const deadline = Date.now() + maxWaitMs;
      let last = before;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, intervalMs));
        last = await this.listJobsMeta();
        if (last.syncedAt > before.syncedAt) return last;
      }
      return last;
    },

    /** Deep-merge `patch` into ov[id], then POST the full { ov } back.
     *  Fetch-latest -> merge -> post keeps the clobber window minimal
     *  (the store itself is last-write-wins). */
    async saveJob(id, patch) {
      const run = async () => {
        const state = await freshState();
        const ov = (state && state.ov) || {};
        ov[id] = deepMerge(ov[id] || {}, patch || {});
        const res = await http("state", { ov });
        if (res && res.ts) lastWriteTs = Math.max(lastWriteTs, res.ts);
        return { ok: true, ts: res && res.ts, ov: ov[id] };
      };
      const p = saveQ.then(run, run);
      saveQ = p.catch(() => {}); // one failure must not wedge the queue
      return p;
    },

    async listCommands(jobId) {
      const d = await http(`command?${cb()}`);
      const all = d.commands || [];
      return jobId == null ? all : all.filter((c) => String(c.jobId) === String(jobId));
    },

    /** Durable command with idempotency — a retry can never double-send.
     *  Returns { command, deduped } (deduped = idempotency key already seen). */
    async enqueueCommand(type, jobId, payload, lane, idempotencyKey) {
      const command = {
        type,
        jobId,
        payload: payload || {},
        lane: lane || "judgment",
        idempotencyKey: idempotencyKey || `${type}:${jobId}:${new Date().toISOString().slice(0, 10)}`,
      };
      const d = await http("command", { op: "enqueue", command });
      return { command: d.command, deduped: !!d.deduped };
    },

    /** Patch a command (retry, approval resolution). */
    async updateCommand(id, patch, note) {
      return http("command", { op: "update", id, patch, note });
    },

    /** Generate invoice/estimate PDF locally (le-invoice-suite) and store in docs. */
    async generateLocalDoc(job, kind = "invoice") {
      const res = await fetch(`${base()}/generate-doc`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, job }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        /* ignore */
      }
      return { ok: !!(res.ok && data.ok), ...data };
    },

    /** Fetch a stored PDF from the docs fn. Returns a Blob, or null while the
     *  document isn't there yet (404 / JSON error body). */
    async getDoc(key) {
      const res = await fetch(`${base()}/docs?key=${encodeURIComponent(key)}&${cb()}`, {
        cache: "no-store",
      });
      if (!res.ok) return null;
      const ct = (res.headers && res.headers.get && res.headers.get("content-type")) || "";
      if (ct.includes("application/json")) return null;
      return res.blob();
    },

    /** SAS answering-service inbound call tickets (LEADS — never QBO). */
    async listSasCalls() {
      const d = await http(`sas-inbound?${cb()}`);
      return d.calls || [];
    },

    /** Pending email insights (Energy Services / Con Edison). */
    async listEmailInsights({ pendingOnly = false } = {}) {
      const qs = pendingOnly ? "pending=1&" + cb() : cb();
      const d = await http(`email-insights?${qs}`);
      return d.insights || [];
    },

    async patchEmailInsight(id, patch) {
      return http("email-insights", { op: "patch", id, patch: patch || {} });
    },

    async ingestEmailInsight(email, jobs) {
      return http("email-insights", { op: "ingest_raw", email: email || {}, jobs: jobs || [] });
    },

    /** Handled-state map for SAS tickets — lives in the ov overlay under the
     *  RESERVED key ov._sasTickets = { [callId]: { handled, jobId?, ts } }.
     *  mergeJobs() skips "_"-prefixed overlay keys, so this never renders
     *  as a phantom job. */
    async getSasTickets() {
      const state = await http(`state?${cb()}`);
      const ov = (state && state.ov) || {};
      return isPlainObject(ov._sasTickets) ? ov._sasTickets : {};
    },

    /** Mark one ticket handled/dismissed (deep-merged, same path as saveJob). */
    async markSasTicket(callId, patch) {
      return this.saveJob("_sasTickets", { [callId]: patch || { handled: true } });
    },

    /** Big-project requisitions — ov._projects (reserved key). */
    async getProjects() {
      const state = await http(`state?${cb()}`);
      const ov = (state && state.ov) || {};
      return isPlainObject(ov._projects) ? ov._projects : { list: [] };
    },

    async saveProjects(projects) {
      return this.saveJob("_projects", projects || { list: [] });
    },

    /** "Separate customers" / parent-sub decisions — ov._nomerge (reserved key). */
    async getNomergePairs() {
      const state = await http(`state?${cb()}`);
      const ov = (state && state.ov) || {};
      const v = ov._nomerge;
      return Array.isArray(v) ? v.filter(Boolean) : [];
    },

    async saveNomergePairs(pairs) {
      const list = Array.isArray(pairs) ? [...new Set(pairs.filter(Boolean))] : [];
      return this.saveJob("_nomerge", list);
    },

    /** Agent invoice-edit learning loop — ov._invoiceEditLearning (reserved key). */
    async appendInvoiceEditFeedback(entry) {
      const state = await freshState();
      const ov = (state && state.ov) || {};
      const cur = Array.isArray(ov._invoiceEditLearning) ? ov._invoiceEditLearning : [];
      ov._invoiceEditLearning = cur.concat([{ ...entry, ts: Date.now() }]).slice(-200);
      const res = await http("state", { ov });
      if (res && res.ts) lastWriteTs = Math.max(lastWriteTs, res.ts);
      return { ok: true };
    },

    /** Customer index for the New Job smart search (#49) + the Jobs-tab
     *  QBO customer search (#56). GET /customers -> { customers:[{name,id,...}] };
     *  GET /customers?q=<query> -> top ~12 matches (name, person, phone, email)
     *  (empty on any error — search must never break the form). */
    async searchCustomers(q) {
      try {
        const query = String(q || "").trim();
        const qs = query ? `q=${encodeURIComponent(query)}&${cb()}` : cb();
        const d = await http(`customers?${qs}`);
        return Array.isArray(d && d.customers) ? d.customers : [];
      } catch {
        return [];
      }
    },

    /** Full QuickBooks customer row by id — phone, email, billing address, etc. */
    async getCustomer(id) {
      try {
        const sid = String(id || "").trim();
        if (!sid) return null;
        const d = await http(`customers?id=${encodeURIComponent(sid)}&${cb()}`);
        return (d && d.customer) || null;
      } catch {
        return null;
      }
    },

    /** QuickBooks Products & Services for estimate/invoice line items. */
    async searchItems(q) {
      try {
        const query = String(q || "").trim();
        const qs = query ? `q=${encodeURIComponent(query)}&${cb()}` : cb();
        const d = await http(`items?${qs}`);
        return Array.isArray(d && d.items) ? d.items : [];
      } catch {
        return [];
      }
    },

    /** Google Places-style address completions (needs GOOGLE_PLACES_API_KEY on Netlify). */
    async suggestAddresses(q) {
      try {
        const query = String(q || "").trim();
        if (query.length < 3) return [];
        const d = await http(`address-suggest?q=${encodeURIComponent(query)}&${cb()}`);
        return Array.isArray(d && d.suggestions) ? d.suggestions : [];
      } catch {
        return [];
      }
    },

    async listEventsMeta() {
      const d = await http(`calendar?${cb()}`);
      return { events: d.events || [], syncedAt: d.syncedAt || 0, request: d.request || 0 };
    },

    async listEvents() {
      return (await this.listEventsMeta()).events;
    },

    /** Ask the host calendar puller for a fresh Google Calendar read. */
    async requestCalendarSync() {
      return http("calendar", { op: "request" });
    },

    /** Request a pull, then poll until syncedAt advances or timeout. */
    async pullCalendar(opts = {}) {
      const testMode = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.MODE === "test";
      const maxWaitMs = opts.maxWaitMs ?? (testMode ? 80 : 28000);
      const intervalMs = opts.intervalMs ?? (testMode ? 15 : 2000);
      const before = await this.listEventsMeta();
      await this.requestCalendarSync().catch(() => {});
      const deadline = Date.now() + maxWaitMs;
      let last = before;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, intervalMs));
        last = await this.listEventsMeta();
        if (last.syncedAt > before.syncedAt) return last.events;
        if (last.events.length !== before.events.length) return last.events;
      }
      return last.events;
    },

    async listDevTasks() {
      const d = await http(`devtasks?${cb()}`);
      return d.tasks || [];
    },

    async addDevTask(task) {
      return http("devtasks", { op: "add", task });
    },

    async patchDevTask(id, patch) {
      return http("devtasks", { op: "patch", id, patch });
    },

    async chatList(convo) {
      const d = await http(`chat?convo=${encodeURIComponent(convo)}&${cb()}`);
      return d.messages || [];
    },

    async chatSend(convo, id, text) {
      return http("chat", { op: "msg", convo, id, text });
    },

    /** Merge a legacy per-device thread into the shared cross-device convo. */
    async chatMigrate(from, to) {
      return http("chat", { op: "migrate", from, to });
    },

    /** Fire-and-forget heartbeat so Dispatch can see the app is open. */
    async presence(convo, view) {
      return http("chat", { op: "presence", convo, view });
    },

    /** Per-convo presence map { "<convo>": { lastSeen, view } } — includes
     *  the responder's "dispatch-heartbeat" slot ("Dispatch • online" dot). */
    async presenceMap() {
      return http(`chat?presence=1&${cb()}`);
    },

    async iterate(message, source, context) {
      const body = { message, source };
      if (context && typeof context === "object") body.context = context;
      return http("iterate", body);
    },

    /** Employee time tracking — clock in/out, job time, live board. */
    async timeTrackGet() {
      return http(`timetrack?${cb()}`);
    },

    async timeTrackOp(body) {
      return http("timetrack", body);
    },
  };
}
