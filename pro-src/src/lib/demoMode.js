// Demo / white-label TEST TENANT mode.
//
// Enabled ONLY in a build made with VITE_DEMO=1. In this mode the app never
// talks to the production backend: a fetch interceptor (see
// ../demo/demoBackend.js) answers every /.netlify/functions/* request from a
// fully synthetic, in-browser store. There is NO network path from a demo
// build to a real customer record — that isolation is the whole point.
//
// This is the "white-label TEST TENANT (synthetic data, security lock toggled
// off)" the launch-verification skill targets: agents and the owner can hammer
// every feature freely without touching production data.
//
// The flag is read from import.meta.env so it is compiled in at build time and
// cannot be flipped on at runtime for a normal (production) build.

export const DEMO =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_DEMO === "1") ||
  false;

/** Pre-loaded demo login. Shown on the lock screen and accepted locally
 *  (never sent to Supabase) — see lock.js passwordUnlock + LockGate. */
export const DEMO_CREDENTIALS = {
  email: "demo@aceplumbing.example",
  password: "demo1234",
};

/** The demo tenant's company identity — used to brand the lock screen with the
 *  COMPANY (Ace Plumbing), since this is the white-label showcase. The lock gate
 *  renders before tenant_config resolves, so a static value avoids a "LE Pro"
 *  flash. Kept in sync with demoTenant()/demoProfile() in ../demo/demoData.js. */
export const DEMO_COMPANY = {
  name: "Ace Plumbing Co.",
  locality: "Austin, TX",
};

export function isDemoMode() {
  return DEMO;
}

/** Case-insensitive check that a submitted email/password is the demo login. */
export function isDemoCredential(email, password) {
  return (
    String(email || "").trim().toLowerCase() === DEMO_CREDENTIALS.email &&
    String(password || "") === DEMO_CREDENTIALS.password
  );
}
