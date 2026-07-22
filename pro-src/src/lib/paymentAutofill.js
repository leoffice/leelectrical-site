// Apply vision-extracted payment fields to manual entry form state.
import { todayStr } from "./format.js";

/** Parse a vision amount that may be number or "$1,234.56" / "450***" / "450.00/100" string. */
export function parseExtractedAmount(raw) {
  if (raw == null || raw === "") return null;
  let s = String(raw).trim();
  // Strip filler stars, currency, spaces; keep digits, comma, dot, slash.
  s = s.replace(/[$*\s]/g, "");
  // Written-fraction tail on some checks: "450.00/100" → "450.00"
  s = s.replace(/\/\d{0,3}$/, "");
  // Thousands commas: "1,250.50" → "1250.50"
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  // European-style rare OCR: "1.250,50" → "1250.50"
  else if (/^\d{1,3}(\.\d{3})+(,\d+)$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  // Lone trailing comma as decimal
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Map extracted vision fields → form patch for Mark as paid. */
export function paymentAutofillPatch(extracted) {
  if (!extracted) return {};
  const patch = {};
  const amt = parseExtractedAmount(extracted.amount);
  if (amt != null) patch.amt = String(amt);
  const ref = String(extracted.confirmationNumber || extracted.checkNumber || "").trim();
  if (ref) patch.ref = ref;
  if (extracted.date) patch.dt = extracted.date;
  if (extracted.memo) patch.memo = extracted.memo;
  // Payer = who wrote the check (top-left). Prefer over payee (usually us).
  const name = String(extracted.payer || extracted.name || "").trim();
  if (name) patch.name = name;
  const inv = invoiceNoFromExtracted(extracted);
  if (inv) patch.invoiceNo = inv;
  return patch;
}

/**
 * True when vision returned something we can put on the form (partial OK).
 * Empty / failed extracts must NOT show green "Autofilled" / "Read from check".
 */
export function hasUsefulPaymentAutofill(extracted) {
  const patch = paymentAutofillPatch(extracted);
  return !!(patch.amt || patch.ref || patch.memo || patch.invoiceNo || patch.name || patch.dt);
}

/**
 * Green "Autofilled" / "Read from check" only when amount or check/ref landed.
 * Name/memo alone is useful for matching but must not look like a full read.
 */
export function hasStrongPaymentAutofill(extracted) {
  const patch = paymentAutofillPatch(extracted);
  return !!(patch.amt || patch.ref);
}

/**
 * Pull an invoice # from vision output (explicit field, memo, or payee note).
 * Used when recording a check payment from ＋ so we can open the right invoice.
 *
 * Levi rule: if memo is just a bare number (no English word), treat it as the invoice #.
 */
export function invoiceNoFromExtracted(extracted) {
  if (!extracted) return "";
  const direct = String(extracted.invoiceNo || extracted.invoiceNumber || "").replace(/\D/g, "");
  if (direct.length >= 4) return direct;
  const list = Array.isArray(extracted.invoiceNumbers) ? extracted.invoiceNumbers : [];
  for (const n of list) {
    const d = String(n || "").replace(/\D/g, "");
    if (d.length >= 4) return d;
  }
  const memoOnly = String(extracted.memo || "").trim();
  // Bare memo digits → invoice # (e.g. "251841" or "#251841" with nothing else).
  const bareMemo = memoOnly.match(/^#?\s*(\d{4,7})\s*$/);
  if (bareMemo) return bareMemo[1];

  const hay = [extracted.memo, extracted.payee, extracted.payer, extracted.confirmationNumber]
    .map((s) => String(s || ""))
    .join(" ");
  // Prefer inv/invoice labeled numbers, then a bare 5–6 digit run (QBO-style).
  const labeled = hay.match(/\b(?:inv(?:oice)?\.?\s*#?\s*)(\d{4,7})\b/i);
  if (labeled) return labeled[1];
  // Avoid treating a short check # as invoice when labeled fields already set checkNumber.
  const bare = hay.match(/\b(\d{5,6})\b/);
  return bare ? bare[1] : "";
}

/** Build memo note segment for payment ledger entry. */
export function paymentMemoNote({ method, ref, memo, proofName, deposit }) {
  const bits = [];
  if (method === "Check" && ref) bits.push("Check #" + ref);
  else if (method === "Zelle") {
    if (ref) bits.push("Zelle ref " + ref);
    if (proofName) bits.push("proof: " + proofName);
  }
  if (deposit) bits.push("Deposit: " + deposit);
  if (memo) bits.push(memo);
  return bits.join(" · ");
}

/** Default date when vision omits one. */
export function autofillDate(extracted) {
  return extracted?.date || todayStr();
}
