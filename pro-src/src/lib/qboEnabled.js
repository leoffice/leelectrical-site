// QuickBooks on/off — module plan + Settings feature toggles.
// Integration off: no sync chip / white-label local-only.
// Docs off (integration still on): hide send/view through QB; backend sync keeps running.
import { activeTenantConfig } from "./tenantBranding.js";
import { isModuleEnabled } from "./tenantConfig.js";
import { isFeatureOn } from "./tenantProfile.js";
import {
  isQuickbooksDocsFeatureEnabled,
  isQuickbooksFeatureEnabled,
} from "./appSettings.js";

/**
 * True when QuickBooks integration is allowed (backend sync, sync chip, data pull).
 * Both the plan module and the Settings "QuickBooks" feature must allow it.
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

/**
 * True when the app may offer send/view/create through QuickBooks.
 * Requires integration on, plus Settings "Send & view through QuickBooks".
 * When false: local PDF/email only; jobs/customers still sync in the background.
 */
export function isQuickbooksDocsEnabled(config = activeTenantConfig(), features) {
  if (!isQuickbooksEnabled(config, features)) return false;
  if (features && typeof features === "object") {
    if (Object.prototype.hasOwnProperty.call(features, "quickbooksDocs")) {
      return isFeatureOn(features, "quickbooksDocs");
    }
    return isQuickbooksDocsFeatureEnabled();
  }
  return isQuickbooksDocsFeatureEnabled();
}

/** Force local doc source when QB docs are off. */
export function resolveDocSource(requested, config) {
  if (!isQuickbooksDocsEnabled(config)) return "local";
  return requested === "qbo" ? "qbo" : "local";
}
