// Demo backend — the isolation boundary for the white-label TEST TENANT.
//
// In demo mode (VITE_DEMO=1) this installs a fetch() interceptor that answers
// EVERY request to /.netlify/functions/* from the synthetic in-browser store
// below. It matches on the path substring "/.netlify/functions/", so it fires
// for BOTH same-origin calls and the absolute production URL that
// functionsBase() hands out (https://leelectrical.us/.netlify/functions/...).
//
// The net effect: a demo build has NO network path to any real backend or any
// real customer record. Even an endpoint we didn't model returns a benign
// { ok: true } instead of reaching the server. That is the guarantee the demo
// exists to make — synthetic data only, impossible to read production data.
//
// Mutations (saveJob, saveProjects, saveSettings, chat) persist to localStorage
// so the demo survives a reload; "Reset demo data" clears that key.

import {
  demoSettings,
  demoJobs,
  demoProjects,
  demoCustomerIndex,
  demoCustomer,
  demoItems,
  demoEvents,
  demoTimeTrack,
} from "./demoData.js";

const STORE_KEY = "lepro_demo_store_v1";
let installed = false;

/* ─────────────────────────── persistent store ─────────────────────────── */

function freshStore() {
  // Stamp "synced just now" so the header sync chip doesn't read "20654d ago".
  const now = typeof Date !== "undefined" && Date.now ? Date.now() : 1;
  return {
    // state.ov overlay — user edits accumulate here. Seed the requisition
    // project under the reserved _projects key the adapter reads.
    ov: { _projects: demoProjects() },
    ts: now,
    syncedAt: now,
    commands: [],
    chat: {}, // convo -> messages[]
    settingsOverride: null, // { profile?, features?, tenant? } from saveSettings
  };
}

function loadStore() {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return { ...freshStore(), ...parsed };
    }
  } catch {
    /* private mode / corrupt — fall through to a fresh store */
  }
  return freshStore();
}

function saveStore(s) {
  try {
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode — persistence is best-effort */
  }
}

/** Wipe demo edits back to the seed (exposed for a "reset demo" affordance). */
export function resetDemoStore() {
  try {
    globalThis.localStorage?.removeItem(STORE_KEY);
    globalThis.localStorage?.removeItem("lepro_followup_state");
  } catch {
    /* ignore */
  }
}

// Seed ONE live reminder (a scheduled follow-up on the Blue Ridge Cafe balance)
// so the Reminders tab and the reminder pop-up have real content to show. The
// reminder state lives in its own localStorage key keyed by calendar event id;
// seed it only when absent so the owner's snooze/dismiss choices stick.
function seedReminderState() {
  try {
    const KEY = "lepro_followup_state";
    if (globalThis.localStorage?.getItem(KEY)) return;
    const now = new Date();
    const past = new Date(now.getTime() - 60 * 60 * 1000); // 1h ago → already due
    const p = (n) => String(n).padStart(2, "0");
    const remindAt = `${past.getFullYear()}-${p(past.getMonth() + 1)}-${p(past.getDate())}T${p(past.getHours())}:${p(past.getMinutes())}`;
    const state = {
      "evt-1002": {
        eventId: "evt-1002",
        remindAt,
        reminderAllocatedAt: now.getTime(),
        priority: "medium",
        note: "Collect the remaining balance from Blue Ridge Cafe.",
        handledAt: "",
        nextNudgeAt: "",
        pushOffCount: 0,
      },
    };
    globalThis.localStorage?.setItem(KEY, JSON.stringify(state));
  } catch {
    /* best-effort — a missing reminder is not fatal */
  }
}

/* ──────────────────────────────── helpers ─────────────────────────────── */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function urlOf(input) {
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && "url" in input) return input.url;
  try {
    return String(input);
  } catch {
    return "";
  }
}

async function bodyOf(input, init) {
  // Prefer an explicit init.body (that is how the adapter always calls fetch).
  const raw = init && init.body != null ? init.body : null;
  if (raw != null) {
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    return {};
  }
  // Fallback: a Request object carrying a JSON body.
  if (input && typeof input === "object" && typeof input.json === "function") {
    try {
      return await input.clone().json();
    } catch {
      return {};
    }
  }
  return {};
}

function methodOf(input, init) {
  if (init && init.method) return String(init.method).toUpperCase();
  if (input && typeof input === "object" && input.method) return String(input.method).toUpperCase();
  return "GET";
}

/* ─────────────────────────────── router ───────────────────────────────── */

