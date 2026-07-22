// QuickBooks on/off — module plan + Settings feature toggle (white-label local-only).
// When off: local PDF/email only; hide QB view/send/save/sync choices.
import { activeTenantConfig } from "./tenantBranding.js";
import { isModuleEnabled } from "./tenantConfig.js";
import { isFeatureOn } from "./tenantProfile.js";
import { isQuickbooksFeatureEnabled } from "./appSettings.js";

/**
 * True when QuickBooks paths may be offered.
 * Both the plan module and the Settings feature must allow it.
 * Feature defaults ON (LE Electrical); white-label can turn off for local-only.
 */
export function isQuickbooksEnabled(config = activeTenantConfig(), features) {
  const moduleOn = isModuleEnabled(config, "quickbooks");
  if (!moduleOn) return false;
  if (features && typeof features === "object") {
    return isFeatureOn(features, "quickbooks");
  }
  return isQuickbooksFeatureEnabled();
}

/** Force local doc source when QB is off. */
export function resolveDocSource(requested, config) {
  if (!isQuickbooksEnabled(config)) return "local";
  return requested === "qbo" ? "qbo" : "local";
}
