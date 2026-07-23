#!/usr/bin/env node
/**
 * Provision (or tear down) the two THROWAWAY auth users the cross-tenant
 * isolation matrix needs. Run by Dispatch/service-side — it reads the service
 * role key from the environment and NEVER prints it.
 *
 *   iso-a@test.local  → tenant A (le)    owner   (fixtures give it the profile)
 *   iso-b@test.local  → tenant B (test2) owner
 *
 * These are inert @test.local principals marked app_metadata.isolation_test=true,
 * created only so RLS can be proven from two authenticated identities. No real
 * account is touched.
 *
 * Usage (Dispatch supplies the service key in the env — it is not stored here):
 *   SUPABASE_SERVICE_ROLE_KEY=… node scripts/provision-isolation-users.mjs
 *   SUPABASE_SERVICE_ROLE_KEY=… node scripts/provision-isolation-users.mjs --delete
 *
 * Optional env: ISO_A_PW / ISO_B_PW override the default test passwords.
 * On create it prints each user's email → UUID (paste those into
 * scripts/tenant-isolation-fixtures.sql as TA_UID / TB_UID) and the passwords
 * to hand to the matrix runner. Idempotent: re-running reports existing users.
 *
 * Exit: 0 ok, 2 setup/usage error.
 */

const URL = process.env.SUPABASE_URL || "https://scgpxbubakfwypycugoa.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DELETE = process.argv.slice(2).includes("--delete");

const USERS = [
  { email: "iso-a@test.local", pw: process.env.ISO_A_PW || "iso-A-throwaway-7q2", tenant: "le" },
  { email: "iso-b@test.local", pw: process.env.ISO_B_PW || "iso-B-throwaway-4m8", tenant: "test2" },
];

if (!KEY) {
  console.error(
    "Setup error: SUPABASE_SERVICE_ROLE_KEY not in env.\n" +
      "Run this service-side (Dispatch) with the key exported — it is never read from disk here."
  );
  process.exit(2);
}

const admin = (path, init = {}) =>
  fetch(`${URL}/auth/v1/admin${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  });

// The admin list endpoint is paged; find a user by email across pages.
async function findByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const res = await admin(`/users?page=${page}&per_page=200`);
    if (!res.ok) throw new Error(`list users failed: HTTP ${res.status}`);
    const { users = [] } = await res.json();
    const hit = users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (users.length < 200) break;
  }
  return null;
}

async function createOne({ email, pw }) {
  const res = await admin("/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: pw,
      email_confirm: true, // so the password grant works immediately
      app_metadata: { isolation_test: true },
    }),
  });
  if (res.status === 200 || res.status === 201) {
    const u = await res.json();
    return { id: u.id, created: true };
  }
  // Already exists (or race) — look it up and reuse.
  const existing = await findByEmail(email);
  if (existing) return { id: existing.id, created: false };
  const body = await res.text();
  throw new Error(`create ${email} failed: HTTP ${res.status} ${body.slice(0, 200)}`);
}

async function deleteOne({ email }) {
  const existing = await findByEmail(email);
  if (!existing) return { deleted: false, note: "not found" };
  const res = await admin(`/users/${existing.id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete ${email} failed: HTTP ${res.status}`);
  return { deleted: true, id: existing.id };
}

async function main() {
  console.log(`\nIsolation test users → ${URL}  (${DELETE ? "DELETE" : "CREATE"})\n`);
  if (DELETE) {
    for (const u of USERS) {
      const r = await deleteOne(u);
      console.log(`  ${u.email}: ${r.deleted ? "deleted " + r.id : r.note}`);
    }
    console.log(
      "\nAuth users removed. Also run the teardown block at the bottom of " +
        "scripts/tenant-isolation-fixtures.sql to drop the test2 tenant + its rows."
    );
    return;
  }
  const out = [];
  for (const u of USERS) {
    const r = await createOne(u);
    out.push({ ...u, id: r.id, created: r.created });
    console.log(`  ${u.email}: ${r.created ? "created" : "exists"}  id=${r.id}`);
  }
  console.log("\nNext steps:");
  console.log("  1) Paste these UUIDs into scripts/tenant-isolation-fixtures.sql:");
  console.log(`       \\set TA_UID '${out[0].id}'`);
  console.log(`       \\set TB_UID '${out[1].id}'`);
  console.log("     then run that file (service-side) to seed tenant 'test2' + profiles.");
  console.log("  2) Hand these throwaway logins to the matrix runner:");
  for (const u of out) console.log(`       ${u.email} / ${u.pw}   (tenant ${u.tenant})`);
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(2);
});
