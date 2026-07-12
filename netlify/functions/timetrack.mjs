import { getStore } from "@netlify/blobs";

// Multi-user employee time tracking — clock in/out, job time, live sync.
// GET  -> { employees, active, entries, ts }
// POST -> { op, ... }
//   clock_in   { employeeId, kind:"shift"|"job", jobId?, jobLabel?, note? }
//   clock_out  { employeeId }
//   add_employee { name }
//   remove_employee { id }
//   patch_entry { id, patch:{ note? } }
const KEY = "timetrack-v1";

const COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#4f46e5"];

function json(o) {
  return new Response(JSON.stringify(o), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

function blankDoc() {
  return {
    employees: [{ id: "emp-levi", name: "Levi", color: COLORS[0], active: true }],
    active: {},
    entries: [],
    ts: 0,
  };
}

async function load(store) {
  const doc = (await store.get(KEY, { type: "json", consistency: "strong" })) || blankDoc();
  doc.employees = doc.employees || [];
  doc.active = doc.active || {};
  doc.entries = doc.entries || [];
  if (!doc.employees.length) doc.employees = blankDoc().employees;
  return doc;
}

function empName(doc, id) {
  const e = doc.employees.find((x) => x.id === id);
  return e ? e.name : "Unknown";
}

function closeActive(doc, employeeId, endedAt = Date.now()) {
  const sess = doc.active[employeeId];
  if (!sess) return null;
  const entry = {
    id: "ent-" + endedAt + "-" + Math.random().toString(36).slice(2, 6),
    employeeId,
    employeeName: empName(doc, employeeId),
    kind: sess.kind || "shift",
    jobId: sess.jobId || null,
    jobLabel: sess.jobLabel || "",
    startedAt: sess.startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - (sess.startedAt || endedAt)),
    note: sess.note || "",
  };
  doc.entries.unshift(entry);
  if (doc.entries.length > 500) doc.entries.length = 500;
  delete doc.active[employeeId];
  return entry;
}

export default async (req) => {
  const store = getStore("timetrack");
  if (req.method === "OPTIONS") return json({ ok: true });

  if (req.method === "POST") {
    let b = {};
    try {
      b = await req.json();
    } catch (e) {}
    const doc = await load(store);
    const now = Date.now();

    if (b.op === "clock_in") {
      const employeeId = String(b.employeeId || "").trim();
      if (!employeeId) return json({ ok: false, error: "employee required" });
      const kind = b.kind === "job" ? "job" : "shift";
      if (doc.active[employeeId]) closeActive(doc, employeeId, now);
      doc.active[employeeId] = {
        id: "sess-" + now,
        kind,
        jobId: kind === "job" ? String(b.jobId || "").trim() || null : null,
        jobLabel: kind === "job" ? String(b.jobLabel || "").trim() : "",
        startedAt: now,
        note: String(b.note || "").trim(),
        lastSeen: now,
      };
    } else if (b.op === "clock_out") {
      const employeeId = String(b.employeeId || "").trim();
      if (!employeeId || !doc.active[employeeId]) return json({ ok: false, error: "not clocked in" });
      closeActive(doc, employeeId, now);
    } else if (b.op === "add_employee") {
      const name = String(b.name || "").trim();
      if (!name) return json({ ok: false, error: "name required" });
      const id = "emp-" + now;
      doc.employees.push({
        id,
        name,
        color: COLORS[doc.employees.length % COLORS.length],
        active: true,
      });
    } else if (b.op === "remove_employee") {
      const id = String(b.id || "").trim();
      if (!id || id === "emp-levi") return json({ ok: false, error: "cannot remove" });
      if (doc.active[id]) return json({ ok: false, error: "clocked in" });
      doc.employees = doc.employees.filter((e) => e.id !== id);
    } else if (b.op === "patch_entry") {
      const ent = doc.entries.find((x) => x.id === b.id);
      if (ent && b.patch) {
        if ("note" in b.patch) ent.note = String(b.patch.note || "");
      }
    } else if (b.op === "heartbeat") {
      const employeeId = String(b.employeeId || "").trim();
      if (doc.active[employeeId]) doc.active[employeeId].lastSeen = now;
    } else {
      return json({ ok: false, error: "bad op" });
    }

    doc.ts = now;
    await store.setJSON(KEY, doc);
    return json({ ok: true, ...doc });
  }

  return json(await load(store));
};