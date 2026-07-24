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
import { buildInvoicePdfFromJob, buildEstimatePdfFromJob } from "../lib/invoicePdf.js";
import { downloadPdfBlob } from "../lib/pdfOpen.js";
import { docPdfFilename } from "../lib/jobToQbDoc.js";

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

/** Like http(), but keeps JSON bodies on 4xx/5xx (send-doc-email dry-run / no_api_key). */
async function httpAllowErrorBody(path, body) {
  const res = await fetch(`${base()}/${path}`, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (data && typeof data === "object") {
    return { ...data, httpStatus: res.status, ok: data.ok === true };
  }
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return data;
}

const cb = () => "cb=" + Date.now();

// ---- Conditional (ETag) GET for the big read-heavy blobs --------------------
// jobsdata (~20 MB) and state are polled every 60s (plus focus + action
// refreshes). The server tags each with an ETag off its write-ts; we hold the
// last {etag, data} per path and send If-None-Match, so an unchanged blob comes
// back as a bodyless 304 and we reuse the cached parse — turning a repeated
// multi-MB transfer into a few bytes. NO cache-buster here (a unique URL would
// defeat revalidation) and NO browser HTTP cache (cache:no-store) — we manage
// the entity tag ourselves, which stays predictable across browsers and is
// exercisable in tests. Correctness is unchanged: every poll still revalidates
// against the server; 304 means the document is byte-identical to what we hold.
const condCache = new Map(); // path -> { etag, data }
async function httpConditional(path) {
  const entry = condCache.get(path);
  const res = await fetch(`${base()}/${path}`, {
    method: "GET",
    cache: "no-store",
    headers: entry && entry.etag ? { "if-none-match": entry.etag } : undefined,
  });
  if (res.status === 304 && entry) return entry.data;
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const data = await res.json();
  const etag = res.headers && typeof res.headers.get === "function" ? res.headers.get("etag") : null;
  if (etag) condCache.set(path, { etag, data });
  return data;
}

/** Blob → bare base64 string (no data-URL prefix) for JSON transport. */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.onloadend = () => {
      const s = String(reader.result || "");
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    reader.readAsDataURL(blob);
  });
}

