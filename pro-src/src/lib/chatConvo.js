/** Stable LE Pro bubble conversation id — shared across web, mobile, and PWA.
 *  Server-side chat fn stores history under chat-{id}; must NOT be per-device. */
export const LE_PRO_CONVO = "pro-levi";

const LEGACY_KEY = "le_pro_convo";

/** One-time read of a device-local convo id (pre–cross-device sync). */
export function legacyDeviceConvo() {
  try {
    const c = localStorage.getItem(LEGACY_KEY);
    return c && c !== LE_PRO_CONVO ? c : null;
  } catch {
    return null;
  }
}

/** Drop the legacy per-device key after migration to the shared thread. */
export function clearLegacyDeviceConvo() {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {}
}