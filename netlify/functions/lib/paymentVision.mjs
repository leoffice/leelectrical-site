/** Shared payment screenshot vision (Zelle + check) via xAI Grok vision. */
import {
  parseVisionJson,
  textFromResponsesBody,
} from "./zelleVision.mjs";

export { parseVisionJson };

export const ZELLE_VISION_PROMPT = `You are reading a Zelle payment confirmation — bank app screenshot OR bank email alert (Wells Fargo, Chase/JPM, etc.).
Extract these fields carefully and return ONLY valid JSON (no markdown):
{
  "amount": <number USD, no $ sign — REQUIRED when any $ figure is visible>,
  "confirmationNumber": <Zelle confirmation/reference exactly as shown — critical. Often JPM…, BAC…, or WFCT…>,
  "date": <YYYY-MM-DD payment date. Convert MM/DD/YY or MM/DD/YYYY>,
  "memo": <memo/note text exactly as shown, or null>,
  "payer": <who SENT the money — the customer name on "X sent you $…" or "from X". NOT the bank name, NOT Wells Fargo chrome>,
  "depositBank": <bank the money was deposited into if shown (e.g. "Wells Fargo"), or null>,
  "invoiceNumber": <invoice/job # if memo has Inv/Invoice/# or a bare 4–7 digit number; digits only, else null>,
  "confidence": <"high" or "low">
}
If a field is missing or unreadable use null. confirmationNumber is critical. Never invent a payer from the bank brand.

LAYOUT MAP (bank email "You received money with Zelle"):
- Subject or body: "X sent you $A.BB" → payer=X, amount=A.BB
- Date: MM/DD/YYYY → YYYY-MM-DD
- Confirmation: long alphanumeric token (JPM… / BAC… / WFCT…)
- Memo: free text after "Memo:" — often street address or invoice #
- Footer: "We deposited the money into your Wells Fargo account" → depositBank=Wells Fargo
- IGNORE chrome: "Wells Fargo home page", "Go to accounts", "Have any questions"

LAYOUT MAP (bank app Zelle receive screen):
- Large $ amount near top
- "From" / sender name = payer
- Confirmation # or Reference
- Optional memo / note / "For"
- Deposit account nickname if shown

GOLD WORKED EXAMPLES (real LE Electrical receives — match this quality):

1) Wells Fargo email — person sender + street memo:
MIRIAM WOLF sent you $2000.00 · Date 07/22/2026 · Confirmation BACzsyfc1ixk · Memo: 157-159 remsen Lein · deposited into Wells Fargo
Correct JSON:
{"amount":2000,"confirmationNumber":"BACzsyfc1ixk","date":"2026-07-22","memo":"157-159 remsen Lein","payer":"MIRIAM WOLF","depositBank":"Wells Fargo","invoiceNumber":null,"confidence":"high"}

2) Wells Fargo email — LLC sender + JPM confirmation (no memo):
IKIPPAH LLC sent you $5000.00 · Date 07/17/2026 · Confirmation JPM99cpprhp9 · deposited into Wells Fargo
Correct JSON:
{"amount":5000,"confirmationNumber":"JPM99cpprhp9","date":"2026-07-17","memo":null,"payer":"IKIPPAH LLC","depositBank":"Wells Fargo","invoiceNumber":null,"confidence":"high"}

3) Screenshot with invoice in memo:
$1,250.00 from Sheleg Electric · Conf JPM88abc123 · Memo: Inv 251841 · Date 2026-07-09
Correct JSON:
{"amount":1250,"confirmationNumber":"JPM88abc123","date":"2026-07-09","memo":"Inv 251841","payer":"Sheleg Electric","depositBank":null,"invoiceNumber":"251841","confidence":"high"}

LE deposit banks you may see (company profile): Martin Dorkin, Wells Fargo, BLZ Chase. Zelle receive identity often office@leelectrical.us.`;

