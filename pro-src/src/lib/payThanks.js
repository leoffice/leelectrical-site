import { fmtMoneyPrecise } from "./payFees.js";

/** Parse post-payment confirmation query params from the Sola redirect. */
export function parsePayThanksParams(params) {
  const ok = params.get("ok") === "1";
  const inv = (params.get("inv") || "").trim();
  const amt = (params.get("amt") || "").trim();
  const balRaw = (params.get("bal") || "").trim();
  const msg = (params.get("msg") || "").trim();
  const bal =
    balRaw === ""
      ? null
      : Number.isFinite(parseFloat(balRaw.replace(/[$,]/g, "")))
        ? parseFloat(balRaw.replace(/[$,]/g, ""))
        : null;
  return { ok, inv, amt, bal, msg };
}

/** Receipt line for remaining balance after payment. */
export function fmtBalanceNow(bal) {
  if (bal == null || Number.isNaN(bal)) return "";
  if (bal <= 0.01) return "Paid in full";
  return fmtMoneyPrecise(bal);
}