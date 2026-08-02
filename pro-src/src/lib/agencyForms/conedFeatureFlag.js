/**
 * Con Edison Application product surface — Levi / LE flagship only.
 * Other tenants stay OFF until white-label ship (Build Slice 1).
 *
 * Not on the PLAN_MODULES matrix yet (slice-1 gate). Explicit override:
 *   moduleOverrides.conedApplications === false  → force off
 *   moduleOverrides.conedApplications === true   → force on
 * Default: ON for internal LE tenants only.
 */

/** Module key for overrides / future PLAN_MODULES entry. */
export const CONED_APPLICATIONS_MODULE = "conedApplications";

/**
 * True when this tenant may see the Con Edison Application tab + 3-destination complete flow.
 * @param {object} [config] tenant_config
 */
export function isConedApplicationsEnabled(config) {
  const o = config?.moduleOverrides;
  if (o && typeof o.conedApplications === "boolean") return o.conedApplications === true;
  if (config?.modules && typeof config.modules.conedApplications === "boolean") {
    return config.modules.conedApplications === true;
  }
  if (config?.internal === true) return true;
  const tid = String(config?.tenantId || "").toLowerCase();
  return tid === "le" || tid === "leelectrical" || tid === "blz";
}
