// Client — POST payment screenshot (Zelle or check) to Netlify vision function.
const REMOTE = "https://leelectrical.us/.netlify/functions";

function base() {
  if (typeof location !== "undefined" && /(^|\.)leelectrical\.us$/.test(location.hostname)) {
    return "/.netlify/functions";
  }
  return REMOTE;
}

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
 * Analyze a payment screenshot via backend vision.
 * @param {string} imageBase64 — raw base64, no data: prefix
 * @param {string} mime — e.g. image/png
 * @param {"zelle"|"check"} kind
 */
export async function analyzePaymentScreenshot(imageBase64, mime = "image/jpeg", kind = "zelle") {
  const k = kind === "check" ? "check" : "zelle";
  const res = await fetch(`${base()}/payment-vision?cb=${Date.now()}`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: imageBase64, mime, kind: k }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Vision failed (${res.status})`);
  }
  return data.extracted;
}

/** Back-compat — Zelle screenshots. */
export async function analyzeZelleScreenshot(imageBase64, mime = "image/jpeg") {
  return analyzePaymentScreenshot(imageBase64, mime, "zelle");
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

/** Pick the best check vs zelle vision result using text hint and extracted fields. */
export function pickPaymentAnalysis({ checkResult, zelleResult, textHint = "", fileName = "" }) {
  const hint = String(textHint || "")
    .trim()
    .toLowerCase();
  const wantsCheck = /\b(?:check|cheque|deposit)\b/.test(hint);
  const wantsZelle = /\b(?:zelle?|zell)\b/.test(hint);

  if (wantsCheck && checkResult) return { extracted: checkResult, kind: "check" };
  if (wantsZelle && zelleResult) return { extracted: zelleResult, kind: "zelle" };

  const checkKind = detectPaymentKind(checkResult, fileName);
  const zelleKind = detectPaymentKind(zelleResult, fileName);
  if (checkKind === "check" && checkResult?.checkNumber) return { extracted: checkResult, kind: "check" };
  if (zelleKind === "zelle" && zelleResult?.confirmationNumber) return { extracted: zelleResult, kind: "zelle" };

  const checkScore = paymentExtractScore(checkResult);
  const zelleScore = paymentExtractScore(zelleResult);
  if (checkScore >= zelleScore && checkResult) {
    const merged =
      checkResult.checkNumber || !zelleResult
        ? checkResult
        : { ...zelleResult, checkNumber: checkResult.checkNumber, kind: "check" };
    return { extracted: merged, kind: detectPaymentKind(merged, fileName) || "check" };
  }
  if (zelleResult) return { extracted: zelleResult, kind: "zelle" };
  return { extracted: checkResult || zelleResult, kind: checkKind || zelleKind || "check" };
}

/** Run check + zelle vision and pick the best result for the text hint / image. */
export async function analyzePaymentImage(imageBase64, mime = "image/jpeg", textHint = "", fileName = "") {
  const [checkResult, zelleResult] = await Promise.all([
    analyzePaymentScreenshot(imageBase64, mime, "check").catch(() => null),
    analyzePaymentScreenshot(imageBase64, mime, "zelle").catch(() => null),
  ]);
  return pickPaymentAnalysis({ checkResult, zelleResult, textHint, fileName });
}