// Shared test harness: a fake Netlify-functions server (records every call)
// + renderApp() that mounts the real <App/> with the real store.
import React from "react";
import { render } from "@testing-library/react";
import { HashRouter } from "react-router-dom";
import { vi } from "vitest";
import App from "../src/App.jsx";
import { StoreProvider } from "../src/state/store.jsx";
import { searchCustomerIndex } from "../../netlify/functions/lib/customerSearch.mjs";

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

/** Pin fake "today" so week-calendar tests stay in the same work week as EV. */
export const CAL_WEEK_ANCHOR = "2026-07-10";

export function pinCalWeek() {
  vi.setSystemTime(new Date(`${CAL_WEEK_ANCHOR}T12:00:00`));
}

export const EV = {
  id: "ev1",
  summary: "Estimate — Jane Doe",
  start: `${CAL_WEEK_ANCHOR}T10:00`,
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
    eventsSyncedAt: opts.eventsSyncedAt ?? Date.now() - 60000,
    calendarRequested: false,
    tasks: opts.tasks || [],
    messages: opts.messages || [],
    legacyMessages: opts.legacyMessages || {},
    failChatPosts: opts.failChatPosts || 0, // fail the next N chat op:msg POSTs (retry tests)
    presence: opts.presence || {}, // per-convo map { convo: { lastSeen, view } } — mirrors presence-v1
    docs: opts.docs || {}, // key -> stored "pdf" (docs fn: PDF viewing)
    sasCalls: opts.sasCalls || [], // SAS inbound lead tickets (Calls tab)
    emailInsights: opts.emailInsights || [], // Energy Services email insights
    customers: opts.customers || [], // QBO customer-name index (/customers, #49/#56)
    timetrack: opts.timetrack || {
      employees: [{ id: "emp-levi", name: "Levi", color: "#2563eb", active: true }],
      active: {},
      entries: [],
      ts: Date.now(),
    },
    progress: opts.progress || {
      meta: {
        agent: "Israel (Grok Build)",
        project: "LE Pro",
        generated_at: "2026-07-10 12:00:00Z",
        human_rate_usd_per_hour: 150,
        ai_cost_note: "Grok flat subscription",
      },
      totals: {
        updates: 3,
        commits: 42,
        lines_written: 12000,
        lines_implemented: 9000,
        deletions: 3000,
        deploys: 12,
        active_days: 3,
        first_commit: "2026-07-08 10:00:00",
        last_commit: "2026-07-10 12:00:00",
        active_time_hms: "4:30:00",
        active_hours: 4.5,
        speed_lines_landed_per_hour: 2000,
        money_saved_usd: 675,
      },
      updates: [
        {
          id: 1,
          date: "2026-07-10",
          title: "Test win — dashboard polish",
          commits: 2,
          insertions: 400,
          deletions: 50,
          iterations: [{ hash: "abc1234", time: "12:00", subject: "Test win", insertions: 400, deletions: 50 }],
        },
      ],
      updatedAt: Date.now(),
    },
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
      if (path === "generate-doc") {
        if (method === "POST" && body?.job) {
          const kind = body.kind || "invoice";
          const no = kind === "invoice" ? body.job.invoiceNo : body.job.estimateNo;
          const key = (kind === "invoice" ? "inv-" : "est-") + no;
          state.docs[key] = "%PDF-1.4 local-generated";
          return { ok: true, status: 200, json: async () => ({ ok: true, key, url: "/docs?key=" + key }) };
        }
        return { ok: false, status: 400, json: async () => ({ ok: false }) };
      }
      if (path === "docs-fetch") {
        if (method === "POST" && body?.invoiceNo) {
          const no = String(body.invoiceNo);
          const key = "inv-" + no;
          const job =
            state.jobs.find((j) => String(j.id) === String(body.jobId || "")) ||
            state.jobs.find((j) => String(j.invoiceNo || "").trim() === no);
          const canLocal =
            job &&
            job.invoiceNo &&
            ((job.invoiceLines || []).length > 0 || parseFloat(String(job.amount || "").replace(/[$,]/g, "")) > 0);
          if (canLocal) {
            state.docs[key] = "%PDF-1.4 local-generated";
            return {
              ok: true,
              status: 200,
              json: async () => ({ ok: true, generated: true, local: true, key }),
            };
          }
          const idk = "pdf:pay:" + no + ":" + new Date().toISOString().slice(0, 10);
          const dup = state.commands.find((c) => c.idempotencyKey === idk);
          if (!dup) {
            state.commands.push({
              type: "fetch_pdf",
              jobId: body.jobId || "",
              lane: "judgment",
              idempotencyKey: idk,
              payload: { kind: "invoice", no, docKey: key },
              status: "queued",
            });
          }
          return { ok: true, status: 200, json: async () => ({ ok: true, queued: true }) };
        }
        return { ok: false, status: 400, json: async () => ({ ok: false }) };
      }
      if (path === "pay-link") {
        if (method === "POST" && body?.payload?.i) {
          const code = String(body.payload.i) + "-test";
          data = { ok: true, code, url: "https://leelectrical.us/pay/" + code };
        } else if (method === "GET") {
          const code = decodeURIComponent((String(url).match(/[?&]code=([^&]*)/) || [])[1] || "");
          data = code ? { ok: true, code, payload: { i: code.split("-")[0], sl: "blzelectric", pay: "https://pay.test" } } : { ok: false };
        } else data = { ok: false };
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
              if (c.type === "import_customer") {
                const pl = c.payload || {};
                const qboId = String(pl.qboId || "").trim();
                const name = String(pl.name || "Imported Customer").trim();
                const invNo = "99" + String(seq).padStart(3, "0");
                if (!state.jobs.some((j) => String(j.qboCustomerId || "") === qboId && qboId)) {
                  state.jobs.push({
                    id: "qbo-" + invNo,
                    customer: name,
                    businessName: name,
                    qboCustomerId: qboId,
                    invoiceNo: invNo,
                    amount: "$100",
                    paid: false,
                    openBalance: 100,
                    title: "Imported work",
                    status: { Invoiced: { s: "done" } },
                  });
                  state.syncedAt = Date.now();
                }
                c.status = "done";
                c.result = JSON.stringify({ imported: 1, customerId: qboId, customerName: name });
              }
              data = { ok: true, command: c };
            }
          } else {
            const c = state.commands.find((x) => x.id === body.id);
            if (c) Object.assign(c, body.patch);
            data = { ok: true };
          }
        } else data = { commands: JSON.parse(JSON.stringify(state.commands)) };
      } else if (path === "calendar") {
        if (method === "POST" && body.op === "request") {
          state.calendarRequested = true;
          data = { events: state.events, syncedAt: state.eventsSyncedAt, request: Date.now() };
        } else {
          if (state.calendarRequested) {
            state.eventsSyncedAt = Date.now();
            state.calendarRequested = false;
          }
          data = { events: state.events, syncedAt: state.eventsSyncedAt, request: 0 };
        }
      }
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
          else if (body.op === "migrate" && body.from && body.to) {
            const legacy = state.legacyMessages[body.from] || [];
            const seen = new Set(state.messages.map((m) => m.id));
            for (const m of legacy) {
              if (!m?.id || seen.has(m.id)) continue;
              state.messages.push(m);
              seen.add(m.id);
            }
            state.messages.sort((a, b) => (a.ts || 0) - (b.ts || 0));
          } else if (body.op === "presence")
            state.presence[body.convo || "default"] = { lastSeen: Date.now(), view: body.view || "" };
          data = { ok: true };
        } else if (String(url).includes("presence=1")) data = JSON.parse(JSON.stringify(state.presence));
        else data = { messages: state.messages };
      } else if (path === "customers") {
        const all = state.customers || [];
        const idM = String(url).match(/[?&]id=([^&]*)/);
        if (idM) {
          const cid = decodeURIComponent(idM[1]);
          const customer = all.find((c) => String(c.id) === cid) || null;
          data = { customer: customer ? JSON.parse(JSON.stringify(customer)) : null, ts: Date.now() };
        } else {
          const m = String(url).match(/[?&]q=([^&]*)/);
          const query = m ? decodeURIComponent(m[1]) : "";
          const list = query ? searchCustomerIndex(all, query, 12) : all;
          data = { customers: JSON.parse(JSON.stringify(list)), ts: Date.now() };
        }
      } else if (path === "sas-inbound")
        data = { calls: JSON.parse(JSON.stringify(state.sasCalls)), ts: Date.now() };
      else if (path === "email-insights") {
        if (method === "POST") {
          if (body.op === "patch") {
            const hit = state.emailInsights.find((x) => String(x.id) === String(body.id));
            if (hit) Object.assign(hit, body.patch || {});
            data = { ok: true, insight: hit };
          } else if (body.op === "ingest" || body.op === "ingest_raw") {
            const ins = body.insight || { id: "ei-test-" + seq++, status: "pending", ...(body.email || {}) };
            if (!state.emailInsights.some((x) => x.id === ins.id)) state.emailInsights.unshift(ins);
            data = { ok: true, insight: ins };
          } else data = { ok: false };
        } else {
          const pendingOnly = String(url).includes("pending=1");
          let list = JSON.parse(JSON.stringify(state.emailInsights));
          if (pendingOnly) list = list.filter((x) => x.status === "pending");
          data = { insights: list, ts: Date.now() };
        }
      }
      else if (path === "zelle-vision") {
        if (method === "POST") {
          data = {
            ok: true,
            extracted: opts.zelleExtracted || {
              amount: 2300,
              confirmationNumber: "JPM99cnf72cg",
              date: "2026-07-09",
              memo: "#251841",
              confidence: "high",
            },
            model: "mock",
          };
        }
      } else if (path === "address-suggest") {
        const m = String(url).match(/[?&]q=([^&]*)/);
        const query = m ? decodeURIComponent(m[1]).toLowerCase() : "";
        const map = opts.addressSuggestions || {};
        const hit = Object.entries(map).find(([k]) => query.includes(k));
        data = { suggestions: hit ? hit[1] : [], source: hit ? "places" : "none" };
      } else if (path === "sola-ifields-config") {
        data = {
          ok: true,
          ifieldsKey: "test-ifields-key",
          softwareName: "LE Pro",
          softwareVersion: "1.0.0",
          version: "2.15.2409.2601",
          achEnabled: false,
        };
      } else if (path === "progress") {
        if (method === "POST") {
          state.progress = { ...state.progress, updatedAt: Date.now() };
        }
        data = JSON.parse(JSON.stringify(state.progress));
      } else if (path === "timetrack") {
        if (method === "POST" && body?.op) {
          const doc = state.timetrack;
          const now = Date.now();
          if (body.op === "clock_in") {
            const employeeId = String(body.employeeId || "").trim();
            if (doc.active[employeeId]) {
              const sess = doc.active[employeeId];
              doc.entries.unshift({
                id: "ent-mock",
                employeeId,
                employeeName: (doc.employees.find((e) => e.id === employeeId) || {}).name || "Unknown",
                kind: sess.kind || "shift",
                jobId: sess.jobId || null,
                jobLabel: sess.jobLabel || "",
                startedAt: sess.startedAt,
                endedAt: now,
                durationMs: now - (sess.startedAt || now),
                note: "",
              });
              delete doc.active[employeeId];
            }
            doc.active[employeeId] = {
              id: "sess-" + now,
              kind: body.kind === "job" ? "job" : "shift",
              jobId: body.jobId || null,
              jobLabel: body.jobLabel || "",
              startedAt: now,
              note: "",
              lastSeen: now,
            };
          } else if (body.op === "clock_out") {
            const employeeId = String(body.employeeId || "").trim();
            const sess = doc.active[employeeId];
            if (sess) {
              doc.entries.unshift({
                id: "ent-" + now,
                employeeId,
                employeeName: (doc.employees.find((e) => e.id === employeeId) || {}).name || "Unknown",
                kind: sess.kind || "shift",
                jobId: sess.jobId || null,
                jobLabel: sess.jobLabel || "",
                startedAt: sess.startedAt,
                endedAt: now,
                durationMs: now - (sess.startedAt || now),
                note: "",
              });
              delete doc.active[employeeId];
            }
          } else if (body.op === "add_employee" && body.name) {
            doc.employees.push({
              id: "emp-" + now,
              name: String(body.name),
              color: "#059669",
              active: true,
            });
          } else if (body.op === "heartbeat" && body.employeeId && doc.active[body.employeeId]) {
            doc.active[body.employeeId].lastSeen = now;
          } else if (body.op === "patch_entry" && body.id) {
            const ent = doc.entries.find((x) => x.id === body.id);
            if (ent && body.patch) {
              Object.assign(ent, body.patch);
              if (ent.startedAt && ent.endedAt) ent.durationMs = ent.endedAt - ent.startedAt;
            }
          } else if (body.op === "add_entry") {
            doc.entries.unshift({
              id: "ent-" + now,
              employeeId: body.employeeId,
              employeeName: (doc.employees.find((e) => e.id === body.employeeId) || {}).name || "Unknown",
              kind: body.kind === "job" ? "job" : "shift",
              jobId: body.jobId || null,
              jobLabel: body.jobLabel || "",
              startedAt: body.startedAt,
              endedAt: body.endedAt,
              durationMs: body.endedAt - body.startedAt,
              note: body.note || "",
            });
          } else if (body.op === "delete_entry" && body.id) {
            doc.entries = doc.entries.filter((x) => x.id !== body.id);
          }
          doc.ts = now;
          data = { ok: true, ...JSON.parse(JSON.stringify(doc)) };
        } else data = JSON.parse(JSON.stringify(state.timetrack));
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

/** Matcher for the customer-group subtitle, whose text is split across a <b>.
 *  Returns a testing-library matcher that uniquely selects the subtitle span
 *  by exact normalized textContent (e.g. groupSub("2 jobs · 2 unpaid · $300 due")). */
export function groupSub(text) {
  const want = text.replace(/\s+/g, " ").trim();
  return (_, el) => !!el && (el.textContent || "").replace(/\s+/g, " ").trim() === want;
}

/** Stub anchor-based PDF open (openPdfUrl / openPdfBlob) without recursive createElement. */
export function stubPdfOpen() {
  const click = vi.fn();
  const orig = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag) => {
    if (tag === "a") {
      const a = orig("a");
      a.click = click;
      return a;
    }
    return orig(tag);
  });
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => "blob:mock-pdf");
    URL.revokeObjectURL = vi.fn();
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  }
  return click;
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
