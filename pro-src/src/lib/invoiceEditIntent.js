// Natural-language invoice edit intents from the LE Pro chat bubble.
import { parseAmount } from "./format.js";

const MONEY = String.raw`\$?\s*([\d,]+(?:\.\d{1,2})?)`;

function normLineKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseMoney(raw) {
  const n = parseAmount(raw);
  return n > 0 ? n : null;
}

/** @returns {null | { actions: object[], summary: string }} */
export function parseInvoiceEditIntent(raw) {
  const text = String(raw || "").trim();
  if (!text || text.startsWith("/")) return null;
  const lower = text.toLowerCase();
  if (!/(change|set|update|add|remove|delete|drop)\b/.test(lower) && !/\$\d/.test(lower)) return null;

  const actions = [];

  // change/set/update <line> to $450
  const changeRe = new RegExp(
    String.raw`\b(?:change|set|update)\s+(?:the\s+)?(.+?)\s+(?:to|at)\s+${MONEY}`,
    "gi"
  );
  for (const m of text.matchAll(changeRe)) {
    const amount = parseMoney(m[2]);
    if (amount == null) continue;
    actions.push({ type: "set_amount", match: m[1].trim(), amount });
  }

  // add <item> line $1200 / add panel upgrade $1200
  const addRe = new RegExp(
    String.raw`\badd\s+(?:a\s+)?(.+?)(?:\s+line)?\s+(?:for\s+)?${MONEY}`,
    "gi"
  );
  for (const m of text.matchAll(addRe)) {
    const amount = parseMoney(m[2]);
    if (amount == null) continue;
    let item = m[1].trim().replace(/\s+line$/i, "");
    actions.push({ type: "add_line", itemName: item, amount });
  }

  // remove/delete <line>
  const removeRe = /\b(?:remove|delete|drop)\s+(?:the\s+)?(.+?)(?:\s+line)?\s*$/gi;
  for (const m of text.matchAll(removeRe)) {
    actions.push({ type: "remove_line", match: m[1].trim() });
  }

  if (!actions.length) return null;
  return { actions, summary: summarizeActions(actions) };
}

function summarizeActions(actions) {
  return actions
    .map((a) => {
      if (a.type === "set_amount") return `set ${a.match} to $${a.amount}`;
      if (a.type === "add_line") return `add ${a.itemName} $${a.amount}`;
      if (a.type === "remove_line") return `remove ${a.match}`;
      return "";
    })
    .filter(Boolean)
    .join("; ");
}

export function findLineIndex(lines, match) {
  const key = normLineKey(match);
  if (!key) return -1;
  const tokens = key.split(" ").filter(Boolean);
  let best = -1;
  let bestScore = 0;
  (lines || []).forEach((ln, i) => {
    const hay = normLineKey([ln.itemName, ln.description].filter(Boolean).join(" "));
    if (!hay) return;
    if (hay === key) {
      best = i;
      bestScore = 100;
      return;
    }
    if (hay.includes(key) || key.includes(hay)) {
      const score = Math.min(hay.length, key.length);
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
      return;
    }
    const hit = tokens.filter((t) => hay.includes(t)).length;
    if (hit > bestScore) {
      best = i;
      bestScore = hit;
    }
  });
  return bestScore > 0 ? best : -1;
}