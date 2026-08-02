/**
 * Client for the optional per-tenant Google Drive copy (gdrive-save function).
 *
 * White-label contract: the in-app Con Edison Application tab is ALWAYS the
 * durable record. Drive is an extra copy that only happens when the platform
 * has a GDRIVE credential AND a target folder is known (tenant profile's
 * gdriveFolderId, or the platform GDRIVE_FOLDER_ID fallback). Anything short
 * of that returns { ok:false, skipped:true } and callers move on silently.
 */
import { functionsBase } from "../functionsBase.js";
import { authHeader } from "../session.js";
import { activeTenantConfig } from "../tenantBranding.js";

/** Per-tenant Drive folder id from the live tenant profile (Settings). */
export function tenantGdriveFolderId(config) {
  const cfg = config || activeTenantConfig() || {};
  return String(cfg?.profile?.gdriveFolderId || "").trim();
}

/**
 * Upload a completed application PDF to the tenant's Drive folder.
 * Never throws; { ok:false, skipped:true } means "not configured — move on".
 */
export async function saveConedToDriveApi({
  pdfB64,
  filename,
  folderId = "",
  subfolder = "",
  base = functionsBase,
} = {}) {
  const fid = String(folderId || tenantGdriveFolderId() || "").trim();
  try {
    const res = await fetch(`${base()}/gdrive-save`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        ...(await authHeader()),
      },
      body: JSON.stringify({
        op: "save",
        filename: String(filename || "application.pdf"),
        pdfB64: String(pdfB64 || ""),
        folderId: fid,
        subfolder: String(subfolder || ""),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      return {
        ok: true,
        id: data.id || "",
        webViewLink: data.webViewLink || "",
        folderId: data.folderId || fid,
        mode: data.mode || "",
      };
    }
    return {
      ok: false,
      skipped: data.skipped === true,
      reason: data.reason || data.error || `gdrive HTTP ${res.status}`,
    };
  } catch (err) {
    // Network / preview without the function — treat as unconfigured.
    return { ok: false, skipped: true, reason: String(err?.message || err) };
  }
}

/** Whether the platform has a Drive credential (for Settings display). */
export async function gdriveStatus({ base = functionsBase } = {}) {
  try {
    const res = await fetch(`${base()}/gdrive-save`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        ...(await authHeader()),
      },
      body: JSON.stringify({ op: "status" }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) return data;
    return { ok: false, configured: false, error: data.error || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, configured: false, error: String(err?.message || err) };
  }
}
