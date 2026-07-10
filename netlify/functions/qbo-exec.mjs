import { getStore } from "./lib/storage/index.mjs";
import { basicAuthBase64 } from "./lib/base64.mjs";

// Task #19 (item 3) — ALWAYS-ON CLOUD send executor for the deterministic lane.
// Purpose: send invoices/estimates from Netlify's cloud so critical sends don't
// depend on the Mac being awake. DORMANT until the QuickBooks env vars are set:
//   QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REFRESH_TOKEN, QBO_REALM_ID
//   QBO_EXEC_TOKEN   (a shared secret required to invoke this endpoint)
// With no creds it safely no-ops. It is NOT scheduled — go-live is a deliberate
// step (see the #19 card) so it never races the host listener and never causes
// double-sends. When live, the host listener must stop handling send_* so exactly
// one executor owns sends.
//
// Invoke (once creds exist):  POST /.netlify/functions/qbo-exec  { "token": "<QBO_EXEC_TOKEN>" }
// It refreshes the access token (storing the rotated token in Blob "qbo-auth"),
// then processes queued send_invoice/send_estimate commands with retry + audit.

const API_BASE = "https://quickbooks.api.intuit.com";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const MINOR = "70";
const CMD_KEY = "commands-v1";

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function getAuth(store) {
  // Prefer the rotated refresh token in Blobs; fall back to the env seed.
  const saved = (await store.get("qbo-auth", { type: "json" })) || {};
  const refresh = saved.refresh_token || process.env.QBO_REFRESH_TOKEN;
  return { refresh, access: saved.access_token, expires_at: saved.expires_at || 0 };
}

async function refresh(store, refreshToken) {
  const id = process.env.QBO_CLIENT_ID, secret = process.env.QBO_CLIENT_SECRET;
  const basic = basicAuthBase64(id, secret);
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!r.ok) throw new Error(`token refresh failed ${r.status}: ${await r.text()}`);
  const t = await r.json();
  const rec = {
    access_token: t.access_token,
    refresh_token: t.refresh_token || refreshToken,
    expires_at: Date.now() + (t.expires_in || 3600) * 1000 - 60000,
  };
  await store.setJSON("qbo-auth", rec);
  return rec;
}

async function api(access, realm, method, path, body) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${API_BASE}/v3/company/${realm}/${path}${sep}minorversion=${MINOR}`;
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${access}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`QBO ${method} ${path} -> ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function findTxnId(access, realm, entity, docnum) {
  const q = encodeURIComponent(`select Id, DocNumber from ${entity} where DocNumber = '${docnum}'`);
  const res = await api(access, realm, "GET", `query?query=${q}`);
  const rows = ((res.QueryResponse || {})[entity]) || [];
  if (!rows.length) throw new Error(`no ${entity} with DocNumber ${docnum}`);
  return rows[0].Id;
}

async function sendTxn(access, realm, kind, docnum, email) {
  const entity = kind === "send_invoice" ? "Invoice" : "Estimate";
  const path = kind === "send_invoice" ? "invoice" : "estimate";
  const id = await findTxnId(access, realm, entity, docnum);
  await api(access, realm, "POST", `${path}/${id}/send?sendTo=${encodeURIComponent(email)}`);
  return `SENT ${path} ${docnum} to ${email}`;
}

export default async (req) => {
  // Auth gate — require the shared secret; refuse if unconfigured.
  let b = {};
  try { b = await req.json(); } catch (e) {}
  const need = process.env.QBO_EXEC_TOKEN;
  if (!need) return json({ ok: false, dormant: true, reason: "QBO_EXEC_TOKEN not set — executor dormant" }, 200);
  if (b.token !== need) return json({ ok: false, error: "unauthorized" }, 401);
  if (!process.env.QBO_CLIENT_ID || !process.env.QBO_REALM_ID) {
    return json({ ok: false, dormant: true, reason: "QBO env vars incomplete" }, 200);
  }

  const auth = getStore("qbo-auth-store");
  const cmds = getStore("commands");
  const realm = process.env.QBO_REALM_ID;

  // Ensure a fresh access token (refresh if missing/expired).
  let a = await getAuth(auth);
  if (!a.access || Date.now() >= a.expires_at) {
    if (!a.refresh) return json({ ok: false, error: "no refresh token" }, 200);
    a = await refresh(auth, a.refresh);
  }

  const doc = (await cmds.get(CMD_KEY, { type: "json", consistency: "strong" })) || { commands: [] };
  let done = 0, failed = 0;
  for (const c of doc.commands) {
    if (c.status !== "queued") continue;
    if (c.type !== "send_invoice" && c.type !== "send_estimate") continue; // deterministic sends only
    const pl = c.payload || {};
    const email = pl.email, docnum = pl.invoiceNo || pl.estimateNo;
    c.attempts = (c.attempts || 0) + 1;
    c.status = "working"; c.updatedAt = Date.now();
    (c.audit = c.audit || []).push({ ts: Date.now(), status: "working", note: "cloud exec picked up" });
    try {
      if (!email || !docnum) throw new Error("missing email or doc number");
      const detail = await sendTxn(a.access, realm, c.type, docnum, email);
      c.status = "done"; c.result = detail; c.updatedAt = Date.now();
      c.audit.push({ ts: Date.now(), status: "done", note: "cloud exec sent" });
      done++;
    } catch (e) {
      const msg = String(e.message || e).slice(0, 250);
      if (c.attempts >= (c.maxAttempts || 3)) {
        c.status = "failed"; c.error = msg; c.escalatedAt = Date.now();
        c.audit.push({ ts: Date.now(), status: "failed", note: msg });
        failed++;
      } else {
        c.status = "queued"; c.error = msg;
        c.audit.push({ ts: Date.now(), status: "queued", note: "cloud exec retry: " + msg });
      }
    }
  }
  doc.ts = Date.now();
  await cmds.setJSON(CMD_KEY, doc);
  return json({ ok: true, processed: { done, failed } });
};
