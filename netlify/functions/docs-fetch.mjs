import { getStore } from "./lib/storage/index.mjs";
import { generateAndStoreDoc, loadJobForInvoice } from "./lib/docGenerate.mjs";
import { canGenerateLocalDoc, docStoreKey } from "./lib/jobToQbDoc.mjs";

// Public pay page + LE Pro — ensure invoice PDFs use the local QBO-clone template.
// POST { invoiceNo, jobId? }  or  GET ?invoice=<no>&jobId=<id>
//
// Every path here is always-online. This endpoint used to have a third tier
// that enqueued a `fetch_pdf` command for the office-Mac host agent to pull the
// PDF out of QuickBooks; when that machine was asleep the customer got
// "Make sure our office computer is online" and simply could not see their
// invoice. That tier is gone. A customer-facing document must never depend on
// a machine in the office, so we render server-side instead (tier 1) and fall
// back to the durable R2 copy written at send time (tier 2).
const INV_RE = /^\d{1,12}$/;

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

async function docExists(key) {
  const store = getStore("docs");
  const rec = await store.getWithMetadata(key, { type: "arrayBuffer", consistency: "strong" });
  return !!(rec && rec.data);
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });

  let invoiceNo = "";
  let jobId = "";
  if (req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch {
      /* ignore */
    }
    invoiceNo = body.invoiceNo || body.no || "";
    jobId = body.jobId || body.j || "";
  } else if (req.method === "GET") {
    const url = new URL(req.url);
    invoiceNo = url.searchParams.get("invoice") || url.searchParams.get("no") || "";
    jobId = url.searchParams.get("jobId") || url.searchParams.get("j") || "";
  } else {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  const no = String(invoiceNo || "").trim();
  if (!INV_RE.test(no)) return json({ ok: false, error: "bad invoice number" }, 400);

  // Tier 1 — render from job data and cache to R2. Pure CPU, no network, so
  // this works on the V8 isolate and keeps the PDF in step with edits made
  // after the invoice was emailed.
  const job = await loadJobForInvoice(no, jobId);
  if (canGenerateLocalDoc(job, "invoice")) {
    try {
      const result = await generateAndStoreDoc({ job, kind: "invoice" });
      if (result.ok) {
        return json({ ok: true, ready: true, generated: true, key: result.key, invoiceNo: no });
      }
    } catch {
      // Fall through to the stored copy rather than failing the customer.
    }
  }

  // Tier 2 — the durable copy written to R2 when the invoice was sent.
  const key = docStoreKey("invoice", no);
  if (await docExists(key)) {
    return json({ ok: true, ready: true, stored: true, invoiceNo: no });
  }

  // Nothing renderable and nothing stored. Report it plainly; the pay page
  // shows a neutral "one moment" and retries. Never blame the office computer.
  return json({ ok: false, ready: false, reason: "unavailable", invoiceNo: no });
};