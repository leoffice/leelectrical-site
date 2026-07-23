// Resolve the account-holder company logo for invoice/estimate PDFs.
// Priority: explicit override → tenant profile/branding → device settings → LE default.
// PDF assembler only embeds DCTDecode JPEG, so non-JPEG sources are converted.

import { LE_LOGO_JPEG, leLogoJpegBytes } from "./leLogoJpeg.js";
import { getCompanyLogoDataUrl } from "./appSettings.js";
import { activeTenantConfig } from "./tenantBranding.js";

function base64ToBytes(b64) {
  const clean = String(b64 || "").replace(/\s+/g, "");
  const bin =
    typeof atob === "function"
      ? atob(clean)
      : Buffer.from(clean, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
}

/** Read width/height from a baseline JPEG SOF0/SOF2 marker. */
export function jpegDimensions(bytes) {
  if (!bytes || bytes.length < 4) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i < bytes.length - 9) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    // SOF0 / SOF1 / SOF2
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      if (width > 0 && height > 0) return { width, height };
      return null;
    }
    if (len < 2) break;
    i += 2 + len;
  }
  return null;
}

export function defaultLeLogoImage() {
  return {
    name: "ImLogo",
    width: LE_LOGO_JPEG.width,
    height: LE_LOGO_JPEG.height,
    bytes: leLogoJpegBytes(),
  };
}

/** Decode a data:image/jpeg;base64,… URL into a PDF image object. */
export function jpegImageFromDataUrl(dataUrl) {
  const m = String(dataUrl || "").match(/^data:image\/jpe?g;base64,(.+)$/i);
  if (!m) return null;
  try {
    const bytes = base64ToBytes(m[1]);
    const dim = jpegDimensions(bytes);
    if (!dim) return null;
    return { name: "ImLogo", width: dim.width, height: dim.height, bytes };
  } catch {
    return null;
  }
}

/**
 * Company logo source for PDFs.
 * Returns a data URL or http(s) URL, or "" when using the built-in LE mark.
 */
export function resolveCompanyLogoDataUrl(overrides = {}) {
  if (overrides.logoDataUrl) return String(overrides.logoDataUrl);
  if (overrides.logoUrl) return String(overrides.logoUrl);

  try {
    const cfg = activeTenantConfig() || {};
    const branding = cfg.branding || {};
    const profile = cfg.profile || {};
    const fromTenant =
      branding.logoUrl || profile.logoDataUrl || branding.logoDataUrl || "";
    if (fromTenant) return String(fromTenant);
  } catch {
    /* ignore */
  }

  try {
    const local = getCompanyLogoDataUrl();
    if (local) return String(local);
  } catch {
    /* ignore */
  }

  return "";
}

/**
 * Sync resolve — JPEG data URLs + LE fallback.
 * PNG/http sources need resolvePdfLogoImage (async) for conversion.
 */
export function resolvePdfLogoImageSync(data = {}) {
  if (data?.logoImage && data.logoImage.bytes) {
    return {
      name: data.logoImage.name || "ImLogo",
      width: data.logoImage.width,
      height: data.logoImage.height,
      bytes: data.logoImage.bytes,
    };
  }
  const src = resolveCompanyLogoDataUrl(data);
  if (src) {
    const jpeg = jpegImageFromDataUrl(src);
    if (jpeg) return jpeg;
  }
  return defaultLeLogoImage();
}

/**
 * Convert any image source (data URL or http URL) to a JPEG PDF image via canvas.
 * Falls back to null when no DOM / load fails (Node tests without canvas).
 */
export async function imageUrlToJpegImage(src, maxEdge = 512) {
  if (!src || typeof document === "undefined") return null;
  return new Promise((resolve) => {
    try {
      const img = new Image();
      // Only needed for remote URLs; data URLs ignore it.
      if (/^https?:\/\//i.test(src)) img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          let { width, height } = img;
          if (!width || !height) {
            resolve(null);
            return;
          }
          const edge = Math.max(width, height);
          if (edge > maxEdge) {
            const scale = maxEdge / edge;
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
          resolve(jpegImageFromDataUrl(dataUrl));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    } catch {
      resolve(null);
    }
  });
}

/**
 * Full resolve for print/email PDFs: company logo when set, else LE default.
 * Converts PNG/WebP/remote logos to JPEG for the zero-dep PDF writer.
 */
export async function resolvePdfLogoImage(data = {}) {
  if (data?.logoImage && data.logoImage.bytes) {
    return {
      name: data.logoImage.name || "ImLogo",
      width: data.logoImage.width,
      height: data.logoImage.height,
      bytes: data.logoImage.bytes,
    };
  }
  const src = resolveCompanyLogoDataUrl(data);
  if (!src) return defaultLeLogoImage();

  const direct = jpegImageFromDataUrl(src);
  if (direct) return direct;

  const converted = await imageUrlToJpegImage(src);
  if (converted) return converted;

  // Custom logo present but unreadable → still fall back so PDF always builds.
  return defaultLeLogoImage();
}
