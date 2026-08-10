// GET /.netlify/functions/permits-completed
// Backend list of all Print Permits under:
//   My Drive / BLZ Electric Inc / Permits / Completed
// Built from Drive folder scan + optional PDF extract fields.
// Levi 2026-08-10: cash-file source for Renewal Application (no Schenectady hardcode).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getStore } from "./lib/storage/index.mjs";
import { resolveTenant } from "./lib/tenant.mjs";
import { optionsResponse } from "./lib/etag.mjs";

const BLOB_KEY = "blz-completed-permits-v1";
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

function loadBundledCatalog() {
  try {
    const path = join(__dirname, "data", "blz_completed_permits.json");
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Map catalog rows → permit-cache shape for LE Pro renew list.
 */
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
    source: "blz_completed",
    fileName: r.fileName || "",
    kind: r.kind || "electrical",
    extractOk: !!r.extractOk,
    hasRealPermitNo: !!r.hasRealPermitNo,
    drivePath: r.drivePath || "",
    updatedAt: doc?.updatedAt || new Date().toISOString(),
  }));
}

export default async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  const tenant = await resolveTenant(req);
  // Public-ish staff list: require auth like other state endpoints
  if (tenant == null) return json({ ok: false, error: "unauthenticated" }, 401);

  const store = getStore("jobstate", tenant);

  if (req.method === "POST") {
    // Allow pushing a refreshed catalog from a local scan agent
    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const doc = body.doc || body;
    if (!doc || !Array.isArray(doc.permits)) {
      return json({ ok: false, error: "body.doc.permits required" }, 400);
    }
    const next = {
      schema: "blz-completed-permits/v1",
      updatedAt: new Date().toISOString(),
      folder: doc.folder || "BLZ Electric Inc/Permits/Completed",
      count: doc.permits.length,
      withPermitNo: doc.permits.filter((p) => p.hasRealPermitNo || p.permitNo).length,
      permits: doc.permits,
    };
    await store.setJSON(BLOB_KEY, next);
    return json({ ok: true, count: next.count, withPermitNo: next.withPermitNo, ts: Date.now() });
  }

  if (req.method !== "GET") return json({ ok: false, error: "GET or POST only" }, 405);

  // Prefer blob (last POST refresh), fall back to bundled scan
  let doc = null;
  try {
    doc = await store.get(BLOB_KEY, { type: "json" });
  } catch {
    doc = null;
  }
  if (!doc || !Array.isArray(doc.permits)) {
    doc = loadBundledCatalog();
  }
  if (!doc || !Array.isArray(doc.permits)) {
    return json({
      ok: true,
      schema: "blz-completed-permits/v1",
      count: 0,
      withPermitNo: 0,
      permits: [],
      cacheEntries: [],
      warning: "no_catalog",
    });
  }

  const q = String(new URL(req.url).searchParams.get("q") || "")
    .trim()
    .toLowerCase();
  let permits = doc.permits;
  if (q) {
    permits = permits.filter((p) => {
      const hay = [
        p.address,
        p.addressFromFile,
        p.permitNo,
        p.issuedTo,
        p.fileName,
        p.description,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  return json({
    ok: true,
    schema: doc.schema || "blz-completed-permits/v1",
    updatedAt: doc.updatedAt || null,
    folder: doc.folder || "BLZ Electric Inc/Permits/Completed",
    count: permits.length,
    totalInCatalog: doc.permits.length,
    withPermitNo:
      permits.filter((p) => p.hasRealPermitNo || String(p.permitNo || "").trim()).length,
    permits,
    cacheEntries: catalogToPermitCacheEntries({ ...doc, permits }),
  });
};
