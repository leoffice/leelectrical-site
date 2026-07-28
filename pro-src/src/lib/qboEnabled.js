// QuickBooks on/off — module plan + Settings feature toggles.
// Integration off: no sync chip / white-label local-only.
// Docs off (integration still on): hide send/view through QB; backend sync keeps running.
import { activeTenantConfig } from "./tenantBranding.js";
import { isModuleEnabled } from "./tenantConfig.js";
import {
  anyQuickbooksDocFeature,
  isFeatureOn,
  quickbooksDocFeature,
  quickbooksDocFeatureKey,
} from "./tenantProfile.js";
import {
  isQuickbooksDocFeatureEnabled,
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
 * True when the app may offer send/view/create ONE document kind through
 * QuickBooks. Requires sync on, plus that kind's Settings switch.
 * When false: local PDF/email only; jobs/customers still sync in the background.
 *
 * @param {"invoice"|"estimate"} docKind
 */
export function isQuickbooksDocEnabled(docKind, config = activeTenantConfig(), features) {
  if (!isQuickbooksEnabled(config, features)) return false;
  if (features && typeof features === "object") {
    // Explicit per-kind switch, or the legacy umbrella it was split out of.
    if (
      Object.prototype.hasOwnProperty.call(features, quickbooksDocFeatureKey(docKind)) ||
      Object.prototype.hasOwnProperty.call(features, "quickbooksDocs")
    ) {
      return quickbooksDocFeature(features, docKind);
    }
    return isQuickbooksDocFeatureEnabled(docKind);
  }
  return isQuickbooksDocFeatureEnabled(docKind);
}

/**
 * True when EITHER document kind may go through QuickBooks — for shared UI
 * (the doc-source picker, "view in QuickBooks" chrome) that isn't per-kind.
 */
export function isQuickbooksDocsEnabled(config = activeTenantConfig(), features) {
  if (!isQuickbooksEnabled(config, features)) return false;
  if (features && typeof features === "object") {
    return anyQuickbooksDocFeature(features);
  }
  return (
    isQuickbooksDocFeatureEnabled("invoice") || isQuickbooksDocFeatureEnabled("estimate")
  );
}

/** Force local doc source when QB docs are off. */
export function resolveDocSource(requested, config, docKind) {
  const on = docKind ? isQuickbooksDocEnabled(docKind, config) : isQuickbooksDocsEnabled(config);
  if (!on) return "local";
  return requested === "qbo" ? "qbo" : "local";
}
