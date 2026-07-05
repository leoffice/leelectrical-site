// Data layer entry point. ONE async interface, TWO implementations:
//
//   api.listJobsMeta()                              -> { jobs, syncedAt }
//   api.listJobs() / api.getJob(id)                 -> Job[] / Job|null
//   api.saveJob(id, patch)                          -> { ok, ts }
//   api.requestSync()                               -> asks for a fresh QBO pull
//   api.listCommands(jobId?)                        -> Command[]
//   api.enqueueCommand(type,jobId,payload,lane,idk) -> { command, deduped }
//   api.updateCommand(id, patch, note)              -> retry / approvals
//   api.listEvents()                                -> CalendarEvent[]
//   api.listDevTasks/addDevTask/patchDevTask        -> dev board
//   api.chatList/chatSend/iterate                   -> Dispatch chat bubble
//   api.presence(convo, view)                       -> heartbeat (fire-and-forget)
//
// Default: NetlifyStoreAdapter (live today). Set localStorage
// lepro_adapter = "supabase" to switch once that backend ships — any method
// the alternate adapter doesn't implement falls back to the Netlify one.
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
  const netlify = createNetlifyAdapter();
  if (name !== "supabase") return netlify;
  const supa = createSupabaseAdapter();
  // Fallback: anything supabase doesn't do yet keeps working via netlify.
  return new Proxy(supa, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return netlify[prop];
    },
  });
}

export const api = createAdapter();
export default api;
