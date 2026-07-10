// Parse tappable reply choices from Israel messages (Telegram ---BUTTONS--- + A/B/C fallback).

const MAX_BUTTONS = 3;

function parseButtonsBlock(block) {
  const buttons = [];
  for (const raw of String(block || "").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const pipe = line.indexOf("|");
    const label = (pipe >= 0 ? line.slice(0, pipe) : line).trim();
    const id = (pipe >= 0 ? line.slice(pipe + 1) : line).trim() || label;
    if (!label) continue;
    buttons.push({ label, id, replyText: label });
    if (buttons.length >= MAX_BUTTONS) break;
  }
  return buttons;
}

function parseLetterOptions(text) {
  const buttons = [];
  const optMatch = text.match(/\bOptions:\s*([A-C][^]*?)$/i);
  const chunk = optMatch ? optMatch[1] : text;
  const parts = chunk.split(/\s*·\s*/);
  for (const part of parts) {
    const m = part.trim().match(/^([A-C])\)\s*(.+)$/i) || part.trim().match(/^([A-C])\s*[—–-]\s*(.+)$/i);
    if (!m) continue;
    const letter = m[1].toUpperCase();
    const label = m[2].trim();
    if (!label) continue;
    buttons.push({ label, id: letter, letter, replyText: letter });
    if (buttons.length >= MAX_BUTTONS) break;
  }
  return buttons;
}

/** @returns {{ body: string, buttons: Array<{ label: string, id: string, letter?: string, replyText: string }> }} */
export function parseReplyButtons(text) {
  const raw = String(text || "");
  const btnMatch = raw.match(/\n---BUTTONS---\n([\s\S]*)$/);
  if (btnMatch) {
    return {
      body: raw.slice(0, btnMatch.index).trimEnd(),
      buttons: parseButtonsBlock(btnMatch[1]),
    };
  }
  const buttons = parseLetterOptions(raw);
  if (!buttons.length) return { body: raw, buttons: [] };
  let body = raw;
  const optIdx = raw.search(/\bOptions:\s*[A-C]/i);
  if (optIdx >= 0) body = raw.slice(0, optIdx).trimEnd();
  return { body, buttons };
}