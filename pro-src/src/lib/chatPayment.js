// Chat bubble payment flow — method hints from text, deposit banks, draft builder.
import { parseInvoiceFromMemo } from "./zelleReconcile.js";
import { paymentAutofillPatch } from "./paymentAutofill.js";
import { todayStr } from "./format.js";

/** Bank accounts for check/Zelle deposits (not payment methods). */
export const DEPOSIT_BANKS = ["Martin Dorkin", "Wells Fargo", "BLZ Chase"];

/** Parse "check", "zelle", or "zell" from a chat message. */
export function parsePaymentMethodHint(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  if (/\b(?:zelle?|zell)\b/.test(t)) return "Zelle";
  if (/\b(?:check|cheque)\b/.test(t)) return "Check";
  return null;
}

/** True when the message is only a payment-method hint (no other words). */
export function isPaymentMethodOnly(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return false;
  return /^(?:check|cheque|zelle?|zell)$/.test(t);
}

/** True when typed text is enough to open a pending payment photo (no send tap). */
export function shouldAutoOpenPaymentDraft(text) {
  return Boolean(parsePaymentMethodHint(text));
}

/** Resolve payment kind from chat text, vision kind, or extracted fields. */
export function resolvePaymentKind({ textHint, visionKind, extracted }) {
  const fromText = parsePaymentMethodHint(textHint);
  if (fromText) return { kind: fromText, locked: true };
  if (visionKind === "check" || extracted?.kind === "check" || extracted?.checkNumber) {
    return { kind: "Check", locked: false };
  }
  if (extracted?.paymentMethod === "check") return { kind: "Check", locked: false };
  return { kind: "Zelle", locked: false };
}

/** Build a payment draft for ChatPaymentConfirmSheet. */
export function buildChatPaymentDraft({
  extracted,
  visionKind,
  file,
  previewUrl,
  textHint = "",
  jobInvoiceNo = "",
}) {
  const patch = paymentAutofillPatch(extracted || {});
  const { kind, locked } = resolvePaymentKind({ textHint, visionKind, extracted });
  const memo = patch.memo || extracted?.memo || "";
  const invoiceFromMemo = parseInvoiceFromMemo(memo);
  return {
    kind,
    methodLocked: locked,
    amount: patch.amt || "",
    ref: patch.ref || "",
    memo,
    date: patch.dt || todayStr(),
    invoiceNo: invoiceFromMemo || jobInvoiceNo || "",
    deposit: DEPOSIT_BANKS[0],
    extracted: extracted || null,
    proofName: file?.name || "",
    previewUrl,
    file,
  };
}

/** Whether vision output looks like a payment screenshot. */
export function looksLikePaymentImage(extracted) {
  if (!extracted) return false;
  return Boolean(
    extracted.amount > 0 ||
      extracted.confirmationNumber ||
      extracted.checkNumber ||
      extracted.memo
  );
}