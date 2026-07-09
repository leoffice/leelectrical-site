/** Shared Zelle screenshot vision extraction (xAI Grok vision). */

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

/** Pull JSON object from model text (tolerates fenced blocks). */
export function parseVisionJson(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1].trim() : s;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Normalize vision model output to app shape. */
export function normalizeExtracted(raw) {
  if (!raw || typeof raw !== "object") return null;
  const amt = raw.amount != null ? parseFloat(String(raw.amount).replace(/[$,]/g, "")) : null;
  const conf = String(raw.confidence || "").toLowerCase() === "low" ? "low" : "high";
  let date = raw.date ? String(raw.date).trim() : "";
  const dm = date.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dm) {
    const yr = dm[3].length === 2 ? "20" + dm[3] : dm[3];
    date = `${yr}-${dm[1].padStart(2, "0")}-${dm[2].padStart(2, "0")}`;
  }
  return {
    amount: Number.isFinite(amt) && amt > 0 ? amt : null,
    confirmationNumber: raw.confirmationNumber ? String(raw.confirmationNumber).trim() : "",
    date,
    memo: raw.memo ? String(raw.memo).trim() : "",
    confidence: conf,
  };
}

function textFromResponsesBody(body) {
  if (!body || typeof body !== "object") return "";
  if (typeof body.output_text === "string") return body.output_text;
  const out = body.output;
  if (Array.isArray(out)) {
    const bits = [];
    for (const item of out) {
      if (typeof item?.text === "string") bits.push(item.text);
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (typeof c?.text === "string") bits.push(c.text);
        }
      }
    }
    if (bits.length) return bits.join("\n");
  }
  const choice = body.choices?.[0];
  if (typeof choice?.message?.content === "string") return choice.message.content;
  if (Array.isArray(choice?.message?.content)) {
    return choice.message.content
      .filter((c) => c?.type === "text" || c?.type === "output_text")
      .map((c) => c.text || "")
      .join("\n");
  }
  return "";
}

/**
 * Call xAI vision API. Returns normalized extracted fields or throws.
 * Without XAI_API_KEY returns { dryRun: true, extracted: null }.
 */
export async function extractZelleFromImage({ imageBase64, mime = "image/jpeg" }) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return { dryRun: true, extracted: null, error: "XAI_API_KEY not set" };
  }
  const model = process.env.XAI_VISION_MODEL || "grok-2-vision-1212";
  const dataUrl = `data:${mime};base64,${imageBase64}`;

  let body = null;
  let text = "";

  // Primary: xAI responses API (image understanding).
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
              { type: "input_text", text: ZELLE_VISION_PROMPT },
            ],
          },
        ],
      }),
    });
    if (r.ok) {
      body = await r.json();
      text = textFromResponsesBody(body);
    }
  } catch {
    /* fall through to chat/completions */
  }

  // Fallback: chat/completions (older vision shape).
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
              { type: "text", text: ZELLE_VISION_PROMPT },
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
    body = await r.json();
    text = textFromResponsesBody(body);
  }

  const parsed = parseVisionJson(text);
  const extracted = normalizeExtracted(parsed);
  if (!extracted) throw new Error("Could not parse vision response");
  return { dryRun: false, extracted, model };
}