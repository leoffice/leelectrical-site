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

export const CHECK_VISION_PROMPT = `You are reading a paper check or mobile check-deposit photo for LE Electrical payment entry.
Extract these fields carefully and return ONLY valid JSON (no markdown):
{
  "amount": <number USD, no $ sign — use the numeric amount box (usually right side), not the written-out words unless the box is unreadable>,
  "checkNumber": <printed check number as digits only — upper-right of the check AND/OR the MICR check-number field at the bottom (after routing/account). Do NOT put invoice numbers here>,
  "date": <YYYY-MM-DD from the DATE line on the check (usually top-right). Convert MM/DD/YY or MM/DD/YYYY to YYYY-MM-DD>,
  "memo": <memo line text exactly as written, or null>,
  "payee": <"Pay to the order of" name — usually the business being paid>,
  "payer": <name of the person/company who wrote the check — usually printed top-left under/near the address block, or the account-holder name. NOT the payee>,
  "invoiceNumber": <invoice or job number if present. Rules: (1) if memo/anywhere says Inv/Invoice/# then use those digits; (2) if memo or note is just a bare number (no English word like "check"/"acct"), treat that number as the invoice number; (3) digits only, typically 4–7 digits. Else null>,
  "confidence": <"high" or "low">
}
If a field is missing or unreadable use null.
Critical: amount + date + checkNumber whenever visible. payer helps match the customer. invoiceNumber matches the right invoice — prefer a bare memo number as invoice, not as check number.`;

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
  const amt = raw.amount != null ? parseFloat(String(raw.amount).replace(/[$,*\s]/g, "")) : null;
  const conf = String(raw.confidence || "").toLowerCase() === "low" ? "low" : "high";
  let date = raw.date ? String(raw.date).trim() : "";
  const dm = date.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dm) {
    const yr = dm[3].length === 2 ? "20" + dm[3] : dm[3];
    date = `${yr}-${dm[1].padStart(2, "0")}-${dm[2].padStart(2, "0")}`;
  }
  const checkNo = raw.checkNumber ? String(raw.checkNumber).replace(/\D/g, "").trim() : "";
  const confNo = raw.confirmationNumber ? String(raw.confirmationNumber).trim() : "";
  let invNo = String(raw.invoiceNumber || raw.invoiceNo || "")
    .replace(/\D/g, "")
    .trim();
  const memo = raw.memo ? String(raw.memo).trim() : "";
  // Bare memo number (no letters) on a check is almost always the invoice #.
  if (!invNo && kind === "check" && memo) {
    const bare = memo.match(/^\s*#?\s*(\d{4,7})\s*$/);
    if (bare) invNo = bare[1];
  }
  const ref = kind === "check" ? checkNo : confNo;
  const payer = raw.payer ? String(raw.payer).trim() : "";
  const payee = raw.payee ? String(raw.payee).trim() : "";
  return {
    amount: Number.isFinite(amt) && amt > 0 ? amt : null,
    confirmationNumber: ref,
    checkNumber: checkNo,
    invoiceNumber: invNo || "",
    date,
    memo,
    payee,
    payer,
    // Alias for older callers that only looked at payee for "who paid".
    name: payer || payee || "",
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
  const amt = raw.amount != null ? parseFloat(String(raw.amount).replace(/[$,*\s]/g, "")) : null;
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
 * kind: "zelle" | "check" | "intent"
 * learningHint: optional few-shot text from Levi's field corrections (trains the reader).
 */
export async function extractPaymentFromImage({
  imageBase64,
  mime = "image/jpeg",
  kind = "zelle",
  learningHint = "",
}) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return { dryRun: true, extracted: null, error: "XAI_API_KEY not set" };
  }
  const model = process.env.XAI_VISION_MODEL || "grok-4.5";
  const k = kind === "check" ? "check" : kind === "intent" ? "intent" : "zelle";
  const hint = String(learningHint || "").trim();
  const prompt = hint ? `${PROMPTS[k]}\n\n${hint}` : PROMPTS[k];
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