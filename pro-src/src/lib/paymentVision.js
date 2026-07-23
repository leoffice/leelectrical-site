// Client — POST payment screenshot (Zelle or check) to Netlify vision function.
import { functionsBase as base } from "./functionsBase.js";
import { formatLearningForPrompt } from "./paymentVisionLearning.js";

/** Strip data-URL wrapper / whitespace so xAI always gets pure base64. */
export function normalizeImageBase64(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  const m = s.match(/^data:([^;]+);base64,(.+)$/i);
  if (m) s = m[2];
  // FileReader / some WebViews inject newlines in long base64 strings.
  return s.replace(/\s+/g, "");
}

/** Normalize mime for vision (Android often sends image/jpg). */
export function normalizeVisionMime(mime, fallback = "image/jpeg") {
  const m = String(mime || "").trim().toLowerCase();
  if (!m || m === "application/octet-stream") return fallback;
  if (m === "image/jpg") return "image/jpeg";
  if (m.startsWith("image/")) return m;
  return fallback;
}

/** Read a File as base64 (no data: prefix). */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || "");
      resolve(normalizeImageBase64(data));
    };
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Sample canvas for near-white wash (iPad WebView blank-canvas bug).
 * A washed canvas still makes a 15–40KB JPEG — size checks alone miss it.
 */
export function canvasLooksBlank(ctx, w, h) {
  if (!ctx || w < 1 || h < 1) return true;
  try {
    const sw = Math.min(w, 80);
    const sh = Math.min(h, 50);
    const data = ctx.getImageData(0, 0, sw, sh).data;
    let bright = 0;
    let n = 0;
    // Every 4th pixel is enough to catch uniform white/gray wash.
    for (let i = 0; i < data.length; i += 16) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum > 242) bright += 1;
      n += 1;
    }
    return n > 0 && bright / n > 0.9;
  } catch {
    return false;
  }
}

/**
 * Prepare payment photo bytes for vision. Prefer the original file.
 *
 * Critical history (Mendel check #1356 / $450): server always read the real photo,
 * but iPad Autofill failed because canvas compress washed the image to near-white.
 * White JPEGs still pass old size gates (~20KB) → vision returns ok + empty fields
 * → toast "Couldn't read amount or check #".
 *
 * Policy: send original for anything under ~5.5MB (live server handles 3.6–4.9MB).
 * Only canvas-downscale truly huge files; reject washed canvases and keep original.
 * Returns { b64, mime, usedCompress }.
 */
export async function compressImageForVision(file, maxEdge = 1600, quality = 0.82) {
  if (!file) {
    return { b64: "", mime: "image/jpeg", usedCompress: false };
  }
  const origMime = normalizeVisionMime(file.type, "image/jpeg");
  const origB64 = await fileToBase64(file);
  const orig = { b64: origB64, mime: origMime, usedCompress: false };

  // Live payment-vision accepts multi-MB check photos — skip canvas for normal phones.
  const size = Number(file.size) || 0;
  if (size > 0 && size <= 5_500_000) {
    return orig;
  }
  // Unknown size but short base64 ≈ under ~4MB decoded — also safe as-is.
  if (!size && origB64 && origB64.length <= 5_500_000) {
    return orig;
  }

  if (typeof createImageBitmap !== "function") {
    return orig;
  }
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    // Reject absurdly small bitmaps (decode failure → blank read).
    if (bmp.width < 32 || bmp.height < 32) {
      bmp.close?.();
      return orig;
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close?.();
      return orig;
    }
    // White fill first — if drawImage fails silently we detect wash below.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    if (canvasLooksBlank(ctx, w, h)) {
      return orig;
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size < 8000) {
      // Blank/near-empty canvas — keep original bytes.
      return orig;
    }
    // Compressed "succeeded" but is absurdly smaller than source → likely blank wash.
    if (size > 80_000 && blob.size < Math.min(20_000, size * 0.02)) {
      return orig;
    }
    const b64 = await fileToBase64(new File([blob], "vision.jpg", { type: "image/jpeg" }));
    if (!b64 || b64.length < 4000) return orig;
    return { b64, mime: "image/jpeg", usedCompress: true };
  } catch {
    return orig;
  }
}

/**
 * Analyze a payment screenshot via backend vision.
 * @param {string} imageBase64 — raw base64, no data: prefix
 * @param {string} mime — e.g. image/png
 * @param {"zelle"|"check"|"intent"} kind
 * @param {{ learningEntries?: object[] }} [opts] — Levi corrections for few-shot training
 */
