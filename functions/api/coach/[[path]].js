// Coach LE Pro access: /api/coach/* (scoped read + per-job edits). See
// netlify/functions/lib/coachLePro.mjs for the security model.
import { handleCoach } from "../../../netlify/functions/lib/coachLePro.mjs";
import { bindStorageEnv, getStore } from "../../../netlify/functions/lib/storage/index.mjs";

export async function onRequest(context) {
  bindStorageEnv(context.env);
  try {
    return await handleCoach(context.request, context.env, { getStore: (name) => getStore(name) });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "server_error" }), {
      status: 500,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
}
