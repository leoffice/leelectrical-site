import { bindStorageEnv } from "./storage/index.mjs";
import { isCoachRequest } from "./coachLePro.mjs";

/**
 * Cloudflare Pages secrets/bindings land on `context.env`. Ported Netlify
 * handlers still read `process.env` — mirror string-ish keys so Sola, Resend,
 * QBO, XAI, etc. resolve the same way as on Netlify.
 * @param {Record<string, unknown>|null|undefined} env
 */
export function bindProcessEnv(env) {
  if (!env || typeof process === "undefined" || !process.env) return;
  for (const [key, value] of Object.entries(env)) {
    if (value == null) continue;
    const t = typeof value;
    if (t === "string" || t === "number" || t === "boolean") {
      process.env[key] = String(value);
    }
  }
}

/**
 * Adapts a ported Netlify-style `(req) => Response` handler to a Cloudflare
 * Pages Function `onRequest(context)` export.
 * @param {(req: Request, env: unknown, ctx: unknown) => Promise<Response>} handler
 */
export function toPagesFunction(handler) {
  return async function onRequest(context) {
    // The Coach credential is only valid on /api/coach/*. Refuse it on every
    // other endpoint (payments, Zelle apply, sends, deletes, full-ov state).
    if (await isCoachRequest(context.request, context.env)) {
      return new Response(JSON.stringify({ ok: false, error: "coach_forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }
    bindStorageEnv(context.env);
    bindProcessEnv(context.env);
    return handler(context.request, context.env, context);
  };
}
