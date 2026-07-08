import { getStore } from "@netlify/blobs";
import { DOCS_TTL_MS } from "./docs-cleanup.mjs";

// docs — small PDF document store for live invoice/estimate viewing (LE Pro).
// Blobs expire after 30 days (see docs-cleanup scheduled function).
// The host agent downloads the PDF from QuickBooks and uploads it here; the
// app then serves it inline.
//   POST { op:"put", key:"inv-<no>"|"est-<no>", b64:"<base64>", mime:"application/pdf" }
//   GET  ?key=inv-<no>   -> the binary (content-type from stored mime, cached 1h)
//                           or 404 JSON { ok:false, error:"not found" }
const KEY_RE = /^[a-z]{2,8}-[A-Za-z0-9._-]{1,64}$/;

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const store = getStore("docs");

  if (req.method === "POST") {
    let b = {};
    try { b = await req.json(); } catch (e) {}
    if (b.op !== "put") return json({ ok: false, error: "unknown op" }, 400);
    const key = String(b.key || "");
    if (!KEY_RE.test(key)) return json({ ok: false, error: "bad key" }, 400);
    if (!b.b64) return json({ ok: false, error: "missing b64" }, 400);
    let buf;
    try {
      buf = Buffer.from(String(b.b64), "base64");
    } catch (e) {
      return json({ ok: false, error: "bad base64" }, 400);
    }
    if (!buf.length) return json({ ok: false, error: "empty document" }, 400);
    if (buf.length > 9_000_000) return json({ ok: false, error: "too large" }, 413);
    const mime = String(b.mime || "application/pdf");
    await store.set(key, buf, { metadata: { mime, bytes: buf.length, ts: Date.now() } });
    return json({ ok: true, key, bytes: buf.length });
  }

  // GET ?key=...
  const url = new URL(req.url);
  const key = String(url.searchParams.get("key") || "");
  if (!KEY_RE.test(key)) return json({ ok: false, error: "bad key" }, 400);
  const rec = await store.getWithMetadata(key, { type: "arrayBuffer", consistency: "strong" });
  if (!rec || !rec.data) return json({ ok: false, error: "not found" }, 404);
  const ts = Number(rec.metadata?.ts || 0);
  if (ts > 0 && Date.now() - ts > DOCS_TTL_MS) {
    await store.delete(key);
    return json({ ok: false, error: "expired" }, 404);
  }
  const mime = (rec.metadata && rec.metadata.mime) || "application/pdf";
  return new Response(rec.data, {
    headers: {
      "content-type": mime,
      "content-disposition": `inline; filename="${key}.pdf"`,
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
    },
  });
};
