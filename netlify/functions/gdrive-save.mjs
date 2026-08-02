// gdrive-save — OPTIONAL per-tenant Google Drive copy of completed agency
// applications (Con Ed Form A today; any agency form tomorrow).
//
// White-label contract (S25/S26): the durable record is ALWAYS the in-app
// "Con Edison Application" tab (docs store). Drive is an extra copy for
// tenants who want files to land in their own Drive folder. If nothing is
// configured this endpoint answers { ok:false, skipped:true } with HTTP 200
// and callers move on silently — Drive is never a hard requirement.
//
// Configuration (Cloudflare Pages secrets):
//   GDRIVE_SA_JSON      Google service-account key JSON (recommended). The
//                       tenant shares their target folder with the service
//                       account's client_email (Editor) — no OAuth dance.
//   GDRIVE_OAUTH_TOKEN  Either a raw OAuth access token, or a JSON string
//                       { client_id, client_secret, refresh_token } for the
//                       standard refresh-token flow.
//   GDRIVE_FOLDER_ID    Optional platform-wide fallback target folder id.
// Per-tenant target: the request's folderId (from tenant profile Settings →
// "Google Drive folder ID") wins over GDRIVE_FOLDER_ID.
//
// Ops:
//   POST { op:"status" }
//     -> { ok:true, configured, mode:"sa"|"oauth"|null, saEmail }
//        (Settings uses saEmail to tell the tenant which address to share
//         their folder with.)
//   POST { op:"save", filename, pdfB64, folderId?, subfolder?, mime? }
//     -> { ok:true, id, name, webViewLink, folderId }
//     -> { ok:false, skipped:true, reason } when unconfigured / no folder
//     -> { ok:false, error } on a real Drive failure

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const MAX_PDF_BYTES = 10 * 1024 * 1024; // Con Ed upload cap; sane for Drive too

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    },
  });
}

function b64urlFromBytes(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlFromString(s) {
  return b64urlFromBytes(new TextEncoder().encode(s));
}

function pemToPkcs8Bytes(pem) {
  const body = String(pem)
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Resolve credential config without touching the network. */
export function gdriveConfig(env = process.env) {
  const saRaw = String(env.GDRIVE_SA_JSON || "").trim();
  if (saRaw) {
    try {
      const sa = JSON.parse(saRaw);
      if (sa && sa.client_email && sa.private_key) {
        return { mode: "sa", sa, saEmail: sa.client_email };
      }
    } catch {
      /* malformed SA JSON — treated as unconfigured, reported via status */
    }
    return { mode: null, error: "GDRIVE_SA_JSON is set but not valid service-account JSON" };
  }
  const tokRaw = String(env.GDRIVE_OAUTH_TOKEN || "").trim();
  if (tokRaw) {
    if (tokRaw.startsWith("{")) {
      try {
        const t = JSON.parse(tokRaw);
        if (t && t.refresh_token && t.client_id && t.client_secret) {
          return { mode: "oauth", oauth: t };
        }
      } catch {
        /* fall through */
      }
      return {
        mode: null,
        error:
          "GDRIVE_OAUTH_TOKEN JSON must have client_id, client_secret, refresh_token",
      };
    }
    return { mode: "oauth", accessToken: tokRaw };
  }
  return { mode: null };
}

async function saAccessToken(sa) {
  const iat = Math.floor(Date.now() / 1000);
  const header = b64urlFromString(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64urlFromString(
    JSON.stringify({
      iss: sa.client_email,
      scope: DRIVE_SCOPE,
      aud: sa.token_uri || TOKEN_URL,
      iat,
      exp: iat + 3600,
    })
  );
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8Bytes(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${b64urlFromBytes(new Uint8Array(sig))}`;
  const res = await fetch(sa.token_uri || TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`sa token exchange failed: ${data.error_description || data.error || res.status}`);
  }
  return data.access_token;
}

async function oauthAccessToken(oauth) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: oauth.client_id,
      client_secret: oauth.client_secret,
      refresh_token: oauth.refresh_token,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`oauth refresh failed: ${data.error_description || data.error || res.status}`);
  }
  return data.access_token;
}

async function getAccessToken(cfg) {
  if (cfg.mode === "sa") return saAccessToken(cfg.sa);
  if (cfg.mode === "oauth") {
    if (cfg.accessToken) return cfg.accessToken;
    return oauthAccessToken(cfg.oauth);
  }
  throw new Error("gdrive not configured");
}

/** Find (or create) a child folder by name under parentId; returns folder id. */
async function findOrCreateSubfolder(token, parentId, name) {
  const safeName = String(name).replace(/'/g, "\\'");
  const q = `'${parentId}' in parents and name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  const listData = await listRes.json().catch(() => ({}));
  if (listRes.ok && Array.isArray(listData.files) && listData.files.length) {
    return listData.files[0].id;
  }
  const createRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: String(name),
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    }
  );
  const createData = await createRes.json().catch(() => ({}));
  if (!createRes.ok || !createData.id) {
    throw new Error(
      `subfolder create failed: ${createData?.error?.message || createRes.status}`
    );
  }
  return createData.id;
}

async function uploadPdf(token, { folderId, filename, pdfB64, mime }) {
  const boundary = "gdrv" + Math.random().toString(36).slice(2);
  const metadata = {
    name: String(filename || "application.pdf"),
    parents: folderId ? [folderId] : undefined,
  };
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mime || "application/pdf"}\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${pdfB64}\r\n` +
    `--${boundary}--`;
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    throw new Error(`drive upload failed: ${data?.error?.message || res.status}`);
  }
  return data;
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }

  const cfg = gdriveConfig();
  const op = String(body.op || "save");

  if (op === "status") {
    return json({
      ok: true,
      configured: !!cfg.mode,
      mode: cfg.mode,
      saEmail: cfg.saEmail || "",
      fallbackFolder: !!String(process.env.GDRIVE_FOLDER_ID || "").trim(),
      error: cfg.error || "",
    });
  }
  if (op !== "save") return json({ ok: false, error: "unknown op" }, 400);

  if (!cfg.mode) {
    return json({
      ok: false,
      skipped: true,
      reason: cfg.error || "gdrive_not_configured",
    });
  }

  const folderId =
    String(body.folderId || "").trim() ||
    String(process.env.GDRIVE_FOLDER_ID || "").trim();
  if (!folderId) {
    return json({ ok: false, skipped: true, reason: "gdrive_no_folder" });
  }

  const pdfB64 = String(body.pdfB64 || "").replace(/\s+/g, "");
  if (!pdfB64) return json({ ok: false, error: "missing pdfB64" }, 400);
  // Decoded size from base64 length — avoid materializing the buffer.
  const approxBytes = Math.floor(pdfB64.length * 0.75);
  if (approxBytes > MAX_PDF_BYTES) {
    return json({ ok: false, error: "pdf too large (>10MB)" }, 413);
  }
  const filename = String(body.filename || "application.pdf").replace(
    /[^\w .()&'-]/g,
    "_"
  );

  try {
    const token = await getAccessToken(cfg);
    let targetId = folderId;
    const subfolder = String(body.subfolder || "").trim();
    if (subfolder) {
      targetId = await findOrCreateSubfolder(token, folderId, subfolder);
    }
    const file = await uploadPdf(token, {
      folderId: targetId,
      filename,
      pdfB64,
      mime: String(body.mime || "application/pdf"),
    });
    return json({
      ok: true,
      id: file.id,
      name: file.name || filename,
      webViewLink: file.webViewLink || "",
      folderId: targetId,
      mode: cfg.mode,
    });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err) }, 502);
  }
};
