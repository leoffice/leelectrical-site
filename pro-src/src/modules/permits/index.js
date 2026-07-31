/**
 * LE Pro — Permits / Applications module (integration-ready boundary).
 *
 * Feature-flagged via tenant_config module key `permits` (see tenantConfig.js).
 * OFF by default for white-label tiers; LE flagship enables via internal + override.
 *
 * Public surface for the host app:
 *  - MODULE_KEY / isPermitsEnabled
 *  - meter application (4 options) record helpers
 *  - functionalities-to-lock-in checklist seed
 *
 * Routes/components stay behind the flag (tenantNav NAV_ITEMS module: "permits").
 * Do not hard-couple into always-on nav.
 */

export { MODULE_KEY, isPermitsEnabled } from "./featureFlag.js";
export {
  METER_APPLICATION_OPTIONS,
  METER_APPLICATION_VALUES,
  meterApplicationLabel,
  isValidMeterApplication,
  getMeterApplication,
  recordMeterApplication,
  jobPatchMeterApplication,
} from "./meterApplication.js";
export {
  FUNCTIONALITIES_LOCK_IN,
  functionalitiesLockInSeed,
  lockInDoneCount,
  lockInTotalCount,
  isLockInDone,
} from "./functionalitiesLockIn.js";
