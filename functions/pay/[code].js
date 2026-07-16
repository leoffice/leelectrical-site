import handler from "../../netlify/functions/pay-link.mjs";
import { bindStorageEnv } from "../../netlify/functions/lib/storage/index.mjs";

// Short customer pay links — /pay/251825-x7k2 -> pay-link resolver -> LE Pro pay page.
// Cloudflare Pages `_redirects` 200-rewrites can only target static assets, not
// Functions routes, so this dynamic route re-dispatches to pay-link directly
// instead (mirrors the /pay/:code redirect in netlify.toml).
export async function onRequest(context) {
  bindStorageEnv(context.env);
  const target = new URL(context.request.url);
  target.pathname = "/.netlify/functions/pay-link";
  target.search = "";
  target.searchParams.set("code", context.params.code);
  const req = new Request(target.toString(), { headers: context.request.headers });
  return handler(req, context.env, context);
}