async function route(fn, params, method, body, store) {
  switch (fn) {
    /* ---- jobs + overlay ---- */
    case "jobsdata": {
      if (method === "POST") {
        // op:request → pretend a QBO pull finished so pullJobs() returns fast.
        store.syncedAt += 1;
        saveStore(store);
        return json({ ok: true, syncedAt: store.syncedAt });
      }
      return json({ jobs: demoJobs(), syncedAt: store.syncedAt });
    }
    case "state": {
      if (method === "POST") {
        store.ov = body && typeof body.ov === "object" ? body.ov : store.ov;
        store.ts += 1;
        saveStore(store);
        return json({ ok: true, ts: store.ts });
      }
      return json({ ov: store.ov, ts: store.ts });
    }

    /* ---- tenant / white-label settings ---- */
    case "settings": {
      const base = demoSettings();
      const ov = store.settingsOverride || {};
      const merged = {
        profile: { ...base.profile, ...(ov.profile || {}) },
        features: { ...base.features, ...(ov.features || {}) },
        // tenant.internal stays false — a demo tenant can't grant itself dev tooling.
        tenant: { ...base.tenant, ...(ov.tenant || {}), internal: false },
        updatedAt: store.ts,
        ts: store.ts,
      };
      if (method === "POST") {
        store.settingsOverride = {
          profile: body.profile != null ? body.profile : ov.profile,
          features: body.features != null ? body.features : ov.features,
          tenant: body.tenant != null ? body.tenant : ov.tenant,
        };
        store.ts += 1;
        saveStore(store);
        return json({ ok: true, ...merged, updatedAt: store.ts, ts: store.ts });
      }
      return json(merged);
    }

    /* ---- customers / items / addresses ---- */
    case "customers": {
      const id = params.get("id");
      if (id) return json({ customer: demoCustomer(id) });
      return json({ customers: demoCustomerIndex(params.get("q")) });
    }
    case "items":
      return json({ items: demoItems() });
    case "address-suggest":
      return json({ suggestions: [] });

    /* ---- calendar ---- */
    case "calendar": {
      if (method === "POST") {
        store.syncedAt += 1;
        saveStore(store);
        return json({ ok: true, syncedAt: store.syncedAt });
      }
      return json({ events: demoEvents(), syncedAt: store.syncedAt, request: 0 });
    }

    /* ---- command bus ---- */
    case "command": {
      if (method === "POST") {
        if (body.op === "enqueue") {
          const command = {
            ...(body.command || {}),
            id: "cmd-" + (store.commands.length + 1),
            status: "done",
            createdAt: store.ts,
          };
          store.commands.push(command);
          saveStore(store);
          return json({ ok: true, command, deduped: false });
        }
        return json({ ok: true });
      }
      return json({ commands: store.commands });
    }

    /* ---- dev board / leads / insights (empty in demo) ---- */
    case "devtasks":
      return method === "POST" ? json({ ok: true }) : json({ tasks: [] });
    case "sas-inbound":
      return json({ calls: [] });
    case "email-insights":
      return method === "POST" ? json({ ok: true }) : json({ insights: [] });

    /* ---- chat bubble ---- */
    case "chat": {
      if (params.get("presence") != null) return json({ presence: {} });
      if (method === "POST") {
        if (body.op === "msg") {
          const convo = body.convo || "default";
          const list = store.chat[convo] || (store.chat[convo] = []);
          list.push({ id: body.id || "m-" + (list.length + 1), text: body.text, from: "me", ts: store.ts });
          store.ts += 1;
          saveStore(store);
        }
        return json({ ok: true });
      }
      const convo = params.get("convo") || "default";
      return json({ messages: store.chat[convo] || [] });
    }
    case "iterate":
      return json({ ok: true });

    /* ---- time tracking ---- */
    case "timetrack":
      return method === "POST" ? json({ ok: true, ...demoTimeTrack() }) : json(demoTimeTrack());

    /* ---- agent access (owner-minted codes — not used in demo) ---- */
    case "agent-access":
      return method === "POST" ? json({ ok: false, error: "demo" }) : json({ active: false, grants: [] });

    /* ---- documents: report "not stored" so getDoc() returns null and the
           app falls back to its client-side PDF generation. ---- */
    case "docs":
      return json({ error: "not_found" }, 404);

    /* ---- email send: simulate a dry-run so nothing actually leaves. ---- */
    case "send-doc-email":
      return json({ ok: true, dryRun: true, demo: true, reason: "demo_no_send" });
    case "payment-confirm-email":
    case "customer-email":
      return json({ ok: true, dryRun: true, demo: true });

    /* ---- pay links ---- */
    case "pay-link":
      return json({ ok: true, url: "#demo-pay-link" });

    /* ---- card processing: never charge in a demo. ---- */
    case "sola-charge":
    case "sola-payment":
    case "sola-keys":
    case "sola-ifields-config":
      return json({ ok: false, demo: true, error: "Card processing is disabled in the demo." });

    /* ---- anything else: benign OK, never a real network call. ---- */
    default:
      return json({ ok: true, demo: true });
  }
}

/* ─────────────────────────────── install ──────────────────────────────── */

export function installDemoBackend() {
  if (installed) return;
  if (typeof globalThis.fetch !== "function") return;
  installed = true;

  seedReminderState();

  const realFetch = globalThis.fetch.bind(globalThis);
  const MARK = "/.netlify/functions/";

  globalThis.fetch = async function demoFetch(input, init) {
    let url = "";
    try {
      url = urlOf(input);
    } catch {
      url = "";
    }
    const idx = url.indexOf(MARK);
    if (idx === -1) {
      // Not a backend data call — let it through (static assets, etc.).
      return realFetch(input, init);
    }
    try {
      const rest = url.slice(idx + MARK.length);
      const qIdx = rest.search(/[?#]/);
      const fn = (qIdx === -1 ? rest : rest.slice(0, qIdx)).replace(/\/.*$/, "");
      let params;
      try {
        params = new URL(url, "http://demo.local").searchParams;
      } catch {
        params = new URLSearchParams();
      }
      const method = methodOf(input, init);
      const body = method === "GET" ? {} : await bodyOf(input, init);
      const store = loadStore();
      return await route(fn, params, method, body, store);
    } catch (err) {
      // Fail closed but non-fatally: a handler bug must never fall through to
      // the real network. Return an error body the adapter can tolerate.
      return json({ ok: false, demo: true, error: String(err && err.message) }, 200);
    }
  };
}
