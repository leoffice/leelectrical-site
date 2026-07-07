// Shared test harness: a fake Netlify-functions server (records every call)
// + renderApp() that mounts the real <App/> with the real store.
import React from "react";
import { render } from "@testing-library/react";
import { HashRouter } from "react-router-dom";
import { vi } from "vitest";
import App from "../src/App.jsx";
import { StoreProvider } from "../src/state/store.jsx";

export const J1 = {
  id: "J-1",
  customer: "Peretz Chein",
  businessName: "Peretz Chein",
  personName: "",
  title: "Panel upgrade",
  amount: "$2,300",
  invoiceNo: "251841",
  estimateNo: "E-9",
  phone: "718-555-1111",
  email: "p@x.com",
  address: "123 Main St, Brooklyn",
  serviceAddress: "123 Main St, Brooklyn",
  billingAddress: "405 Lefferts Ave",
  paid: false,
  notes: "",
  attachments: [{ name: "Old photo", url: "https://x/1" }],
  invoiceHistory: [],
  status: { Lead: { s: "done", d: "2026-06-29" } },
};

export const J2 = {
  id: "J-2",
  customer: "Second Guy",
  title: "Outlet swap",
  amount: "$500",
  paid: false,
  status: {},
};

export const EV = {
  id: "ev1",
  summary: "Estimate — Jane Doe",
  start: "2026-07-10T10:00",
  location: "55 Elm St",
  description: "phone: 917-555-2222 jane@x.com",
};

