import { getStore } from "./lib/storage/index.mjs";
import { rotateJsonBackup } from "./blob-backup.mjs";
import {
  DOC_KEY,
  emptyDoc,
  endSession,
  mintGrant,
  publicGrant,
  redeemGrant,
  refreshGrantState,
  revokeGrant,
  statusPayload,
} from "./lib/agentAccess.mjs";

/**
 * Agent access grants (time-boxed one-time codes).
 *
 * GET  → status (active grant summary + audit)
 * POST → { op: "mint"|"redeem"|"revoke"|"end"|"status", ... }
 */
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

async function load(store) {
  const cur = (await store.get(DOC_KEY, { type: "json", consistency: "strong" })) || emptyDoc();
  return refreshGrantState(cur);
}

async function save(store, doc) {
  await rotateJsonBackup(store, DOC_KEY, doc);
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });

  const store = getStore("settings");
  let doc = await load(store);

  if (req.method === "GET") {
    const payload = statusPayload(doc);
    if (payload._doc !== doc) await save(store, payload._doc);
    const { _doc, ...rest } = payload;
    return json(rest);
  }

  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const op = String(body.op || "status").toLowerCase();

  if (op === "status") {
    const payload = statusPayload(doc);
    if (payload._doc !== doc) await save(store, payload._doc);
    const { _doc, ...rest } = payload;
    return json(rest);
  }

  if (op === "mint") {
    const { doc: next, code, grant } = mintGrant(doc, {
      ttlMs: body.ttlMs,
      scope: body.scope,
      label: body.label,
    });
    await save(store, next);
    return json({
      ok: true,
      code,
      grant,
      audit: (next.audit || []).slice(0, 40),
      message: "Show this code once — it expires automatically.",
    });
  }

  if (op === "redeem") {
    const result = redeemGrant(doc, body.code, { label: body.label || body.agent || "agent" });
    await save(store, result.doc);
    if (!result.ok) return json({ ok: false, error: result.error }, 400);
    return json({
      ok: true,
      token: result.token,
      session: result.session,
      grant: publicGrant(result.doc.activeGrant),
    });
  }

  if (op === "revoke") {
    const result = revokeGrant(doc);
    await save(store, result.doc);
    return json({
      ok: true,
      revoked: result.revoked,
      grant: null,
      audit: (result.doc.audit || []).slice(0, 40),
    });
  }

  if (op === "end") {
    const result = endSession(doc, body.token);
    await save(store, result.doc);
    if (!result.ok) return json({ ok: false, error: result.error }, 400);
    return json({ ok: true, ended: result.ended });
  }

  return json({ ok: false, error: `unknown op: ${op}` }, 400);
};
