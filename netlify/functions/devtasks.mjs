import { getStore } from "@netlify/blobs";

// Development Task List store. Two separate lists: "dashboard" and "beta".
// GET  -> { lists:{dashboard:[...], beta:[...]}, ts }
// POST -> { op, list, id?, task?, patch? }  ops: add | patch | remove
//   add: server assigns num (max+1 within that list) and id; returns full doc
//   patch: Object.assign onto the task with matching id
//   remove: delete the task with matching id
const KEY = "devtasks-v1";

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
  return (await store.get(KEY, { type: "json" })) || { lists: { dashboard: [], beta: [] }, ts: 0 };
}

export default async (req) => {
  const store = getStore("devtasks");
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method === "POST") {
    let b = {};
    try { b = await req.json(); } catch (e) {}
    const doc = await load(store);
    const list = b.list === "beta" ? "beta" : "dashboard";
    doc.lists[list] = doc.lists[list] || [];
    const arr = doc.lists[list];
    if (b.op === "add" && b.task) {
      const num = arr.reduce((m, t) => Math.max(m, t.num || 0), 0) + 1;
      const t = Object.assign(
        { status: "new", understanding: "", report: "", images: [], priority: "Normal", ts: Date.now() },
        b.task,
        { id: "t" + Date.now() + Math.random().toString(36).slice(2, 6), num }
      );
      arr.push(t);
    } else if (b.op === "patch" && b.id && b.patch) {
      const t = arr.find((x) => x.id === b.id);
      if (t) Object.assign(t, b.patch);
    } else if (b.op === "remove" && b.id) {
      doc.lists[list] = arr.filter((x) => x.id !== b.id);
    }
    doc.ts = Date.now();
    await store.setJSON(KEY, doc);
    return json(doc);
  }
  return json(await load(store));
};
