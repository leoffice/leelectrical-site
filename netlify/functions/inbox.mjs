import { getStore } from "./lib/storage/index.mjs";

// Dispatch (Claude) polls this to read iteration requests submitted from the Progress tab.
export default async (req) => {
  const store = getStore("iterations");
  const { blobs } = await store.list();
  const items = [];
  for (const b of blobs) {
    const v = await store.get(b.key, { type: "json" });
    if (v) { v._key = b.key; items.push(v); }
  }
  items.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return new Response(JSON.stringify(items, null, 2), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
