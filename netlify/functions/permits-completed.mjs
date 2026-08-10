// GET /.netlify/functions/permits-completed
// Backend lists of Print Permits under BLZ Electric Inc / Permits:
//   completed | jose | sima (CIMA) | full_detailed | …
// Levi 2026-08-10: separate Jose vs Sima lists; Completed = renew candidates
// only after DOB NOW shows "Renew application" (PAA → subsequent).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getStore } from "./lib/storage/index.mjs";
import { resolveTenant } from "./lib/tenant.mjs";
import { optionsResponse } from "./lib/etag.mjs";

const BLOB_KEY = "blz-permits-by-folder-v1";
const BLOB_COMPLETED = "blz-completed-permits-v1";
const __dirname = dirname(fileURLToPath(import.meta.url));

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

function loadJson(name) {
  try {
    const path = join(__dirname, "data", name);
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function catalogToPermitCacheEntries(doc) {
  const permits = Array.isArray(doc?.permits) ? doc.permits : [];
  return permits.map((r) => ({
    id: r.id || `blz-${r.fileName}`,
    scenarioId: "",
    permitNo: String(r.permitNo || "").trim(),
    issuedDate: String(r.issuedDate || "").trim().slice(0, 10),
    expiresDate: String(r.expiresDate || "").trim().slice(0, 10),
    address: String(r.address || r.addressFromFile || "").trim(),
    customer: String(r.issuedTo || "").trim(),
    businessName: String(r.contractorBusiness || "BLZ ELECTRIC INC.").trim(),
    email: "",
    phone: "",
    fee: 365,
    qboCustomerId: "",
    matchedCustomer: false,
    source: r.sourceFolder || "blz_completed",
    fileName: r.fileName || "",
    kind: r.kind || "electrical",
    extractOk: !!r.extractOk,
    hasRealPermitNo: !!r.hasRealPermitNo,
    drivePath: r.drivePath || "",
    renewStatus: r.renewStatus || "",
    updatedAt: doc?.updatedAt || new Date().toISOString(),
  }));
}

export default async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  const tenant = await resolveTenant(req);
  if (tenant == null) return json({ ok: false, error: "unauthenticated" }, 401);

  const store = getStore("jobstate", tenant);
  const url = new URL(req.url);
  const list = String(url.searchParams.get("list") || "completed").trim().toLowerCase();
  const q = String(url.searchParams.get("q") || "")
    .trim()
    .toLowerCase();

  if (req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const doc = body.doc || body;
    if (doc?.schema === "blz-permits-by-folder/v1" && doc.byFolder) {
      await store.setJSON(BLOB_KEY, doc);
      return json({ ok: true, schema: doc.schema, counts: doc.counts, ts: Date.now() });
    }
    if (Array.isArray(doc?.permits)) {
      const next = {
        schema: "blz-completed-permits/v1",
        updatedAt: new Date().toISOString(),
        folder: doc.folder || "BLZ Electric Inc/Permits/Completed",
        count: doc.permits.length,
        withPermitNo: doc.permits.filter((p) => p.hasRealPermitNo || p.permitNo).length,
        permits: doc.permits,
      };
      await store.setJSON(BLOB_COMPLETED, next);
      return json({ ok: true, count: next.count, withPermitNo: next.withPermitNo, ts: Date.now() });
    }
    return json({ ok: false, error: "unsupported body" }, 400);
  }

  if (req.method !== "GET") return json({ ok: false, error: "GET or POST only" }, 405);

  // Multi-folder catalog (preferred)
  let multi = null;
  try {
    multi = await store.get(BLOB_KEY, { type: "json" });
  } catch {
    multi = null;
  }
  if (!multi?.byFolder) multi = loadJson("blz_permits_by_folder.json");

  if (multi?.byFolder) {
    const lists = multi.lists || {};
    let permits = [];
    let listKey = list;

    if (list === "all") {
      permits = Object.values(multi.byFolder).flatMap((f) => f.permits || []);
    } else if (list === "jose") {
      permits = lists.jose || multi.byFolder.jose?.permits || [];
    } else if (list === "sima" || list === "cima" || list === "sima_cima") {
      listKey = "sima_cima";
      permits = lists.sima_cima || multi.byFolder.sima?.permits || [];
    } else if (list === "candidates" || list === "renew") {
      listKey = "completed_notification_candidates";
      permits = lists.completed_notification_candidates || [];
    } else if (list === "need_info" || list === "ask") {
      listKey = "completed_need_levi_info";
      permits = lists.completed_need_levi_info || [];
    } else {
      listKey = "completed";
      permits = lists.completed || multi.byFolder.completed?.permits || [];
    }

    if (q) {
      permits = permits.filter((p) => {
        const hay = [
          p.address,
          p.addressFromFile,
          p.permitNo,
          p.issuedTo,
          p.fileName,
          p.description,
          p.sourceFolder,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    return json({
      ok: true,
      schema: multi.schema || "blz-permits-by-folder/v1",
      updatedAt: multi.updatedAt || null,
      baseFolder: multi.baseFolder || "BLZ Electric Inc/Permits",
      list: listKey,
      counts: multi.counts || {},
      rules: multi.rules || {},
      dobOpenDataSpotChecks: multi.dobOpenDataSpotChecks || [],
      count: permits.length,
      withPermitNo: permits.filter((p) => p.hasRealPermitNo || p.permitNo).length,
      permits,
      cacheEntries: catalogToPermitCacheEntries({
        updatedAt: multi.updatedAt,
        permits,
      }),
      // Convenience mirrors
      jose: lists.jose || [],
      sima: lists.sima_cima || [],
      completed: lists.completed || [],
      candidates: lists.completed_notification_candidates || [],
      needLeviInfo: lists.completed_need_levi_info || [],
    });
  }

  // Legacy completed-only fallback
  let doc = null;
  try {
    doc = await store.get(BLOB_COMPLETED, { type: "json" });
  } catch {
    doc = null;
  }
  if (!doc?.permits) doc = loadJson("blz_completed_permits.json");
  if (!doc?.permits) {
    return json({
      ok: true,
      schema: "blz-completed-permits/v1",
      count: 0,
      permits: [],
      cacheEntries: [],
      warning: "no_catalog",
    });
  }

  let permits = doc.permits;
  if (q) {
    permits = permits.filter((p) => {
      const hay = [p.address, p.permitNo, p.fileName, p.issuedTo].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  return json({
    ok: true,
    schema: doc.schema || "blz-completed-permits/v1",
    updatedAt: doc.updatedAt || null,
    folder: doc.folder || "BLZ Electric Inc/Permits/Completed",
    list: "completed",
    count: permits.length,
    withPermitNo: permits.filter((p) => p.hasRealPermitNo || p.permitNo).length,
    permits,
    cacheEntries: catalogToPermitCacheEntries({ ...doc, permits }),
  });
};
