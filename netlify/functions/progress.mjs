import { getStore } from "@netlify/blobs";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Dev Progress dashboard — serves dev_progress_data.json shape.
// GET returns blob snapshot (daily refresh via host script POST op:replace).
// POST op:refresh re-reads bundled snapshot; op:replace stores fresh data from cron.
const KEY = "dev-progress-v1";
const DAY = 24 * 60 * 60 * 1000;

const __dir = dirname(fileURLToPath(import.meta.url));

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

function loadSnapshot() {
  try {
    const raw = readFileSync(join(__dir, "dev_progress_snapshot.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      meta: { agent: "Israel (Grok Build)", project: "LE Pro", generated_at: new Date().toISOString() },
      totals: { updates: 0, commits: 0, lines_written: 0, lines_implemented: 0, active_time_hms: "0:00:00", deploys: 0, money_saved_usd: 0 },
      updates: [],
    };
  }
}

async function loadProgress(store) {
  return (await store.get(KEY, { type: "json" })) || null;
}

export default async (req) => {
  const store = getStore("progress");
  if (req.method === "OPTIONS") return json({ ok: true });

  if (req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch {
      /* empty */
    }
    if (body.op === "replace" && body.data) {
      const next = { ...body.data, updatedAt: Date.now() };
      await store.setJSON(KEY, next);
      return json(next);
    }
    const snap = (await loadProgress(store)) || loadSnapshot();
    const next = { ...snap, updatedAt: Date.now() };
    await store.setJSON(KEY, next);
    return json(next);
  }

  let doc = await loadProgress(store);
  if (!doc) {
    doc = { ...loadSnapshot(), updatedAt: Date.now() };
    await store.setJSON(KEY, doc);
  } else if (!doc.updatedAt || Date.now() - doc.updatedAt > DAY) {
    doc = { ...loadSnapshot(), ...doc, updatedAt: Date.now() };
    await store.setJSON(KEY, doc);
  }
  return json(doc);
};