/** Shared payment screenshot vision (Zelle + check) via xAI Grok vision. */
import {
  parseVisionJson,
  textFromResponsesBody,
} from "./zelleVision.mjs";

export { parseVisionJson };

export const ZELLE_VISION_PROMPT = `You are reading a Zelle payment confirmation screenshot (bank app or email).
Extract these fields and return ONLY valid JSON (no markdown):
{
  "amount": <number USD, no $ sign>,
  "confirmationNumber": <Zelle confirmation/reference, often JPM…>,
  "date": <YYYY-MM-DD payment date>,
  "memo": <memo/note text exactly as shown>,
  "confidence": <"high" or "low">
}
If a field is missing or unreadable use null. confirmationNumber is critical.`;

export const CHECK_VISION_PROMPT = `You are reading a paper check or mobile check-deposit image.
Extract these fields and return ONLY valid JSON (no markdown):
{
  "amount": <number USD, no $ sign>,
  "checkNumber": <check number printed on the check>,
  "date": <YYYY-MM-DD date on the check>,
  "memo": <memo line text exactly as written>,
  "payee": <pay to the order of name>,
  "confidence": <"high" or "low">
}
If a field is missing or unreadable use null. checkNumber and amount are critical.`;

export const IMAGE_INTENT_PROMPT = `You are reading a photo Levi sent LE Electrical (payment proof, invoice, estimate, job site, document, or screenshot).
Extract visible clues and return ONLY valid JSON (no markdown):
{
  "documentType": <"payment"|"invoice"|"estimate"|"job_site"|"other">,
  "invoiceNumbers": [<5-6 digit invoice/job numbers visible, as strings>],
  "addresses": [<street addresses visible, as strings>],
  "amount": <USD number if a payment amount is visible, else null>,
  "paymentMethod": <"zelle"|"check"|"card"|null>,
  "memo": <memo/note text exactly as shown, or null>,
  "confidence": <"high"|"low">
}
If a field is missing use null or []. invoiceNumbers and addresses are critical for job lookup.`;

const PROMPTS = {
  zelle: ZELLE_VISION_PROMPT,
  check: CHECK_VISION_PROMPT,
  intent: IMAGE_INTENT_PROMPT,
};

/** Normalize vision model output to app shape (Zelle + check). */
export function normalizePaymentExtracted(raw, kind = "zelle") {
  if (!raw || typeof raw !== "object") return null;
  const amt = raw.amount != null ? parseFloat(String(raw.amount).replace(/[$,]/g, "")) : null;
  const conf = String(raw.confidence || "").toLowerCase() === "low" ? "low" : "high";
  let date = raw.date ? String(raw.date).trim() : "";
  const dm = date.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dm) {
    const yr = dm[3].length === 2 ? "20" + dm[3] : dm[3];
    date = `${yr}-${dm[1].padStart(2, "0")}-${dm[2].padStart(2, "0")}`;
  }
  const checkNo = raw.checkNumber ? String(raw.checkNumber).trim() : "";
  const confNo = raw.confirmationNumber ? String(raw.confirmationNumber).trim() : "";
  const ref = kind === "check" ? checkNo : confNo;
  return {
    amount: Number.isFinite(amt) && amt > 0 ? amt : null,
    confirmationNumber: ref,
    checkNumber: checkNo,
    date,
    memo: raw.memo ? String(raw.memo).trim() : "",
    payee: raw.payee ? String(raw.payee).trim() : "",
    confidence: conf,
    kind,
  };
}

/** Normalize general image-intent vision output. */
export function normalizeIntentExtracted(raw) {
  if (!raw || typeof raw !== "object") return null;
  const invs = Array.isArray(raw.invoiceNumbers)
    ? raw.invoiceNumbers.map((n) => String(n).replace(/\D/g, "")).filter((n) => n.length >= 5)
    : [];
  const addrs = Array.isArray(raw.addresses)
    ? raw.addresses.map((a) => String(a).trim()).filter(Boolean)
    : [];
  const amt = raw.amount != null ? parseFloat(String(raw.amount).replace(/[$,]/g, "")) : null;
  const doc = String(raw.documentType || "other").toLowerCase();
  const pm = raw.paymentMethod ? String(raw.paymentMethod).toLowerCase() : null;
  return {
    documentType: ["payment", "invoice", "estimate", "job_site"].includes(doc) ? doc : "other",
    invoiceNumbers: [...new Set(invs)],
    addresses: [...new Set(addrs)],
    amount: Number.isFinite(amt) && amt > 0 ? amt : null,
    paymentMethod: pm === "zelle" || pm === "check" || pm === "card" ? pm : null,
    memo: raw.memo ? String(raw.memo).trim() : "",
    confidence: String(raw.confidence || "").toLowerCase() === "low" ? "low" : "high",
    kind: "intent",
  };
}

/** Back-compat alias used by zelle tests. */
export function normalizeExtracted(raw) {
  return normalizePaymentExtracted(raw, "zelle");
}

async function callVision({ imageBase64, mime, prompt, model, apiKey }) {
  const dataUrl = `data:${mime};base64,${imageBase64}`;
  let text = "";

  try {
    const r = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_image", image_url: dataUrl, detail: "high" },
              { type: "input_text", text: prompt },
            ],
          },
        ],
      }),
    });
    if (r.ok) {
      const body = await r.json();
      text = textFromResponsesBody(body);
    }
  } catch {
    /* fall through */
  }

  if (!text) {
    const r = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
              { type: "text", text: prompt },
            ],
          },
        ],
        temperature: 0,
      }),
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`xAI vision ${r.status}: ${err.slice(0, 200)}`);
    }
    const body = await r.json();
    text = textFromResponsesBody(body);
  }

  return text;
}

/**
 * Call xAI vision API. Returns normalized extracted fields or throws.
 * kind: "zelle" | "check"
 */
export async function extractPaymentFromImage({ imageBase64, mime = "image/jpeg", kind = "zelle" }) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return { dryRun: true, extracted: null, error: "XAI_API_KEY not set" };
  }
  const model = process.env.XAI_VISION_MODEL || "grok-4.5";
  const k = kind === "check" ? "check" : kind === "intent" ? "intent" : "zelle";
  const prompt = PROMPTS[k];
  const text = await callVision({ imageBase64, mime, prompt, model, apiKey });
  const parsed = parseVisionJson(text);
  const extracted =
    k === "intent" ? normalizeIntentExtracted(parsed) : normalizePaymentExtracted(parsed, k);
  if (!extracted) throw new Error("Could not parse vision response");
  return { dryRun: false, extracted, model, kind: k };
}

/** Back-compat wrapper for Zelle-only callers. */
export async function extractZelleFromImage(opts) {
  const result = await extractPaymentFromImage({ ...opts, kind: "zelle" });
  return result;
}