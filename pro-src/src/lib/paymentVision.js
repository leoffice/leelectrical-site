// Client — POST payment screenshot (Zelle or check) to Netlify vision function.
import { functionsBase as base } from "./functionsBase.js";
import { formatLearningForPrompt } from "./paymentVisionLearning.js";

/** Read a File as base64 (no data: prefix). */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || "");
      const b64 = data.includes(",") ? data.split(",")[1] : data;
      resolve(b64);
    };
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Downscale large payment photos before vision (phone check pics are often 3–8MB
 * and trip gateway 502s). Returns { b64, mime }. Falls back to original on failure.
 */
export async function compressImageForVision(file, maxEdge = 1600, quality = 0.82) {
  if (!file || typeof createImageBitmap !== "function") {
    const b64 = await fileToBase64(file);
    return { b64, mime: file?.type || "image/jpeg" };
  }
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      const b64 = await fileToBase64(file);
      return { b64, mime: file.type || "image/jpeg" };
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) {
      const b64 = await fileToBase64(file);
      return { b64, mime: file.type || "image/jpeg" };
    }
    const b64 = await fileToBase64(new File([blob], "vision.jpg", { type: "image/jpeg" }));
    return { b64, mime: "image/jpeg" };
  } catch {
    const b64 = await fileToBase64(file);
    return { b64, mime: file?.type || "image/jpeg" };
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
  const learningHint =
    k === "intent" ? "" : formatLearningForPrompt(learningEntries, k === "zelle" ? "zelle" : "check");
  const res = await fetch(`${base()}/payment-vision?cb=${Date.now()}`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      image: imageBase64,
      mime,
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

  // At least one pass returned a payload (may still have empty fields = true unread).
  return pickPaymentAnalysis({ checkResult, zelleResult, textHint, fileName });
}