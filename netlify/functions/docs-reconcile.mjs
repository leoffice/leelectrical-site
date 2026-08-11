// Reconcile sent-but-unsaved invoices back into the app store.
//
// Levi 2026-08-11: invoice LE-251859 went to a customer — pay link minted, PDF
// stored — but the app record never landed, so LE Pro showed that customer $0
// and no transactions. Sending leaves durable customer-side artifacts; this
// endpoint treats them as witnesses and re-materializes anything the app is
// missing, keeping the ORIGINAL invoice number and pay code so the customer's
// copy, the pay link and the books all agree.
//
//   GET                     → dry report: what is missing, what was skipped
//   POST { op: "heal" }     → apply it (rotates a backup first), then reports
//
// Idempotent: an invoice already in the store is skipped, and a job carrying a
// different invoice is never overwritten.
import { getStore, rotateJsonBackup } from "./lib/storage/index.mjs";
import { resolveTenant } from "./lib/tenant.mjs";
import { planSentDocRecovery } from "./lib/sentDocReconcile.mjs";

const STATE_KEY = "ov-v1";
/** Only look at recent links — the pay store keeps a long tail. */
const MAX_LINKS = 400;

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

async function loadPayLinks(store) {
  const listed = await store.list().catch(() => ({ blobs: [] }));
  const keys = (listed?.blobs || [])
    .map((b) => String(b?.key || ""))
    .filter((k) => k.startsWith("pl-"))
    .slice(0, MAX_LINKS);

  const out = [];
  for (const key of keys) {
    try {
      const record = await store.get(key, { type: "json" });
      if (record) out.push({ code: key.replace(/^pl-/, ""), record });
    } catch {
      /* a single unreadable link must not stop the sweep */
    }
  }
  return out;
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type,authorization",
      },
    });
  }

  const tenant = await resolveTenant(req);
  if (tenant == null) return json({ ok: false, error: "unauthenticated" }, 401);

  try {
    const payStore = getStore("paylinks", tenant);
    const stateStore = getStore("jobstate", tenant);

    const [payLinks, cur] = await Promise.all([
      loadPayLinks(payStore),
      stateStore.get(STATE_KEY, { type: "json" }),
    ]);
    const doc = cur || { ov: {}, ts: 0 };
    const ov = doc.ov || {};

    const { plan, skipped } = planSentDocRecovery(payLinks, ov);
    const report = {
      ok: true,
      scannedLinks: payLinks.length,
      missing: plan.map((p) => ({
        invoiceNo: p.invoiceNo,
        jobId: p.jobId,
        customer: p.customer,
        amount: p.amount,
      })),
      skippedCount: skipped.length,
    };

    let body = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }
    if (req.method !== "POST" || String(body.op || "") !== "heal") {
      return json({ ...report, applied: 0, dryRun: true });
    }
    // POST { op:"heal", only:["LE-251859", …] } restricts the heal to named
    // invoices — the surgical path for a known recovery.
    const only = Array.isArray(body.only)
      ? body.only.map((s) => String(s).trim().toUpperCase()).filter(Boolean)
      : null;
    const toApply = only
      ? plan.filter((p) => only.includes(p.invoiceNo.toUpperCase()))
      : plan;
    if (!toApply.length) return json({ ...report, applied: 0 });

    const healed = [];
    for (const item of toApply) {
      const job = ov[item.jobId];
      if (!job || typeof job !== "object") continue;
      const existing = String(job.invoiceNo || "").trim();
      // Re-check under the write: another client may have saved it meanwhile.
      if (existing) continue;
      ov[item.jobId] = {
        ...job,
        ...item.patch,
        _version: Number(job._version || 1) + 1,
        version: Number(job.version || 1) + 1,
      };
      healed.push(item.invoiceNo);
    }
    if (!healed.length) return json({ ...report, applied: 0 });

    const ts = Date.now();
    await rotateJsonBackup(stateStore, STATE_KEY, { ov, ts });
    console.log("[docs-reconcile] healed", JSON.stringify({ tenant, invoices: healed }));
    return json({ ...report, applied: healed.length, healed, ts });
  } catch (err) {
    console.error("[docs-reconcile]", err);
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
};
