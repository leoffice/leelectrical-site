import { getStore } from "./lib/storage/index.mjs";

// Development Task List store — ONE shared list shown on both Dashboard and Beta.
// Each task has target:{beta,dashboard}. Dashboard implies Beta (dashboard build
// auto-propagates to beta); Beta-only stays in beta until promoted.
// GET  -> { tasks:[...], seq, ts }
// POST -> { op, id?, task?, patch? }   ops: add | patch | remove
const KEY = "devtasks-v2";

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
  // strong consistency: avoid a stale read-modify-write clobbering a just-added task
  return (await store.get(KEY, { type: "json", consistency: "strong" })) || { tasks: [], seq: 0, ts: 0 };
}

export default async (req) => {
  const store = getStore("devtasks");
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method === "POST") {
    let b = {};
    try { b = await req.json(); } catch (e) {}
    const doc = await load(store);
    doc.tasks = doc.tasks || [];
    if (b.op === "add" && b.task) {
      doc.seq = (doc.seq || 0) + 1;
      const t = Object.assign(
        { status: "new", understanding: "", question: "", report: "", images: [], priority: "Normal", target: { beta: false, dashboard: false }, ts: Date.now() },
        b.task,
        { id: "t" + Date.now() + Math.random().toString(36).slice(2, 6), num: doc.seq }
      );
      doc.tasks.push(t);
    } else if (b.op === "patch" && b.id && b.patch) {
      const t = doc.tasks.find((x) => x.id === b.id);
      if (t) Object.assign(t, b.patch);
    } else if (b.op === "remove" && b.id) {
      doc.tasks = doc.tasks.filter((x) => x.id !== b.id);
    } else if (b.op === "replace" && Array.isArray(b.tasks)) {
      doc.tasks = b.tasks;
      doc.seq = b.seq || doc.seq || 0;
    }
    doc.ts = Date.now();
    await store.setJSON(KEY, doc);
    return json(doc);
  }
  return json(await load(store));
};
