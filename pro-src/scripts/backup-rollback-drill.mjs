#!/usr/bin/env node
/**
 * #37 rollback drill: POST slot-2 stores to live, verify, then restore
 * pre-drill snapshot from drill-pre-f289ec3.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = "https://leelectrical.us/.netlify/functions";
const BK = join(homedir(), ".hermes/shared/lepro_backups");
const SLOT2 = join(BK, "slot-2/data");
const DRILL_PRE = join(BK, "drill-pre-f289ec3/data");
const REPORT_DIR = join(process.cwd(), "docs/backup-drill");

async function getJson(endpoint) {
  const res = await fetch(`${BASE}/${endpoint}?cb=${Date.now()}`);
  if (!res.ok) throw new Error(`GET ${endpoint} → HTTP ${res.status}`);
  return res.json();
}

async function postJson(endpoint, body) {
  const res = await fetch(`${BASE}/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${endpoint} → HTTP ${res.status}`);
  return res.json();
}

function loadStoreFile(dir, name) {
  const p = join(dir, name);
  if (!existsSync(p)) throw new Error(`missing ${p}`);
  return JSON.parse(readFileSync(p, "utf8"));
}

function summarizeJobs(doc) {
  return {
    jobs: Array.isArray(doc.jobs) ? doc.jobs.length : 0,
    syncedAt: doc.syncedAt || 0,
    ts: doc.ts || 0,
  };
}

function summarizeState(doc) {
  return { ovKeys: Object.keys(doc.ov || {}).length, ts: doc.ts || 0 };
}

async function restoreJobsFrom(dir) {
  const doc = loadStoreFile(dir, "jobsdata.json");
  if (doc.error) throw new Error("jobsdata backup is error stub");
  await postJson("jobsdata", { op: "set", jobs: doc.jobs || [] });
  return doc;
}

async function restoreStateFrom(dir) {
  const doc = loadStoreFile(dir, "state.json");
  if (doc.error) throw new Error("state backup is error stub");
  await postJson("state", { ov: doc.ov || {} });
  return doc;
}

async function main() {
  console.log("=== #37 Rollback drill (slot-2 → verify → drill-pre restore) ===");

  const before = {
    jobsdata: await getJson("jobsdata"),
    state: await getJson("state"),
  };
  console.log("Live before:", summarizeJobs(before.jobsdata), summarizeState(before.state));

  console.log("→ Rollback: POST slot-2 jobsdata + state");
  const slot2Jobs = await restoreJobsFrom(SLOT2);
  const slot2State = await restoreStateFrom(SLOT2);

  const afterRollback = {
    jobsdata: await getJson("jobsdata"),
    state: await getJson("state"),
  };
  console.log("Live after slot-2:", summarizeJobs(afterRollback.jobsdata), summarizeState(afterRollback.state));

  const jobsOk = summarizeJobs(afterRollback.jobsdata).jobs === summarizeJobs(slot2Jobs).jobs;
  const stateOk = summarizeState(afterRollback.state).ovKeys === summarizeState(slot2State).ovKeys;
  if (!jobsOk || !stateOk) {
    throw new Error(`slot-2 verify failed jobsOk=${jobsOk} stateOk=${stateOk}`);
  }
  console.log("✓ slot-2 rollback verified");

  console.log("→ Restore pre-drill snapshot from drill-pre-f289ec3");
  const preJobs = await restoreJobsFrom(DRILL_PRE);
  const preState = await restoreStateFrom(DRILL_PRE);

  const afterRestore = {
    jobsdata: await getJson("jobsdata"),
    state: await getJson("state"),
  };
  console.log("Live after restore:", summarizeJobs(afterRestore.jobsdata), summarizeState(afterRestore.state));

  const restoreJobsOk = summarizeJobs(afterRestore.jobsdata).jobs === summarizeJobs(preJobs).jobs;
  const restoreStateOk = summarizeState(afterRestore.state).ovKeys === summarizeState(preState).ovKeys;
  if (!restoreJobsOk || !restoreStateOk) {
    throw new Error(`drill-pre restore failed jobsOk=${restoreJobsOk} stateOk=${restoreStateOk}`);
  }

  mkdirSync(REPORT_DIR, { recursive: true });
  const report = {
    ts: new Date().toISOString(),
    ok: true,
    before: { jobsdata: summarizeJobs(before.jobsdata), state: summarizeState(before.state) },
    slot2: { jobsdata: summarizeJobs(slot2Jobs), state: summarizeState(slot2State) },
    afterRollback: { jobsdata: summarizeJobs(afterRollback.jobsdata), state: summarizeState(afterRollback.state) },
    drillPre: { jobsdata: summarizeJobs(preJobs), state: summarizeState(preState) },
    afterRestore: { jobsdata: summarizeJobs(afterRestore.jobsdata), state: summarizeState(afterRestore.state) },
  };
  const out = join(REPORT_DIR, "ROLLBACK_DRILL_REPORT.json");
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`DRILL OK — pre-drill state restored. report=${out}`);
}

main().catch((e) => {
  console.error("ROLLBACK DRILL FAILED:", e.message || e);
  process.exit(1);
});