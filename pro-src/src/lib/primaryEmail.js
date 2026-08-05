/**
 * Cardknox / Sola xEmail accepts exactly one address (error E40:
 * "Only 1 email can be entered"). Jobs often store QBO multi-email
 * strings like "a@x.com, b@y.com" — pick the first valid one for payment.
 */
export function primaryEmailForPayment(raw) {
  const seen = new Set();
  for (const part of String(raw || "").split(/[,;]+/)) {
    const e = part.trim();
    if (!e || !e.includes("@")) continue;
    // Strip display-name wrappers: "Name <a@x.com>"
    const m = e.match(/<?([^\s<>]+@[^\s<>]+)>?/);
    const addr = (m ? m[1] : e).trim();
    if (!addr.includes("@")) continue;
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    return addr;
  }
  return "";
}
