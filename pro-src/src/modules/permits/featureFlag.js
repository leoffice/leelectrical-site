/**
 * Per-tenant enable for the Permits / Applications module.
 * Host wiring: tenantNav NAV_ITEMS uses module: "permits"; routes unregistered when off.
 */
import { isModuleEnabled } from "../../lib/tenantConfig.js";

/** Stable module key in tenant_config.modules / moduleOverrides. */
export const MODULE_KEY = "permits";

/** True when this tenant may see Applications nav + routes. */
export function isPermitsEnabled(config) {
  return isModuleEnabled(config, MODULE_KEY) === true;
}
