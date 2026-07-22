import { getStore } from "./lib/storage/index.mjs";
import { rotateJsonBackup } from "./blob-backup.mjs";
import {
  DOC_KEY,
  emptyDoc,
  mintLicense,
  revokeLicense,
  statusPayload,
  validateLicense,
} from "./lib/assistantLicense.mjs";

/**
 * AI Assistant paid licenses.
 * GET  → status (list licenses, no secrets)
 * POST → { op: mint|validate|revoke|status }
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
  return (await store.get(DOC_KEY, { type: "json", consistency: "strong" })) || emptyDoc();
}

async function save(store, doc) {
  await rotateJsonBackup(store, DOC_KEY, doc);
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });

  const store = getStore("settings");
  let doc = await load(store);

  if (req.method === "GET") {
    return json(statusPayload(doc));
  }

  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const op = String(body.op || "status").toLowerCase();

  if (op === "status" || op === "list") {
    return json(statusPayload(doc));
  }

  if (op === "mint") {
    const result = mintLicense(doc, {
      kind: body.kind,
      label: body.label,
    });
    await save(store, result.doc);
    if (!result.ok) return json({ ok: false, error: result.error }, 400);
    return json({
      ok: true,
      token: result.token,
      license: result.license,
      ...statusPayload(result.doc),
      message:
        result.license?.kind === "owner"
          ? "Your unlimited owner token — copy it now; it is only shown once."
          : "Customer token ready — copy it once and send it to them.",
    });
  }

  if (op === "validate" || op === "activate" || op === "redeem") {
    const result = validateLicense(doc, body.token || body.code || body.license);
    await save(store, result.doc);
    if (!result.ok) return json({ ok: false, error: result.error, entitled: false }, 400);
    return json({
      ok: true,
      entitled: true,
      unlimited: true,
      license: result.license,
      message: "Assistant unlocked — unlimited use.",
    });
  }

  if (op === "revoke") {
    const result = revokeLicense(doc, body.licenseId || body.id);
    await save(store, result.doc);
    if (!result.ok) return json({ ok: false, error: result.error }, 400);
    return json({
      ok: true,
      license: result.license,
      ...statusPayload(result.doc),
      message: result.already ? "Already revoked." : "License revoked.",
    });
  }

  return json({ ok: false, error: `unknown op: ${op}` }, 400);
};
