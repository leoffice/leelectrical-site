import { getStore } from "./lib/storage/index.mjs";
import { rotateJsonBackup } from "./blob-backup.mjs";
import { conditionalJson, optionsResponse } from "./lib/etag.mjs";

// Live jobs dataset synced from QuickBooks + Google Calendar by a scheduled
// Dispatch job (overnight + midday) and on demand. The dashboard GETs this to
// render real jobs; "Sync now" POSTs op:"request" which the sync job fulfills.
// GET  -> { jobs:[...], syncedAt, request, ts }
// POST -> { op:"set", jobs:[...] }  (sync job writes the dataset)
//         { op:"request" }          (dashboard asks for a fresh pull)
const KEY = "jobsdata-v1";

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
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method === "POST") {
    let b = {};
    try { b = await req.json(); } catch (e) {}
    const doc = await load(store);
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
    doc.ts = Date.now();
    await rotateJsonBackup(store, KEY, doc);
    return json(doc);
  }
  // GET: ETag off `ts` so an unchanged ~20 MB blob revalidates to a bodyless 304
  // instead of re-transferring on every 60s poll / focus / action refresh.
  const doc = await load(store);
  return conditionalJson(req, doc, { prefix: "j", ts: doc.ts });
};
