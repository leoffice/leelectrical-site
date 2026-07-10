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

/** Build memo note segment for payment ledger entry. */
export function paymentMemoNote({ method, ref, memo, proofName }) {
  const bits = [];
  if (method === "Check" && ref) bits.push("Check #" + ref);
  else if (method === "Zelle") {
    if (ref) bits.push("Zelle ref " + ref);
    if (proofName) bits.push("proof: " + proofName);
  }
  if (memo) bits.push(memo);
  return bits.join(" · ");
}

/** Default date when vision omits one. */
export function autofillDate(extracted) {
  return extracted?.date || todayStr();
}