export const CHECK_VISION_PROMPT = `You are reading a paper check or mobile check-deposit photo for LE Electrical payment entry.
Extract these fields carefully and return ONLY valid JSON (no markdown):
{
  "amount": <number USD, no $ sign — REQUIRED when the $ box or written amount is visible. Read the numeric amount box on the RIGHT first (ignore trailing *** or ** fillers — "$450.00***" → 450). Only use the written-out words line if the box is unreadable. Never leave amount null when any dollar figure is visible on the check>,
  "checkNumber": <printed check number as digits only — upper-right of the check AND/OR the MICR check-number field at the bottom (leftmost MICR group). Do NOT put invoice numbers here>,
  "date": <YYYY-MM-DD from the DATE line on the check (usually top-right). Convert "Month DD, YYYY" or MM/DD/YY or MM/DD/YYYY to YYYY-MM-DD>,
  "memo": <memo / For: line text exactly as written, or null>,
  "payee": <"Pay to the order of" name — usually the business being paid (e.g. BLZ Electric Inc.)>,
  "payer": <name of the person/company who wrote the check — usually printed top-left under/near the address block, or the account-holder name. NOT the payee>,
  "invoiceNumber": <invoice or job number if present. Rules: (1) if memo/anywhere says Inv/Invoice/# then use those digits; (2) if memo or "For:" line is just a bare number (no English word like "check"/"acct"), treat that number as the invoice number; (3) digits only, typically 4–7 digits. Else null>,
  "confidence": <"high" or "low">
}
If a field is missing or unreadable use null.
Critical: amount is the #1 field — never skip a readable $ box. Also get date + checkNumber whenever visible. payer helps match the customer. invoiceNumber matches the right invoice — prefer a bare memo/"For:" number as invoice, not as check number.

LAYOUT MAP (standard US business check — read every zone):
- Top-left: payer company name + mailing address (this is "payer", NOT payee)
- Top-right: large printed check number (this is checkNumber)
- Under bank name (often center-right): Date line
- Middle: "Pay to the Order Of" → payee; amount box $###.## on the right (stars after amount are fillers — ignore)
- Written amount line under payee (use only if $ box unreadable)
- Bottom-left "For:" / memo line — often the invoice number alone (e.g. 251843)
- Bottom MICR: ⑆check#⑆ ⑆routing⑆ account — use leftmost group as checkNumber if top-right is blurry

GOLD WORKED EXAMPLE (Chase business check, high confidence):
Payer top-left "Mendel Drizin LLC", check# top-right 1356, Date July 14, 2026 → 2026-07-14, payee "BLZ Electric Inc.", amount box $450.00 → 450, For: 251843 → memo + invoiceNumber 251843.
Correct JSON:
{"amount":450,"checkNumber":"1356","date":"2026-07-14","memo":"251843","payee":"BLZ Electric Inc.","payer":"Mendel Drizin LLC","invoiceNumber":"251843","confidence":"high"}`;

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

/** Parse amount from vision (handles $ , *** fillers, 450.00/100). Shared with client parse spirit. */
export function parseVisionAmount(raw) {
  if (raw == null || raw === "") return null;
  let s = String(raw).trim().replace(/[$*\s]/g, "");
  s = s.replace(/\/\d{0,3}$/, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d{1,3}(\.\d{3})+(,\d+)$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Normalize vision model output to app shape (Zelle + check). */
export function normalizePaymentExtracted(raw, kind = "zelle") {
  if (!raw || typeof raw !== "object") return null;
  // Prefer numeric box; fall back to writtenAmount if model split the fields.
  const amt =
    parseVisionAmount(raw.amount) ??
    parseVisionAmount(raw.amountNumeric) ??
    parseVisionAmount(raw.writtenAmount);
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
  // Zelle memo may be "Inv 251841" or bare digits.
  if (!invNo && kind === "zelle" && memo) {
    const labeled = memo.match(/(?:inv(?:oice)?|#)\s*(\d{4,7})/i);
    if (labeled) invNo = labeled[1];
    else {
      const bare = memo.match(/^\s*#?\s*(\d{4,7})\s*$/);
      if (bare) invNo = bare[1];
    }
  }
  const ref = kind === "check" ? checkNo : confNo;
  // Prefer explicit payer; fall back to fromName / sender (bank emails).
  let payer = raw.payer ? String(raw.payer).trim() : "";
  if (!payer && raw.fromName) payer = String(raw.fromName).trim();
  if (!payer && raw.sender) payer = String(raw.sender).trim();
  // Drop bank chrome mistaken for payer
  if (/^wells\s+fargo/i.test(payer) || /^chase\b/i.test(payer)) payer = "";
  const payee = raw.payee ? String(raw.payee).trim() : "";
  const depositBank = raw.depositBank
    ? String(raw.depositBank).trim()
    : raw.depositAccount
      ? String(raw.depositAccount).trim()
      : "";
  return {
    amount: Number.isFinite(amt) && amt > 0 ? amt : null,
    confirmationNumber: ref,
    checkNumber: checkNo,
    invoiceNumber: invNo || "",
    date,
    memo,
    payee,
    payer,
    depositBank,
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