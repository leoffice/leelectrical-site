// SupabaseAdapter — STUB for the future Postgres backend.
// Schema lives in pro-src/supabase/schema.sql. Same interface as the
// NetlifyStoreAdapter so the app can switch with zero UI changes
// (localStorage key "lepro_adapter" = "supabase").
//
// TODO(module 2+):
//   1. `npm i @supabase/supabase-js` and create the client:
//        import { createClient } from "@supabase/supabase-js";
//        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
//      URL/key via Vite env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
//   2. Auth: supabase.auth.signInWithOtp (magic link) — profiles.role gates
//      write access via RLS (see schema.sql).
//   3. Migration: one-time script reads jobsdata+state from Netlify, splits
//      each merged job into customers + jobs + job_steps rows.
//   4. Realtime: supabase.channel("jobs").on("postgres_changes", ...) to
//      replace the dashboard's polling.

/* eslint-disable no-unused-vars */

const NOT_READY =
  "SupabaseAdapter is not implemented yet — module 1 ships with the NetlifyStoreAdapter. See pro-src/supabase/schema.sql.";

export function createSupabaseAdapter() {
  return {
    name: "supabase",

    async listJobs() {
      // TODO: select jobs + customers + job_steps, fold steps back into the
      // UI's status map:
      //   const { data, error } = await supabase
      //     .from("jobs")
      //     .select("*, customer:customers(*), steps:job_steps(*)")
      //     .eq("deleted", false).eq("archived", false)
      //     .order("updated_at", { ascending: false });
      //   return data.map(rowToJob);
      throw new Error(NOT_READY);
    },

    async getJob(id) {
      // TODO: .from("jobs").select("*, customer:customers(*), steps:job_steps(*)").eq("id", id).single()
      throw new Error(NOT_READY);
    },

    async saveJob(id, patch) {
      // TODO: transactional-ish save:
      //   - upsert customers row when patch touches customer fields
      //   - update jobs row (title, amount_cents, invoice_no, paid, notes...)
      //   - upsert job_steps rows for patch.status entries
      //   - insert an activity row { job_id, type:"edit", payload: patch }
      throw new Error(NOT_READY);
    },

    async listCommands(jobId) {
      // TODO: activity table plays the audit role; a dedicated commands table
      // (or Supabase Edge Function + pg queue) replaces the Netlify bus.
      throw new Error(NOT_READY);
    },

    async enqueueCommand(type, jobId, payload, lane, idempotencyKey) {
      // TODO: insert into a commands table with a UNIQUE(idempotency_key)
      // constraint — ON CONFLICT DO NOTHING gives idempotency for free.
      throw new Error(NOT_READY);
    },

    async listEvents() {
      // TODO: .from("appointments").select("*").gte("start_ts", new Date().toISOString())
      throw new Error(NOT_READY);
    },

    async listDevTasks() {
      // TODO: dev tasks stay on the Netlify store until the team fully moves.
      throw new Error(NOT_READY);
    },
  };
}
