import { getStore } from "@netlify/blobs";

const SITE = "https://leelectrical.us";
const TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const CODE_RE = /^[0-9]{5,8}-[a-z0-9]{4}$/i;

function corsHeaders() {
  return {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

function makeCode(invoiceNo) {
  const inv = String(invoiceNo || "").trim().replace(/\D/g, "");
  const base = inv || String(Date.now()).slice(-6);
  return `${base}-${randomSuffix()}`;
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });

  const store = getStore("paylinks");

  if (req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    const payload = body.payload;
    if (!payload || !payload.i) return json({ ok: false, error: "payload with invoice required" }, 400);

    const code = makeCode(payload.i);
    const record = { payload, createdAt: Date.now(), invoiceNo: String(payload.i) };
    await store.set(`pl-${code}`, JSON.stringify(record), {
      metadata: { invoiceNo: String(payload.i), ts: Date.now() },
    });
    const url = `${SITE}/pay/${code}`;
    return json({ ok: true, code, url });
  }

  const url = new URL(req.url);
  const code = String(url.searchParams.get("code") || "").trim();
  if (!code) return json({ ok: false, error: "code required" }, 400);
  if (!CODE_RE.test(code)) return json({ ok: false, error: "invalid code" }, 404);

  const raw = await store.get(`pl-${code}`, { type: "text" });
  if (!raw) return json({ ok: false, error: "link not found" }, 404);

  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "corrupt link data" }, 500);
  }

  if (record.createdAt && Date.now() - record.createdAt > TTL_MS) {
    return json({ ok: false, error: "link expired" }, 410);
  }

  // Browser hit from /pay/:code redirect — send customer to the pay page.
  if (req.headers.get("accept")?.includes("text/html")) {
    const target = `${SITE}/app/pro/#/pay/${encodeURIComponent(code)}`;
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>Pay invoice</title></head><body><p><a href="${target}">Continue to payment page</a></p></body></html>`,
      { status: 302, headers: { Location: target, "content-type": "text/html; charset=utf-8" } }
    );
  }

  return json({ ok: true, code, payload: record.payload });
};