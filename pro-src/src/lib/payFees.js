/** Card processing fee added on top of the payment amount (not deducted). */
export const PROCESSING_FEE_RATE = 0.035;

export function parseMoney(raw) {
  const n = parseFloat(String(raw ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function processingFee(base, includeFee = true) {
  if (!includeFee) return 0;
  const n = parseMoney(base);
  if (!n) return 0;
  return Math.round(n * PROCESSING_FEE_RATE * 100) / 100;
}

export function totalWithFee(base, includeFee = true) {
  const n = parseMoney(base);
  if (!n) return 0;
  if (!includeFee) return n;
  return Math.round((n + processingFee(n, true)) * 100) / 100;
}

/** Sola / Cardknox amount string (up to 2 decimals). */
export function solaAmount(n) {
  const v = parseMoney(n);
  if (!v) return "";
  return v % 1 === 0 ? String(Math.round(v)) : v.toFixed(2);
}

export function fmtMoneyPrecise(v) {
  const n = parseMoney(v);
  if (!n) return "";
  const hasCents = Math.abs(n - Math.round(n)) > 0.001;
  return (
    "$" +
    n.toLocaleString(undefined, {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    })
  );
}

export function feeEnabledInPayload(data) {
  return data?.fe !== 0 && data?.fe !== false;
}