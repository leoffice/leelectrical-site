// Parse create_estimate / create_invoice command results from QuickBooks.
import { fmt$ } from "./format.js";

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