export async function analyzePaymentScreenshot(imageBase64, mime = "image/jpeg", kind = "zelle", opts = {}) {
  const k = kind === "check" ? "check" : kind === "intent" ? "intent" : "zelle";
  const learningEntries = Array.isArray(opts.learningEntries) ? opts.learningEntries : [];
  const skipLearning = opts.skipLearning === true;
  const learningHint =
    k === "intent" || skipLearning
      ? ""
      : formatLearningForPrompt(learningEntries, k === "zelle" ? "zelle" : "check");
  const image = normalizeImageBase64(imageBase64);
  const safeMime = normalizeVisionMime(mime, "image/jpeg");
  if (!image) {
    throw new Error("Check photo was empty — re-attach the picture and try Autofill again");
  }
  const res = await fetch(`${base()}/payment-vision?cb=${Date.now()}`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      image,
      mime: safeMime,
      kind: k,
      ...(learningHint ? { learningHint } : {}),
    }),
  });
  const rawText = await res.text().catch(() => "");
  let data = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = {};
  }
  if (!res.ok || !data.ok) {
    // CF custom domains strip 502 JSON bodies → bare "error code: 502". Map that to a clear message.
    const bare502 = /error code:\s*502/i.test(rawText) || res.status === 502;
    const msg =
      data.error ||
      (bare502
        ? "Check reader hit a server glitch — try Autofill again or a clearer photo"
        : rawText && rawText.length < 200
          ? rawText
          : `Vision failed (${res.status})`);
    throw new Error(msg);
  }
  return data.extracted;
}

/** Back-compat — Zelle screenshots. */
export async function analyzeZelleScreenshot(imageBase64, mime = "image/jpeg", opts = {}) {
  return analyzePaymentScreenshot(imageBase64, mime, "zelle", opts);
}

/** General image intent — invoice #, address, document type (shared Telegram + bubble). */
export async function analyzeImageIntent(imageBase64, mime = "image/jpeg") {
  return analyzePaymentScreenshot(imageBase64, mime, "intent");
}

/** Guess payment kind from vision output or filename hint. */
export function detectPaymentKind(extracted, fileName = "") {
  if (extracted?.kind === "check" || extracted?.checkNumber) return "check";
  const hay = (extracted?.confirmationNumber || "") + " " + (fileName || "");
  if (/^jpm/i.test(hay) || /zelle/i.test(fileName || "")) return "zelle";
  if (extracted?.checkNumber || /\bcheck\b/i.test(fileName || "")) return "check";
  if (extracted?.confirmationNumber) return "zelle";
  return null;
}

function paymentExtractScore(extracted) {
  if (!extracted) return 0;
  let s = 0;
  if (extracted.amount > 0) s += 2;
  if (extracted.checkNumber) s += 4;
  if (extracted.confirmationNumber) s += 3;
  if (extracted.memo) s += 1;
  return s;
}

/**
 * Merge two vision extracts so a "winning" kind does not drop fields the other pass found.
 * Classic bug: check pass finds check # but misses $ box; zelle pass finds amount → old picker
 * returned check-only and left amount empty (Israel could read it; Autofill could not).
 */
export function mergePaymentExtracts(primary, secondary) {
  if (!primary && !secondary) return null;
  if (!primary) return secondary ? { ...secondary } : null;
  if (!secondary) return { ...primary };
  const out = { ...primary };
  const fill = (key, preferTruthy = true) => {
    const a = out[key];
    const b = secondary[key];
    const emptyA = a == null || a === "" || (preferTruthy && a === 0);
    if (emptyA && b != null && b !== "") out[key] = b;
  };
  fill("amount");
  fill("checkNumber");
  fill("confirmationNumber");
  fill("date");
  fill("memo");
  fill("payer");
  fill("payee");
  fill("invoiceNumber");
  fill("name");
  // Prefer non-low confidence when either side is high.
  if (out.confidence !== "high" && secondary.confidence === "high") out.confidence = "high";
  return out;
}