export function mockServer(opts = {}) {
  const state = {
    jobs: opts.jobs || [JSON.parse(JSON.stringify(J1)), JSON.parse(JSON.stringify(J2))],
    ov: opts.ov || {},
    stateTs: opts.stateTs ?? Date.now(), // ts of the ov snapshot (stale-read guard)
    syncedAt: opts.syncedAt ?? Date.now() - 5 * 60000,
    commands: opts.commands || [],
    events: opts.events || [EV],
    tasks: opts.tasks || [],
    messages: opts.messages || [],
    failChatPosts: opts.failChatPosts || 0, // fail the next N chat op:msg POSTs (retry tests)
    presence: opts.presence || {}, // per-convo map { convo: { lastSeen, view } } — mirrors presence-v1
    docs: opts.docs || {}, // key -> stored "pdf" (docs fn: PDF viewing)
    sasCalls: opts.sasCalls || [], // SAS inbound lead tickets (Calls tab)
    customers: opts.customers || [], // QBO customer-name index (/customers, #49/#56)
  };
  const calls = [];
  let seq = 1;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, o = {}) => {
      const path = String(url).split("/functions/")[1].split("?")[0];
      const method = o.method || "GET";
      const body = o.body ? JSON.parse(o.body) : null;
      calls.push({ path, method, body });
      let data = {};
      if (path === "docs") {
        // Binary-ish endpoint: 404 JSON when missing, PDF blob when stored.
        if (method === "POST") {
          if (body.op === "put" && body.key) state.docs[body.key] = body.b64 || "%PDF";
          return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true }) };
        }
        const key = decodeURIComponent((String(url).match(/[?&]key=([^&]*)/) || [])[1] || "");
        if (state.docs[key])
          return {
            ok: true,
            status: 200,
            headers: { get: (h) => (h === "content-type" ? "application/pdf" : "") },
            blob: async () => new Blob([state.docs[key]], { type: "application/pdf" }),
            json: async () => ({}),
          };
        return { ok: false, status: 404, headers: { get: () => "application/json" }, json: async () => ({ ok: false, error: "not found" }) };
      }
      if (path === "jobsdata")
        data = method === "POST" ? { ok: true } : { jobs: state.jobs, syncedAt: state.syncedAt };
      else if (path === "state") {
        // Mirrors the live fn: POST stamps ts, GET returns { ov, ts } (the
        // adapter/store use ts to detect stale eventually-consistent reads).
        if (method === "POST") {
          state.ov = body.ov;
          state.stateTs = Date.now();
          data = { ok: true, ts: state.stateTs };
        } else data = { ov: state.ov, ts: state.stateTs };
      } else if (path === "command") {
        if (method === "POST") {
          if (body.op === "enqueue") {
            const dup = state.commands.find((c) => c.idempotencyKey === body.command.idempotencyKey);
            if (dup) data = { ok: true, deduped: true, command: dup };
            else {
              const c = { ...body.command, id: "c" + seq++, status: "queued", createdAt: Date.now() };
              state.commands.push(c);
              data = { ok: true, command: c };
            }
          } else {
            const c = state.commands.find((x) => x.id === body.id);
            if (c) Object.assign(c, body.patch);
            data = { ok: true };
          }
        } else data = { commands: JSON.parse(JSON.stringify(state.commands)) };
      } else if (path === "calendar") data = { events: state.events };
      else if (path === "devtasks") {
        if (method === "POST") {
          if (body.op === "add")
            state.tasks.push({ ...body.task, id: "t" + state.tasks.length, num: state.tasks.length + 1, status: "new", ts: Date.now() });
          else {
            const t = state.tasks.find((x) => x.id === body.id);
            if (t) Object.assign(t, body.patch);
          }
          data = { ok: true };
          // fresh objects each GET, like a real HTTP round-trip (a same-reference
          // array would make React bail out of re-rendering after refreshDev)
        } else data = { tasks: JSON.parse(JSON.stringify(state.tasks)) };
      } else if (path === "chat") {
        // Mirrors the live chat fn: bubble msgs -> who:"you", replies -> who:"claude".
        if (method === "POST") {
          if (state.failChatPosts > 0 && body.op === "msg") {
            state.failChatPosts--;
            return { ok: false, status: 500, json: async () => ({ ok: false }) };
          }
          if (body.op === "msg") state.messages.push({ id: body.id, who: "you", text: body.text, status: "Sent", ts: Date.now() });
          else if (body.op === "reply") state.messages.push({ id: "r" + seq++, who: "claude", text: body.text, status: "", ts: Date.now() });
          else if (body.op === "presence")
            state.presence[body.convo || "default"] = { lastSeen: Date.now(), view: body.view || "" };
          data = { ok: true };
        } else if (String(url).includes("presence=1")) data = JSON.parse(JSON.stringify(state.presence));
        else data = { messages: state.messages };
      } else if (path === "customers") {
        // Name index for New Job smart search + Jobs-tab QBO search. GET ?q=
        // filters by substring (mirrors the live fn's ranked contains match).
        const m = String(url).match(/[?&]q=([^&]*)/);
        const query = m ? decodeURIComponent(m[1]).toLowerCase() : "";
        const all = state.customers || [];
        const list = query
          ? all.filter((c) => String(c.name || "").toLowerCase().includes(query))
          : all;
        data = { customers: JSON.parse(JSON.stringify(list)), ts: Date.now() };
      } else if (path === "sas-inbound")
        data = { calls: JSON.parse(JSON.stringify(state.sasCalls)), ts: Date.now() };
      else if (path === "iterate") data = { ok: true };
      return { ok: true, status: 200, json: async () => data };
    })
  );
  return {
    state,
    calls,
    posts: (path, pred) =>
      calls.filter((c) => c.path === path && c.method === "POST" && (!pred || pred(c.body))),
    enqueued: (type) =>
      calls
        .filter((c) => c.path === "command" && c.method === "POST" && c.body.op === "enqueue")
        .map((c) => c.body.command)
        .filter((c) => !type || c.type === type),
  };
}

/** Matcher for the customer-group subtitle, whose text is split across a <b>.
 *  Returns a testing-library matcher that uniquely selects the subtitle span
 *  by exact normalized textContent (e.g. groupSub("2 jobs · 2 unpaid · $300 due")). */
export function groupSub(text) {
  const want = text.replace(/\s+/g, " ").trim();
  return (_, el) => !!el && (el.textContent || "").replace(/\s+/g, " ").trim() === want;
}

export function renderApp(hash = "#/") {
  window.location.hash = hash;
  return render(
    <HashRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </HashRouter>
  );
}
