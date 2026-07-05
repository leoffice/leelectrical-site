// NetlifyStoreAdapter — the DEFAULT, working-today backend.
// Talks to the existing Netlify Functions used by the dashboard:
//   jobsdata  base jobs synced from QuickBooks/Calendar
//   state     user-edit overlay { ov: { [jobId]: patch } }
//   command   durable command bus (queued/working/done/failed/needs_approval)
//   calendar  upcoming Google Calendar events
//   devtasks  shared development task list
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

export function createNetlifyAdapter() {
  return {
    name: "netlify",

    /** Merged view: jobsdata.jobs + state.ov (overlay wins). */
    async listJobs() {
      const [data, state] = await Promise.all([http("jobsdata"), http("state")]);
      return mergeJobs(data.jobs || [], (state && state.ov) || {});
    },

    async getJob(id) {
      const jobs = await this.listJobs();
      return jobs.find((j) => String(j.id) === String(id)) || null;
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
      const d = await http("command");
      const all = d.commands || [];
      return jobId == null ? all : all.filter((c) => String(c.jobId) === String(jobId));
    },

    /** Durable command with idempotency — a retry can never double-send. */
    async enqueueCommand(type, jobId, payload, lane, idempotencyKey) {
      const command = {
        type,
        jobId,
        payload: payload || {},
        lane: lane || "judgment",
        idempotencyKey: idempotencyKey || `${type}|${jobId}|${Date.now()}`,
      };
      const d = await http("command", { op: "enqueue", command });
      return d.command;
    },

    async listEvents() {
      const d = await http("calendar");
      return d.events || [];
    },

    async listDevTasks() {
      const d = await http("devtasks");
      return d.tasks || [];
    },
  };
}
