// NetlifyStoreAdapter — the DEFAULT, working-today backend.
// Talks to the existing Netlify Functions used by the dashboards:
//   jobsdata  base jobs synced from QuickBooks/Calendar (POST op:request = fresh pull)
//   state     user-edit overlay { ov: { [jobId]: patch } }
//   command   durable command bus (queued/working/done/failed/needs_approval)
//   calendar  upcoming Google Calendar events
//   devtasks  shared development task list (op:add / op:patch)
//   chat      floating-bubble conversations (op:msg)
//   iterate   nudges Dispatch to look at the message
import { deepMerge, mergeJobs } from "./merge.js";

const REMOTE = "https://leelectrical.us/.netlify/functions";

function base() {
  // Same-origin in production (leelectrical.us); absolute URL for local dev
  // (the functions send access-control-allow-origin: *).
  if (typeof location !== "undefined" && /(^|\.)leelectrical\.us$/.test(location.hostname)) {
    return "/.netlify/functions";
  }
  return REMOTE;
}

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
  return {
    name: "netlify",

    /** Merged view + sync metadata: jobsdata.jobs + state.ov (overlay wins). */
    async listJobsMeta() {
      const [data, state] = await Promise.all([http(`jobsdata?${cb()}`), http("state")]);
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

    /** Deep-merge `patch` into ov[id], then POST the full { ov } back.
     *  Fetch-latest -> merge -> post keeps the clobber window minimal
     *  (the store itself is last-write-wins). */
    async saveJob(id, patch) {
      const state = await http("state");
      const ov = (state && state.ov) || {};
      ov[id] = deepMerge(ov[id] || {}, patch || {});
      const res = await http("state", { ov });
      return { ok: true, ts: res && res.ts, ov: ov[id] };
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

    async listEvents() {
      const d = await http("calendar");
      return d.events || [];
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

    /** Fire-and-forget heartbeat so Dispatch can see the app is open. */
    async presence(convo, view) {
      return http("chat", { op: "presence", convo, view });
    },

    /** Per-convo presence map { "<convo>": { lastSeen, view } } — includes
     *  the responder's "dispatch-heartbeat" slot ("Dispatch • online" dot). */
    async presenceMap() {
      return http(`chat?presence=1&${cb()}`);
    },

    async iterate(message, source) {
      return http("iterate", { message, source });
    },
  };
}
