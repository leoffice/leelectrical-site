/**
 * Credit-card photo → secure form fields.
 * Full digits only live briefly on the client to fill Sola iFields; never stored.
 * Levi 2026-08-05: no stars / "photo assist" chrome — just fill card #, exp, CVV.
 */

export function maskCardPan(pan) {
  const d = String(pan || "").replace(/\D/g, "");
  if (d.length < 4) return "";
  if (d.length < 12) return `${"•".repeat(12)}${d.slice(-4)}`;
  return `${"•".repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`;
}

export function normalizeCardExp(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const digits = s.replace(/\D/g, "");
  if (digits.length === 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  if (digits.length === 6) {
    return `${digits.slice(0, 2)}/${digits.slice(4)}`;
  }
  const m = s.match(/^(\d{1,2})\s*[\/\-]\s*(\d{2,4})$/);
  if (m) {
    const mm = m[1].padStart(2, "0").slice(-2);
    let yy = m[2];
    if (yy.length === 4) yy = yy.slice(2);
    return `${mm}/${yy}`;
  }
  return "";
}

/** Luhn check for card numbers (reject OCR garbage). */
export function isValidCardLuhn(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i -= 1) {
    let n = parseInt(d[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * Map vision extract → secure field fill patch.
 * @returns {{ pan?: string, last4?: string, exp?: string, cvv?: string, name?: string, brand?: string }}
 */
export function cardPhotoAutofillPatch(extracted) {
  if (!extracted || typeof extracted !== "object") return {};
  const patch = {};
  const pan = String(extracted.cardNumber || extracted.pan || extracted.number || "")
    .replace(/\D/g, "")
    .trim();
  if (pan && isValidCardLuhn(pan)) {
    patch.pan = pan;
    patch.last4 = pan.slice(-4);
  } else if (pan && pan.length >= 12) {
    patch.pan = pan;
    patch.last4 = pan.slice(-4);
  } else if (pan && pan.length >= 4) {
    patch.last4 = pan.slice(-4);
  }
  const last4 = String(extracted.last4 || extracted.cardLast4 || "").replace(/\D/g, "");
  if (!patch.last4 && last4.length === 4) patch.last4 = last4;
  const exp = normalizeCardExp(extracted.exp || extracted.expiry || extracted.expiration || "");
  if (exp) patch.exp = exp;
  const cvv = String(extracted.cvv || extracted.cvc || extracted.cid || "")
    .replace(/\D/g, "")
    .trim();
  if (cvv.length >= 3 && cvv.length <= 4) patch.cvv = cvv;
  const name = String(extracted.name || extracted.cardholder || extracted.cardholderName || "").trim();
  if (name) patch.name = name;
  const brand = String(extracted.brand || extracted.network || "").trim();
  if (brand) patch.brand = brand;
  return patch;
}

export function hasUsefulCardAutofill(patch) {
  return !!(patch && (patch.pan || patch.last4 || patch.exp || patch.cvv || patch.name));
}
