// Photo pages for letterhead letters — Levi 2026-08-10.
//
// Photos attached to a letter (evidence for a Load Letter / inspection) are
// appended as their own pages inside the SAME letter PDF, so they ride along
// with the invoice email instead of being separate loose files.
//
// The letterhead writer embeds DCTDecode JPEG only, so every source image is
// normalized to baseline JPEG here and its TRUE pixel dimensions are carried
// through. Layout then contains each photo inside the page box at its native
// proportions — never stretched to fill.

import { jpegImageFromDataUrl, jpegDimensions } from "./companyLogoPdf.js";

/** Longest edge kept for an embedded photo — plenty for print, keeps email small. */
const MAX_EDGE = 1400;

/**
 * Scale a w×h image to fit inside boxW×boxH WITHOUT distortion.
 * Contain, never fill: the smaller ratio wins, so proportions are preserved and
 * a portrait stays portrait / a landscape stays landscape.
 *
 * @returns {{ width: number, height: number, scale: number }}
 */
export function containSize(w, h, boxW, boxH) {
  const srcW = Number(w) > 0 ? Number(w) : 1;
  const srcH = Number(h) > 0 ? Number(h) : 1;
  // Never upscale past native size — blowing up a small photo just blurs it.
  const scale = Math.min(boxW / srcW, boxH / srcH, 1);
  return {
    width: Math.round(srcW * scale * 100) / 100,
    height: Math.round(srcH * scale * 100) / 100,
    scale,
  };
}

/** Convert any image source to a JPEG PDF image with real dimensions (browser). */
async function toJpegImage(src, name) {
  if (!src) return null;

  // Already a JPEG data URL — read dimensions straight from the SOF marker.
  const direct = jpegImageFromDataUrl(src);
  if (direct) return { ...direct, name };

  if (typeof document === "undefined") return null;
  return new Promise((resolve) => {
    try {
      const img = new Image();
      if (/^https?:\/\//i.test(src)) img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          let { naturalWidth: width, naturalHeight: height } = img;
          if (!width || !height) {
            resolve(null);
            return;
          }
          const edge = Math.max(width, height);
          if (edge > MAX_EDGE) {
            const s = MAX_EDGE / edge;
            width = Math.round(width * s);
            height = Math.round(height * s);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(null);
            return;
          }
          // White matte so transparent PNGs don't turn black in DeviceRGB.
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const jpeg = jpegImageFromDataUrl(canvas.toDataURL("image/jpeg", 0.85));
          resolve(jpeg ? { ...jpeg, name } : null);
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
 * Load a letter's photos into embeddable PDF images.
 * Photos that fail to load are skipped — a bad image never blocks the letter.
 *
 * @param {Array<{id?:string,name?:string,url?:string,caption?:string,bytes?:Uint8Array,width?:number,height?:number}>} photos
 * @returns {Promise<Array<{ name:string, width:number, height:number, bytes:Uint8Array, caption:string }>>}
 */
export async function loadLetterPhotoImages(photos = []) {
  const list = Array.isArray(photos) ? photos : [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p) continue;
    const name = "ImPh" + i;
    let img = null;

    // Pre-decoded bytes (tests / server callers) — trust or sniff dimensions.
    if (p.bytes && p.bytes.length) {
      const dim =
        p.width > 0 && p.height > 0
          ? { width: p.width, height: p.height }
          : jpegDimensions(p.bytes);
      if (dim) img = { name, width: dim.width, height: dim.height, bytes: p.bytes };
    }
    if (!img) img = await toJpegImage(p.dataUrl || p.url || "", name);
    if (!img) continue;

    out.push({ ...img, caption: String(p.caption || "").trim() });
  }
  return out;
}

/** True when a draft has at least one photo to append. */
export function draftHasPhotos(draft) {
  return Array.isArray(draft?.photos) && draft.photos.length > 0;
}
