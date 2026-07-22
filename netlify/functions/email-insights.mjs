import { getStore } from "./lib/storage/index.mjs";
import {
  isEnergyServicesEmail,
  parseEmailInsight,
  enrichInsight,
  hasRealInsightData,
} from "./lib/emailInsight.mjs";

const KEY = "insights-v1";
const MAX = 200;

function json(o, status) {
  return new Response(JSON.stringify(o), {
    status: status || 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,x-le-key",
    },
  });
}

export default async (req) => {
  const store = getStore("email-insights");
  const doc = (await store.get(KEY, { type: "json", consistency: "strong" })) || { insights: [], ts: 0 };
  if (req.method === "OPTIONS") return json({ ok: true });

  if (req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch {
      /* ignore */
    }

    if (body.op === "patch") {
      const id = String(body.id || "");
      const patch = body.patch || {};
      const hit = (doc.insights || []).find((x) => String(x.id) === id);
      if (!hit) return json({ ok: false, error: "not_found" }, 404);
      Object.assign(hit, patch, { updatedAt: new Date().toISOString() });
      doc.ts = Date.now();
      await store.setJSON(KEY, doc);
      return json({ ok: true, insight: hit });
    }

    if (body.op === "ingest" || body.op === "ingest_raw") {
      const raw = body.insight || body.email || body;
      const from = raw.from || "";
      const subject = raw.subject || "";
      const text = raw.body || raw.snippet || raw.text || "";
      if (!isEnergyServicesEmail(from, subject, text) && body.op === "ingest_raw") {
        return json({ ok: false, skipped: true, reason: "not_energy_services" });
      }
      let insight =
        body.op === "ingest" && raw.id && raw.source
          ? { ...raw }
          : parseEmailInsight({
              from,
              subject,
              body: text,
              receivedAt: raw.receivedAt || raw.date || "",
              messageId: raw.messageId || raw.id || "",
            });
      const jobs = Array.isArray(body.jobs) ? body.jobs : [];
      if (jobs.length) insight = enrichInsight(insight, jobs);
      // Reject vague/test/junk emails with no real address, date, or job (Levi 2026-07-22).
      if (!hasRealInsightData(insight)) {
        return json({ ok: false, skipped: true, reason: "no_real_data" });
      }
      const mid = insight.source?.messageId || insight.id;
      const dupe = (doc.insights || []).find(
        (x) => (x.source?.messageId && x.source.messageId === mid) || x.id === insight.id
      );
      if (dupe && dupe.status !== "pending") {
        return json({ ok: true, deduped: true, insight: dupe });
      }
      if (dupe) {
        Object.assign(dupe, insight, { status: "pending", updatedAt: new Date().toISOString() });
        doc.ts = Date.now();
        await store.setJSON(KEY, doc);
        return json({ ok: true, insight: dupe, refreshed: true });
      }
      insight.createdAt = new Date().toISOString();
      insight.updatedAt = insight.createdAt;
      doc.insights = [insight, ...(doc.insights || [])].slice(0, MAX);
      doc.ts = Date.now();
      await store.setJSON(KEY, doc);
      return json({ ok: true, insight });
    }

    return json({ ok: false, error: "unknown_op" }, 400);
  }

  const pendingOnly = new URL(req.url).searchParams.get("pending") === "1";
  let insights = doc.insights || [];
  if (pendingOnly) insights = insights.filter((x) => x.status === "pending");
  insights = [...insights].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return json({ insights, ts: doc.ts || 0 });
};