export function createNetlifyAdapter() {
  // saveJob is fetch-latest -> merge -> post; two CONCURRENT saves could
  // clobber each other's keys (e.g. convert-to-job writes the new job and
  // the _sasTickets mark back-to-back). Serialize them per adapter.
  let saveQ = Promise.resolve();
  // ts of our latest state POST. Netlify Blobs is eventually consistent, so a
  // GET right after our own write can return the PREVIOUS snapshot — merging
  // into that (saveJob) or rendering it (refresh) silently reverts edits.
  let lastWriteTs = 0;
  // The full overlay map from our last successful POST. Used to reconstruct a
  // correct view WITHOUT blocking when a read comes back stale (see freshState).
  let lastOv = null;
  // Return the freshest overlay we can WITHOUT sleeping. The old implementation
  // re-GET-and-slept (350+700+1050ms ≈ 2.1s) on every save after the first,
  // waiting for the blob to reflect our own last write — a built-in 1–2s stall
  // on the save path. Instead: read once, and if that read predates our own last
  // write (stale blob), re-apply our last-known overlay on top. This is only
  // done when stale — a read whose ts is current is authoritative and may carry
  // another device's newer edits, which we must never clobber. Cross-device
  // safety is unchanged (the retry loop only ever waited for the CALLER'S own
  // write; other devices' concurrent writes were reconciled by the next poll,
  // and still are).
  const freshState = async () => {
    const state = (await http(`state?${cb()}`)) || { ov: {}, ts: 0 };
    if (lastWriteTs && (state.ts || 0) < lastWriteTs && lastOv) {
      const ov = { ...((state && state.ov) || {}) };
      for (const k of Object.keys(lastOv)) {
        ov[k] = deepMerge(ov[k] || {}, lastOv[k]);
      }
      return { ...state, ov, ts: lastWriteTs };
    }
    return state;
  };
  // POST the full overlay and remember it, so the next stale read can be
  // reconstructed from memory instead of waiting for the blob to converge.
  const postState = async (ov) => {
    const res = await http("state", { ov });
    if (res && res.ts) lastWriteTs = Math.max(lastWriteTs, res.ts);
    lastOv = ov;
    return res;
  };
  return {
    name: "netlify",

    /** Merged view + sync metadata: jobsdata.jobs + state.ov (overlay wins). */
    async listJobsMeta() {
      const [data, state] = await Promise.all([httpConditional("jobsdata"), httpConditional("state")]);
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
        const res = await postState(ov);
        return { ok: true, ts: res && res.ts, ov: ov[id] };
      };
      const p = saveQ.then(run, run);
      saveQ = p.catch(() => {}); // one failure must not wedge the queue
      return p;
    },

    async listCommands(jobId) {
      const d = await httpConditional("command");
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

    /**
     * Generate invoice/estimate PDF fully CLIENT-SIDE (no server).
     * After Cloudflare cutover the old generate-doc/pdfkit path is dead —
     * hanging on "Generating your PDF…" forever. Build in the browser and
     * download. opts.download === false validates/prewarms without a download.
     */
    async generateLocalDoc(job, kind = "invoice", opts = {}) {
      try {
        const blob = kind === "estimate" ? await buildEstimatePdfFromJob(job) : await buildInvoicePdfFromJob(job);
        if (!blob) return { ok: false, error: "no_pdf" };
        const no = kind === "invoice" ? job?.invoiceNo : job?.estimateNo;
        if (opts.download !== false) {
          const filename = docPdfFilename(kind, job, no) || `${kind}-${String(no || "document")}.pdf`;
          downloadPdfBlob(blob, filename);
        }
        return { ok: true, clientGenerated: true, docNumber: String(no || "").trim(), bytes: blob.size };
      } catch (err) {
        return { ok: false, error: String(err?.message || err) };
      }
    },

    /**
     * Send invoice/estimate email with CLIENT-generated PDF attached.
     * opts: { email, includePaymentLink, payUrl, probe, officeOnly }
     */
    async sendDocEmailNow(job, kind = "invoice", opts = {}) {
      try {
        const no = kind === "invoice" ? job?.invoiceNo : job?.estimateNo;
        let pdfB64 = "";
        let filename = "";
        if (!opts.probe) {
          const overrides = kind === "estimate" ? { kind: "estimate" } : {};
          if (opts.payUrl) overrides.payUrl = opts.payUrl;
          const blob =
            kind === "estimate"
              ? await buildEstimatePdfFromJob(job, overrides)
              : await buildInvoicePdfFromJob(job, overrides);
          if (!blob) return { ok: false, error: "no_pdf" };
          pdfB64 = await blobToBase64(blob);
          filename = docPdfFilename(kind, job, no) || `${kind}-${String(no || "document")}.pdf`;
        }
        return await httpAllowErrorBody("send-doc-email", {
          kind,
          job,
          email: String(opts.email || job?.email || "").trim(),
          includePaymentLink: opts.includePaymentLink !== false,
          pdfB64,
          filename,
          message: opts.message || opts.topMessage || "",
          subject: opts.subject || "",
          probe: !!opts.probe,
          officeOnly: !!opts.officeOnly,
        });
      } catch (err) {
        // Cloudflare often returns bare "error code: 502" (not JSON) when Resend is
        // missing — surface a stable reason so the app queues office-Gmail fallback.
        const msg = String(err?.message || err);
        const is502 = /HTTP 502|502/.test(msg);
        return {
          ok: false,
          error: msg,
          reason: is502 ? "no_api_key" : "send_failed",
          dryRun: is502,
        };
      }
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
      const state = await httpConditional("state");
      const ov = (state && state.ov) || {};
      return isPlainObject(ov._sasTickets) ? ov._sasTickets : {};
    },

    /** Customer pay-page checks + bank Zelle alerts waiting for Levi to approve.
     *  ov._pendingPayments = { items: [...], ts } — reserved key (not a job). */
    async getPendingPayments() {
      const state = await httpConditional("state");
      const ov = (state && state.ov) || {};
      const row = ov._pendingPayments;
      if (Array.isArray(row)) return row.filter(Boolean);
      if (isPlainObject(row) && Array.isArray(row.items)) return row.items.filter(Boolean);
      return [];
    },

    async savePendingPayments(items) {
      const list = Array.isArray(items) ? items.filter(Boolean).slice(-40) : [];
      return this.saveJob("_pendingPayments", { items: list, ts: Date.now() });
    },

    /** Mark one ticket handled/dismissed (deep-merged, same path as saveJob). */
    async markSasTicket(callId, patch) {
      return this.saveJob("_sasTickets", { [callId]: patch || { handled: true } });
    },

    /** Big-project requisitions — ov._projects (reserved key). */
    async getProjects() {
      const state = await httpConditional("state");
      const ov = (state && state.ov) || {};
      return isPlainObject(ov._projects) ? ov._projects : { list: [] };
    },

    async saveProjects(projects) {
      return this.saveJob("_projects", projects || { list: [] });
    },

    /** "Separate customers" / parent-sub decisions — ov._nomerge (reserved key). */
    async getNomergePairs() {
      const state = await httpConditional("state");
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
      await postState(ov);
      return { ok: true };
    },

    /** Check/Zelle photo learning — ov._paymentVisionLearning (reserved key). */
    async getPaymentVisionLearning() {
      const state = await freshState();
      const ov = (state && state.ov) || {};
      return Array.isArray(ov._paymentVisionLearning) ? ov._paymentVisionLearning : [];
    },

    async appendPaymentVisionFeedback(entry) {
      if (!entry || !Array.isArray(entry.deltas) || !entry.deltas.length) return { ok: false };
      const state = await freshState();
      const ov = (state && state.ov) || {};
      const cur = Array.isArray(ov._paymentVisionLearning) ? ov._paymentVisionLearning : [];
      ov._paymentVisionLearning = cur.concat([{ ...entry, ts: Date.now() }]).slice(-200);
      await postState(ov);
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
      const d = await httpConditional("calendar");
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

    /** Tenant / white-label settings (when settings function is live). */
    async getSettings() {
      return http(`settings?${cb()}`);
    },

    async saveSettings(doc) {
      return http("settings", {
        op: "set",
        profile: doc?.profile,
        features: doc?.features,
        // tenant_config (branding / plan / module overrides / agencies).
        // `internal` inside this payload is ignored by the server.
        tenant: doc?.tenant,
      });
    },

    /** Agent access grant (time-boxed one-time codes). */
    async agentAccessStatus() {
      return http(`agent-access?${cb()}`);
    },

    async agentAccessOp(body) {
      return http("agent-access", body);
    },
  };
}
