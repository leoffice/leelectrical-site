/** Wispr-style semantic rewrite for voice dictation (xAI Grok). */

const SYSTEM = `You rewrite voice dictation for a professional electrical contractor messaging colleagues or customers.

The input is raw speech-to-text. It may repeat ideas, ramble, or list steps awkwardly.

Rules:
- Consolidate repetition — each idea appears once
- Friendly, clear, professional — for humans, not AI
- Use a short numbered list only when the speaker clearly listed separate steps
- Fix punctuation and capitalization
- Do NOT invent facts not in the input
- Preserve Hebrew if the input is Hebrew
- Return ONLY the polished text — no quotes, labels, or explanation`;

export function needsSmartPolish(raw) {
  const t = String(raw || "").trim();
  if (t.length < 60) return false;
  const lower = t.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length < 12) return false;

  for (let win = Math.min(10, Math.floor(words.length / 3)); win >= 5; win--) {
    for (let i = 0; i <= words.length - win * 2; i++) {
      const slice = words.slice(i, i + win).join(" ");
      const rest = words.slice(i + win).join(" ");
      if (slice.length > 18 && rest.includes(slice)) return true;
    }
  }

  if (/\b[1-6]\.\s/.test(t) && t.length > 120) return true;
  return t.length > 240;
}

/**
 * Call xAI chat API. Without XAI_API_KEY returns { dryRun: true }.
 */
export async function rewriteVoiceDictation({ text, prePolished }) {
  const apiKey = process.env.XAI_API_KEY;
  const source = String(prePolished || text || "").trim();
  if (!source) return { ok: false, text: "", error: "empty" };
  if (!apiKey) return { dryRun: true, text: source, error: "XAI_API_KEY not set" };

  const model = process.env.XAI_VOICE_MODEL || process.env.XAI_CHAT_MODEL || "grok-3-mini";
  const r = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Raw dictation:\n${String(text || "").trim()}\n\nRule-polished draft:\n${source}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 1024,
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`xAI voice polish ${r.status}: ${err.slice(0, 200)}`);
  }

  const body = await r.json();
  const out = String(body?.choices?.[0]?.message?.content || "").trim();
  if (!out) throw new Error("Empty voice polish response");
  return { ok: true, text: out, model, dryRun: false };
}