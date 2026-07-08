// Parse create_estimate / create_invoice command results from QuickBooks.
import { fmt$ } from "./format.js";

export const DOC_CONFIRM_SEEN_KEY = "le-pro-doc-confirm-seen";

export function loadDocConfirmSeen() {
  try {
    const raw = localStorage.getItem(DOC_CONFIRM_SEEN_KEY);
    return new Set(JSON.parse(raw || "[]"));
  } catch {
    return new Set();
  }
}

export function persistDocConfirmSeen(seen) {
  try {
    localStorage.setItem(DOC_CONFIRM_SEEN_KEY, JSON.stringify([...seen].slice(-300)));
  } catch {}
}

/** True when we should show the one-time QBO doc confirmation banner. */
export function shouldShowDocConfirm({ commandId, kind, no, job }, seen) {
  if (!commandId || seen.has(commandId)) return false;
  const j = job || {};
  if (kind === "estimate" && j._estimateConfirmed && String(j.estimateNo || "") === String(no || "")) return false;
  if (kind === "invoice" && j._invoiceConfirmed && String(j.invoiceNo || "") === String(no || "")) return false;
  return Boolean(no);
}

export function parseDocCommandResult(result, kind) {
  if (!result) return {};
  let o = result;
  if (typeof result === "string") {
    try {
      o = JSON.parse(result);
    } catch {
      o = { raw: result };
    }
  }
  const noKey = kind === "estimate" ? "estimateNo" : "invoiceNo";
  const no =
    o[noKey] ||
    o.docNumber ||
    o.DocNumber ||
    o.docNo ||
    (o.raw && String(o.raw).match(/\b(\d{3,})\b/)?.[1]) ||
    "";
  const amount = o.amount ?? o.total ?? o.TotalAmt ?? o.totalFormatted;
  return { [noKey]: String(no || ""), amount: amount != null ? fmt$(amount) : "" };
}

export function docConfirmMessage({ kind, no, amount, customer }) {
  const label = kind === "estimate" ? "Estimate" : "Invoice";
  const amt = amount ? " for " + amount : "";
  const who = customer ? " — " + customer : "";
  return label + " #" + no + amt + who + " confirmed in QuickBooks";
}