/** Pick the best check vs zelle vision result using text hint and extracted fields. */
export function pickPaymentAnalysis({ checkResult, zelleResult, textHint = "", fileName = "" }) {
  const hint = String(textHint || "")
    .trim()
    .toLowerCase();
  const wantsCheck = /\b(?:check|cheque|deposit)\b/.test(hint);
  const wantsZelle = /\b(?:zelle?|zell)\b/.test(hint);

  // Always merge complementary fields — never throw away amount/check# from the other pass.
  if (wantsCheck && checkResult) {
    const extracted = mergePaymentExtracts(checkResult, zelleResult);
    return { extracted, kind: "check" };
  }
  if (wantsZelle && zelleResult) {
    const extracted = mergePaymentExtracts(zelleResult, checkResult);
    return { extracted, kind: "zelle" };
  }

  const checkKind = detectPaymentKind(checkResult, fileName);
  const zelleKind = detectPaymentKind(zelleResult, fileName);
  if (checkKind === "check" && checkResult?.checkNumber) {
    const extracted = mergePaymentExtracts(checkResult, zelleResult);
    return { extracted, kind: "check" };
  }
  if (zelleKind === "zelle" && zelleResult?.confirmationNumber) {
    const extracted = mergePaymentExtracts(zelleResult, checkResult);
    return { extracted, kind: "zelle" };
  }

  const checkScore = paymentExtractScore(checkResult);
  const zelleScore = paymentExtractScore(zelleResult);
  if (checkScore >= zelleScore && checkResult) {
    const extracted = mergePaymentExtracts(checkResult, zelleResult);
    return { extracted, kind: detectPaymentKind(extracted, fileName) || "check" };
  }
  if (zelleResult) {
    const extracted = mergePaymentExtracts(zelleResult, checkResult);
    return { extracted, kind: "zelle" };
  }
  return { extracted: checkResult || zelleResult, kind: checkKind || zelleKind || "check" };
}

function extractLooksStrong(extracted) {
  if (!extracted) return false;
  const amt = Number(extracted.amount);
  const hasAmt = Number.isFinite(amt) && amt > 0;
  const hasRef = !!(extracted.checkNumber || extracted.confirmationNumber);
  return hasAmt && hasRef;
}

/**
 * Run vision for a payment photo.
 * When the user already chose Check or Zelle, prefer that pass first (one round-trip,
 * less double-failure). Only call the other kind when amount/ref is still missing —
 * then merge so a partial check # + zelle amount can still fill the form.
 * If every call fails, throw (do not pretend the check was blank).
 */
export async function analyzePaymentImage(
  imageBase64,
  mime = "image/jpeg",
  textHint = "",
  fileName = "",
  opts = {}
) {
  const visionOpts = { learningEntries: opts.learningEntries };
  const hint = String(textHint || "")
    .trim()
    .toLowerCase();
  const wantsCheck = /\b(?:check|cheque|deposit)\b/.test(hint) || opts.forceKind === "check";
  const wantsZelle = /\b(?:zelle?|zell)\b/.test(hint) || opts.forceKind === "zelle";

  let checkResult = null;
  let zelleResult = null;
  const errors = [];

  const run = async (kind) => {
    try {
      return await analyzePaymentScreenshot(imageBase64, mime, kind, visionOpts);
    } catch (e) {
      errors.push(e);
      return null;
    }
  };

  if (wantsCheck && !wantsZelle) {
    checkResult = await run("check");
    // Second pass only when primary is weak — merge can still recover amount.
    if (!extractLooksStrong(checkResult)) {
      zelleResult = await run("zelle");
    }
  } else if (wantsZelle && !wantsCheck) {
    zelleResult = await run("zelle");
    if (!extractLooksStrong(zelleResult)) {
      checkResult = await run("check");
    }
  } else {
    // Unknown kind — parallel both, then pick.
    const [c, z] = await Promise.all([run("check"), run("zelle")]);
    checkResult = c;
    zelleResult = z;
  }

  if (!checkResult && !zelleResult) {
    const msg = errors.map((e) => String(e?.message || e)).filter(Boolean)[0];
    throw new Error(msg || "Could not reach the check reader");
  }

  let picked = pickPaymentAnalysis({ checkResult, zelleResult, textHint, fileName });

  // Empty "success" is often a blank canvas / poisoned few-shot — one clean retry.
  const empty =
    !picked?.extracted ||
    !(
      (Number(picked.extracted.amount) > 0) ||
      picked.extracted.checkNumber ||
      picked.extracted.confirmationNumber ||
      picked.extracted.memo ||
      picked.extracted.invoiceNumber
    );
  if (empty && !opts._retriedClean && (wantsCheck || !wantsZelle)) {
    try {
      const clean = await analyzePaymentScreenshot(imageBase64, mime, "check", {
        ...visionOpts,
        skipLearning: true,
      });
      if (clean && (Number(clean.amount) > 0 || clean.checkNumber || clean.memo)) {
        return { extracted: clean, kind: "check" };
      }
    } catch {
      /* keep original pick */
    }
  }

  return picked;
}