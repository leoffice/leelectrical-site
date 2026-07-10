import { getStore } from "./lib/storage/index.mjs";

// Nightly purge of invoice/estimate PDFs older than 30 days (docs blob store).
export const DOCS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export default async (req) => {
  let nextRun = "";
  try {
    const body = await req.json();
    nextRun = body?.next_run || "";
  } catch {
    /* manual invoke or GET probe */
  }

  const store = getStore("docs");
  const cutoff = Date.now() - DOCS_TTL_MS;
  const { blobs } = await store.list();
  let deleted = 0;
  let scanned = 0;

  for (const b of blobs || []) {
    scanned += 1;
    const rec = await store.getWithMetadata(b.key, { type: "blob" });
    const ts = Number(rec?.metadata?.ts || 0);
    if (ts > 0 && ts < cutoff) {
      await store.delete(b.key);
      deleted += 1;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, scanned, deleted, cutoff, nextRun }),
    {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    }
  );
};