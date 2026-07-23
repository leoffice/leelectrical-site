import { getStore } from "./lib/storage/index.mjs";
import { conditionalJson, optionsResponse } from "./lib/etag.mjs";

// Command bus (#17). Every dashboard action becomes a durable command with a
// live status and an audit trail. Two lanes are decided by command.lane:
//   "deterministic" (send invoice, mark paid) — Phase 2 runs these in this
//        cloud function directly; Phase 1 they go to the agent lane.
//   "judgment" (save-review, customer sync) — pushed to an always-on agent.
// Statuses: queued -> working -> done | failed | needs_approval
// Idempotency: an idempotencyKey that already has a non-failed command is
//   returned as-is (deduped) so a retry can NEVER double-send.
const KEY = "commands-v1";

function json(o) {
  return new Response(JSON.stringify(o), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

async function load(store) {
  return (await store.get(KEY, { type: "json", consistency: "strong" })) || { commands: [], seq: 0, ts: 0 };
}

function audit(c, note) {
  c.audit = c.audit || [];
  c.audit.push({ ts: Date.now(), status: c.status, note: note || "" });
}

export default async (req) => {
  const store = getStore("commands");
  if (req.method === "OPTIONS") return optionsResponse();

  const doc = await load(store);
  doc.commands = doc.commands || [];

  if (req.method === "POST") {
    let b = {};
    try { b = await req.json(); } catch (e) {}

    if (b.op === "enqueue" && b.command) {
      // idempotency — never double-send
      const idk = b.command.idempotencyKey;
      if (idk) {
        const ex = doc.commands.find((c) => c.idempotencyKey === idk && c.status !== "failed");
        if (ex) return json({ ok: true, command: ex, deduped: true });
      }
      const now = Date.now();
      doc.seq = (doc.seq || 0) + 1;
      const c = Object.assign(
        { lane: "judgment", status: "queued", attempts: 0, maxAttempts: 3, result: null, error: null, escalatedAt: 0, audit: [] },
        b.command,
        { id: "c" + now + Math.random().toString(36).slice(2, 6), num: doc.seq, createdAt: now, updatedAt: now }
      );
      audit(c, "created");
      doc.commands.push(c);
      doc.ts = now;
      await store.setJSON(KEY, doc);
      return json({ ok: true, command: c });
    }

    if (b.op === "update" && b.id && b.patch) {
      const c = doc.commands.find((x) => x.id === b.id);
      if (c) {
        Object.assign(c, b.patch);
        c.updatedAt = Date.now();
        audit(c, b.note || "");
      }
      doc.ts = Date.now();
      await store.setJSON(KEY, doc);
      return json({ ok: true, command: c || null });
    }

    if (b.op === "remove" && b.id) {
      doc.commands = doc.commands.filter((x) => x.id !== b.id);
      doc.ts = Date.now();
      await store.setJSON(KEY, doc);
      return json({ ok: true });
    }

    if (b.op === "replace" && Array.isArray(b.commands)) {
      doc.commands = b.commands;
      doc.seq = b.seq || doc.seq || 0;
      doc.ts = Date.now();
      await store.setJSON(KEY, doc);
      return json({ ok: true, count: doc.commands.length });
    }

    return json({ ok: false, error: "unknown op" });
  }

  // GET — optional ?status= filter for the listener/dashboard.
  const url = new URL(req.url);
  const st = url.searchParams.get("status");
  if (st) {
    // Filtered view: don't ETag it (its body differs from the full list that
    // shares the same doc.ts) — only the unfiltered poll is conditional.
    return json({ commands: doc.commands.filter((c) => c.status === st), seq: doc.seq || 0, ts: doc.ts || 0 });
  }
  // Unfiltered poll (every 3–8s in the app): 304 when nothing changed.
  return conditionalJson(req, { commands: doc.commands, seq: doc.seq || 0, ts: doc.ts || 0 }, { prefix: "c", ts: doc.ts });
};
