// Public iFields key for in-app card entry (safe to expose to LE Pro staff UI).
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
  const env = String(process.env.SOLA_ENV || "production").trim().toLowerCase();
  const isDev = env === "dev" || env === "sandbox" || env === "test";
  const ifieldsKey = isDev
    ? process.env.SOLA_IFIELDS_KEY_DEV || process.env.SOLA_IFIELDS_KEY
    : process.env.SOLA_IFIELDS_KEY || "ifields_blzelectricf19091a9a53f435699d914e935";
  return { ifieldsKey, environment: isDev ? "dev" : "production" };
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
  return new Response(
    JSON.stringify({
      ok: true,
      ifieldsKey,
      version: IFIELDS_VERSION,
      environment,
      softwareName: "LE Pro",
      softwareVersion: "1.0.0",
    }),
    { headers: corsHeaders() }
  );
};