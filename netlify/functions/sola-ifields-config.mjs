// Public iFields key for in-app card entry (safe to expose to LE Pro staff UI).
import { resolveIfieldsKey, solaEnvironment } from "./sola-keys.mjs";
import { PRODUCT_BRAND } from "../../shared/productBrand.mjs";

const IFIELDS_VERSION = "2.15.2409.2601";

function corsHeaders() {
  return {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function resolveKeys() {
  const ifieldsKey = resolveIfieldsKey();
  return { ifieldsKey, environment: solaEnvironment() === "dev" ? "dev" : "production" };
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders() });
  }
  const { ifieldsKey, environment } = resolveKeys();
  if (!ifieldsKey) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "SOLA_IFIELDS_KEY not configured on Netlify",
      }),
      { status: 503, headers: corsHeaders() }
    );
  }
  const achEnabled =
    String(process.env.SOLA_ACH_ENABLED || "").trim() === "1" ||
    String(process.env.SOLA_ACH_ENABLED || "").trim().toLowerCase() === "true";

  return new Response(
    JSON.stringify({
      ok: true,
      ifieldsKey,
      version: IFIELDS_VERSION,
      environment,
      softwareName: PRODUCT_BRAND.name,
      softwareVersion: "1.0.0",
      achEnabled,
    }),
    { headers: corsHeaders() }
  );
};