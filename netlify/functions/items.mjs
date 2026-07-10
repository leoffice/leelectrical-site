import { getStore } from "./lib/storage/index.mjs";

// QuickBooks Products & Services index for estimate/invoice line items.
//   GET         -> { items:[{name,type,price,description,id?}], updated, ts }
//   GET ?q=panel -> top 20 name matches
//   POST {op:"set", items:[...], updated}  (host push from QBO)
const KEY = "items-v1";

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
  return (await store.get(KEY, { type: "json", consistency: "strong" })) || { items: [], updated: "", ts: 0 };
}

export default async (req) => {
  const store = getStore("items");
  if (req.method === "OPTIONS") return json({ ok: true });

  if (req.method === "POST") {
    let b = {};
    try {
      b = await req.json();
    } catch (e) {}
    if (b.op === "set" && Array.isArray(b.items)) {
      await store.setJSON(KEY, { items: b.items, updated: b.updated || "", ts: Date.now() });
      return json({ ok: true, count: b.items.length });
    }
    return json({ ok: false, error: "unknown op" });
  }

  const doc = await load(store);
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  if (q) {
    const toks = q.split(/\s+/).filter(Boolean);
    const scored = [];
    for (const it of doc.items || []) {
      const n = String(it.name || "").toLowerCase();
      const d = String(it.description || "").toLowerCase();
      let s = 0;
      for (const t of toks) {
        if (n.includes(t)) s += n.startsWith(t) ? 3 : 2;
        else if (d.includes(t)) s += 1;
      }
      if (s) scored.push({ ...it, _s: s });
    }
    scored.sort((a, b) => b._s - a._s || a.name.localeCompare(b.name));
    return json({ items: scored.slice(0, 20).map(({ _s, ...it }) => it), ts: doc.ts });
  }
  return json(doc);
};