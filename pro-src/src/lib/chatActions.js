import { todayStr } from "./format.js";

/** Parse `/cmd rest` from a bubble message. Returns null if not a slash command. */
export function parseChatSlash(raw) {
  const t = String(raw || "").trim();
  if (!t.startsWith("/")) return null;
  const m = t.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  return { cmd: m[1].toLowerCase(), rest: (m[2] || "").trim() };
}

/** Map `/job <field> <value>` to a staged job patch. */
export function jobPatchFromSlash(rest) {
  const m = rest.match(/^(\w+)\s+([\s\S]+)$/);
  if (!m) return null;
  const field = m[1].toLowerCase();
  const value = m[2].trim();
  if (!value) return null;
  switch (field) {
    case "notes":
    case "note":
      return { notes: value };
    case "followup":
    case "follow-up":
    case "follow":
      return { followUp: { text: value, date: todayStr() } };
    case "phone":
      return { phone: value };
    case "email":
      return { email: value };
    case "title":
      return { title: value };
    case "address":
    case "serviceaddress":
      return { address: value, serviceAddress: value };
    case "amount":
      return { amount: value };
    default:
      return null;
  }
}

export const CHAT_SLASH_HINT = "/task … · /job notes … · /appt";