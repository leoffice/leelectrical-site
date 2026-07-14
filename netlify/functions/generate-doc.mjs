import { generateAndStoreDoc } from "./lib/docGenerate.mjs";
import { canGenerateLocalDoc } from "./lib/jobToQbDoc.mjs";

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

/** POST { kind: 'invoice'|'estimate', job: {...} } — generate PDF locally, store in docs. */
export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }

  const kind = String(body.kind || "invoice").toLowerCase();
  if (kind !== "invoice" && kind !== "estimate") {
    return json({ ok: false, error: "bad kind" }, 400);
  }

  const job = body.job || body;
  if (!canGenerateLocalDoc(job, kind)) {
    return json({ ok: false, error: "insufficient_data" }, 400);
  }

  try {
    const result = await generateAndStoreDoc({ job, kind });
    if (!result.ok) return json(result, 400);
    const url = `https://leelectrical.us/.netlify/functions/docs?key=${encodeURIComponent(result.key)}`;
    return json({ ok: true, key: result.key, url, bytes: result.bytes, docNumber: result.docNumber });
  } catch (err) {
    console.error("[generate-doc]", err);
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
};