import { getStore } from "./lib/storage/index.mjs";
import { rotateJsonBackup } from "./blob-backup.mjs";
import { auditJobs, checkAutogenTripwire, formatProblems } from "../../pro-src/src/lib/dataIntegrity.js";

// Live jobs dataset synced from QuickBooks + Google Calendar by a scheduled
// Dispatch job (overnight + midday) and on demand. The dashboard GETs this to
// render real jobs; "Sync now" POSTs op:"request" which the sync job fulfills.
// GET  -> { jobs:[...], syncedAt, request, ts }
// POST -> { op:"set", jobs:[...] }  (sync job writes the dataset)
//         { op:"request" }          (dashboard asks for a fresh pull)
const KEY = "jobsdata-v1";

// Busiest real day in the dataset is 18 new documents; 60 is well clear of
// legitimate volume while still catching a runaway fan-out.
const BULK_SYNC_SANITY_LIMIT = 60;

function json(o) {
  return new Response(JSON.stringify(o), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

async function load(store) {
  return (await store.get(KEY, { type: "json", consistency: "strong" })) ||
    { jobs: [], syncedAt: 0, request: 0, ts: 0 };
}

export default async (req) => {
  const store = getStore("jobsdata");
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method === "POST") {
    let b = {};
    try { b = await req.json(); } catch (e) {}
    const doc = await load(store);
    const prevJobs = doc.jobs || [];
    if (b.op === "set" && Array.isArray(b.jobs)) {
      doc.jobs = b.jobs;
      doc.syncedAt = Date.now();
      doc.request = 0;
    } else if (b.op === "merge" && Array.isArray(b.jobs)) {
      // Non-destructive sync (safe alongside manual edits): upsert by id, never
      // delete. User edits live in the ov overlay (state.mjs) and always win at
      // render time, so a merge can never clobber Levi's manual changes.
      const byId = new Map((doc.jobs || []).map((j) => [j.id, j]));
      for (const nj of b.jobs) {
        if (!nj || !nj.id) continue;
        const cur = byId.get(nj.id);
        byId.set(nj.id, cur ? Object.assign({}, cur, nj) : nj);
      }
      doc.jobs = [...byId.values()];
      doc.syncedAt = Date.now();
      doc.request = 0;
    } else if (b.op === "request") {
      doc.request = Date.now();
    }
    // Data-integrity gate. The fan-out tripwire BLOCKS the write (that is the
    // failure mode we cannot let reach the dataset); the softer invariants are
    // reported so the scheduled alerter surfaces them without ever wedging the
    // nightly QuickBooks sync on a pre-existing problem.
    if (b.op === "set" || b.op === "merge") {
      // The ">3 new invoices" rule applies to INCREMENTAL app writes (op:"merge"),
      // where "one transaction -> one estimate" holds. It must NOT gate op:"set":
      // that is the nightly full-dataset QuickBooks sync, and real invoice volume
      // exceeded 3/day on 323 of the last 1842 days — a flat limit there would
      // block the sync roughly one day in six. op:"set" gets a loose sanity bound
      // that only catches genuine runaway, and warns rather than blocks.
      const limit = b.op === "merge" ? undefined : BULK_SYNC_SANITY_LIMIT;
      const tripped = checkAutogenTripwire(prevJobs, doc.jobs, { limit });
      if (tripped.length && b.op === "merge") {
        console.error("[jobsdata] BLOCKED — autogen tripwire\n" + formatProblems(tripped));
        return json({ ok: false, blocked: true, problems: tripped });
      }
      if (tripped.length) {
        console.error("[jobsdata] bulk sync exceeded sanity bound\n" + formatProblems(tripped));
      }
      const problems = auditJobs(doc.jobs);
      if (problems.length) {
        console.warn("[jobsdata] integrity warnings\n" + formatProblems(problems));
        doc.integrityWarnings = problems.length;
      } else {
        delete doc.integrityWarnings;
      }
    }
    doc.ts = Date.now();
    await rotateJsonBackup(store, KEY, doc);
    return json(doc);
  }
  return json(await load(store));
};
