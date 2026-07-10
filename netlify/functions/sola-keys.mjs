/** Shared Sola/Cardknox key resolution — iFields (public) + gateway xKey (secret). */

export function solaEnvironment() {
  const env = String(process.env.SOLA_ENV || "production").trim().toLowerCase();
  return env === "dev" || env === "sandbox" || env === "test" ? "dev" : "production";
}

const KNOWN_MERCHANT_SLUGS = ["blzelectric", "lepaymentsdev", "lepaymendev"];

/** Merchant slug inferred from a Cardknox key prefix (for mismatch diagnostics). */
export function merchantSlugFromKey(key) {
  const k = String(key || "").trim().toLowerCase();
  if (!k) return "";
  const hit = KNOWN_MERCHANT_SLUGS.find((slug) => k.includes(slug));
  return hit || "";
}

export function resolveIfieldsKey() {
  const isDev = solaEnvironment() === "dev";
  return isDev
    ? process.env.SOLA_IFIELDS_KEY_DEV || process.env.SOLA_IFIELDS_KEY || ""
    : process.env.SOLA_IFIELDS_KEY || "";
}

export function resolveXKey() {
  const isDev = solaEnvironment() === "dev";
  return isDev
    ? process.env.SOLA_X_KEY_DEV || process.env.SOLA_X_KEY || ""
    : process.env.SOLA_X_KEY || "";
}

/** True when both configured keys appear to belong to the same Cardknox merchant. */
export function keysLookPaired() {
  const ifields = resolveIfieldsKey();
  const xKey = resolveXKey();
  if (!ifields || !xKey) return false;
  const a = merchantSlugFromKey(ifields);
  const b = merchantSlugFromKey(xKey);
  return !!(a && b && a === b);
}

export function sutMismatchHint(gatewayError) {
  const err = String(gatewayError || "");
  if (!/unauthorized token|invalid token|invalid xcardnum/i.test(err)) return "";
  if (!keysLookPaired()) {
    return " Card processing keys on the server may be mismatched — both Sola keys must be from the same merchant account.";
  }
  return " Try entering the card again (tokens expire quickly) or use Payment link instead.";
}