// Apply vision-extracted payment fields to manual entry form state.
import { todayStr } from "./format.js";

/** Map extracted vision fields → form patch for Mark as paid. */
export function paymentAutofillPatch(extracted) {
  if (!extracted) return {};
  const patch = {};
  if (extracted.amount > 0) patch.amt = String(extracted.amount);
  const ref = String(extracted.confirmationNumber || extracted.checkNumber || "").trim();
  if (ref) patch.ref = ref;
  if (extracted.date) patch.dt = extracted.date;
  if (extracted.memo) patch.memo = extracted.memo;
  return patch;
}

/**
 * Pull an invoice # from vision output (explicit field, memo, or payee note).
 * Used when recording a check payment from ＋ so we can open the right invoice.
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
  const hay = [extracted.memo, extracted.payee, extracted.confirmationNumber]
    .map((s) => String(s || ""))
    .join(" ");
  // Prefer inv/invoice labeled numbers, then a bare 5–6 digit run (QBO-style).
  const labeled = hay.match(/\b(?:inv(?:oice)?\.?\s*#?\s*)(\d{4,7})\b/i);
  if (labeled) return labeled[1];
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