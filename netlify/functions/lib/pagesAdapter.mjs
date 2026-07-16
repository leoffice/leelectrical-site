import { bindStorageEnv } from "./storage/index.mjs";

/**
 * Adapts a ported Netlify-style `(req) => Response` handler to a Cloudflare
 * Pages Function `onRequest(context)` export.
 * @param {(req: Request, env: unknown, ctx: unknown) => Promise<Response>} handler
 */
export function toPagesFunction(handler) {
  return async function onRequest(context) {
    bindStorageEnv(context.env);
    return handler(context.request, context.env, context);
  };
}
