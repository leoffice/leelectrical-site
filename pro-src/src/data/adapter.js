// Data layer entry point. ONE async interface, TWO implementations:
//
//   api.listJobs()                                  -> Job[]   (merged view)
//   api.getJob(id)                                  -> Job | null
//   api.saveJob(id, patch)                          -> { ok, ts }
//   api.listCommands(jobId?)                        -> Command[]
//   api.enqueueCommand(type, jobId, payload, lane, idempotencyKey) -> Command
//   api.listEvents()                                -> CalendarEvent[]
//   api.listDevTasks()                              -> DevTask[]
//
// Default: NetlifyStoreAdapter (live today). Set localStorage
// lepro_adapter = "supabase" to switch once that backend ships.
import { createNetlifyAdapter } from "./netlifyAdapter.js";
import { createSupabaseAdapter } from "./supabaseAdapter.js";

const ADAPTER_KEY = "lepro_adapter";

export function getAdapterName() {
  try {
    return localStorage.getItem(ADAPTER_KEY) || "netlify";
  } catch {
    return "netlify";
  }
}

export function createAdapter(name = getAdapterName()) {
  return name === "supabase" ? createSupabaseAdapter() : createNetlifyAdapter();
}

export const api = createAdapter();
export default api;
