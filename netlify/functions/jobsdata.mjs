import { getStore } from "./lib/storage/index.mjs";
import { rotateJsonBackup } from "./blob-backup.mjs";
import { resolveTenant } from "./lib/tenant.mjs";
import { conditionalJson, optionsResponse } from "./lib/etag.mjs";

// Live jobs dataset synced from QuickBooks + Google Calendar by a scheduled
// Dispatch job (overnight + midday) and on demand. The dashboard GETs this to
// render real jobs; "Sync now" POSTs op:"request" which the sync job fulfills.
// GET  -> { jobs:[...], syncedAt, request, ts, view:"list"|"full" }
//         Default view=list: slim projection (Levi 2026-08-04 lag guardrails).
//         ?view=full for the full blob (sync tools / emergency).
// POST -> { op:"set", jobs:[...] }  (sync job writes the dataset)
//         { op:"merge", jobs:[...] }
//         { op:"request" }
//         { op:"get", id } → { ok, job } full single job for detail hydrate
const KEY = "jobsdata-v1";

/** Fields kept on the list projection — no multi-MB line arrays. */
const SLIM_KEYS = [
  "id",
  "customer",
  "customerName",
  "personName",
  "businessName",
  "email",
  "phone",
  "address",
  // serviceAddress / billingAddress hydrate on detail (list uses address)
  "title",
  "amount",
  "openBalance",
  "paid",
  "invoiceNo",
  "estimateNo",
  // Dates stay on list — cheap strings; without them Job Info + PDF fall back
  // to "today" for old invoices (EZZ #231409 / 2023-11-27). Levi 2026-08-04.
  "invoiceDate",
  "estimateDate",
  "dueDate",
  "txnDate",
  "invoiceEmailedAt",
  "status",
  "followUp",
  "calEventId",
  "customerId",
  "qboCustomerId",
  "parentCustomerId",
  "paymentBaseline",
  "amountWhenBaselined",
  "_fromEstimateGenerator",
  "_estimator",
  // payment ledger + paperwork hydrate on detail (openBalance/paid for list chips)
];

/**
 * Project a job for list/poll payloads. Strips invoice/estimate line arrays and
 * trims stage maps so ~4k jobs stay under ~3 MB (was ~4.3 MB list / ~20 MB full).
 * Full lines + payment history hydrate via POST op:get on job detail
 * (PERFORMANCE_RULES §1).
 *
 * Status semantics for stageOf/progressPct:
 * - empty stage omitted ≡ not cleared (same as `{s:""}`)
 * - done/skipped kept so progress % and StagePill stay correct
 * - dates dropped on list (detail hydrate restores them)
 */
export function slimJob(job) {
  if (!job || typeof job !== "object") return job;
  const out = {};
  for (const k of SLIM_KEYS) {
    if (job[k] !== undefined) out[k] = job[k];
  }
  // Status: only non-empty stages, s only (no dates/notes) — biggest list savings
  if (job.status && typeof job.status === "object") {
    const st = {};
    for (const [phase, val] of Object.entries(job.status)) {
      if (!val || typeof val !== "object") continue;
      const s = val.s || "";
      if (!s) continue;
      st[phase] = { s };
    }
    if (Object.keys(st).length) out.status = st;
    else delete out.status;
  }
  // No payments[] / payment on list — openBalance + paid drive list chips;
  // full ledger hydrates on job open.
  // Truncate long titles for list
  if (typeof out.title === "string" && out.title.length > 120) {
    out.title = out.title.slice(0, 120) + "…";
  }
  if (typeof out.followUp === "object" && out.followUp) {
    const rawText = out.followUp.text != null ? String(out.followUp.text) : "";
    const date = out.followUp.date || "";
    const text = rawText.length > 80 ? rawText.slice(0, 80) + "…" : rawText;
    if (text || date) {
      out.followUp = {
        ...(text ? { text } : {}),
        ...(date ? { date } : {}),
      };
    } else {
      delete out.followUp;
    }
  }
  // Mark slim so client can re-hydrate detail
  out._listProjection = true;
  return out;
}

export function slimJobsDoc(doc) {
  if (!doc || !Array.isArray(doc.jobs)) return doc;
  return {
    ...doc,
    view: "list",
    jobs: doc.jobs.map(slimJob),
  };
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    },
  });
}

async function load(store) {
  return (await store.get(KEY, { type: "json", consistency: "strong" })) ||
    { jobs: [], syncedAt: 0, request: 0, ts: 0 };
}

export default async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  const tenant = await resolveTenant(req);
  if (tenant == null) return json({ ok: false, error: "unauthenticated" }, 401);
  const store = getStore("jobsdata", tenant);
  if (req.method === "POST") {
    let b = {};
    try { b = await req.json(); } catch (e) {}
    const doc = await load(store);
    if (b.op === "get" && b.id) {
      const job = (doc.jobs || []).find((j) => j && String(j.id) === String(b.id)) || null;
      return json({ ok: true, job, ts: doc.ts || 0 });
    }
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
  // Conditional GET: list projection by default (lag guardrails, Levi 2026-08-04)
  const doc = await load(store);
  const url = new URL(req.url || "https://local/jobsdata");
  const view = (url.searchParams.get("view") || "list").toLowerCase();
  const payload = view === "full" ? { ...doc, view: "full" } : slimJobsDoc(doc);
  // Separate ETag prefix for list vs full so clients don't mix caches
  const prefix = view === "full" ? "jf" : "jl";
  return conditionalJson(req, payload, { prefix, ts: doc.ts || doc.syncedAt || 0 });
};
