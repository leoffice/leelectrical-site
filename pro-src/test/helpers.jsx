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
  title: "Panel upgrade",
  amount: "$2,300",
  invoiceNo: "251841",
  estimateNo: "E-9",
  phone: "718-555-1111",
  email: "p@x.com",
  address: "123 Main St, Brooklyn",
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
  start: "2099-07-08T10:00",
  location: "55 Elm St",
  description: "phone: 917-555-2222 jane@x.com",
};

export function mockServer(opts = {}) {
  const state = {
    jobs: opts.jobs || [JSON.parse(JSON.stringify(J1)), JSON.parse(JSON.stringify(J2))],
    ov: opts.ov || {},
    syncedAt: opts.syncedAt ?? Date.now() - 5 * 60000,
    commands: opts.commands || [],
    events: opts.events || [EV],
    tasks: opts.tasks || [],
    messages: opts.messages || [],
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
      if (path === "jobsdata")
        data = method === "POST" ? { ok: true } : { jobs: state.jobs, syncedAt: state.syncedAt };
      else if (path === "state") {
        if (method === "POST") {
          state.ov = body.ov;
          data = { ok: true, ts: Date.now() };
        } else data = { ov: state.ov, ts: 1 };
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
        } else data = { commands: state.commands };
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
        } else data = { tasks: state.tasks };
      } else if (path === "chat") {
        if (method === "POST") {
          state.messages.push({ id: body.id, who: "me", text: body.text, status: "Sent" });
          data = { ok: true };
        } else data = { messages: state.messages };
      } else if (path === "iterate") data = { ok: true };
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
