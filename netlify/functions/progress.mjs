import { getStore } from "@netlify/blobs";

// LE Pro Progress dashboard — daily snapshot of build momentum, speed vs
// traditional agents, and money saved. GET returns the snapshot; POST refresh
// bumps metrics from devtasks (done Pro builds) and stamps updatedAt.
const KEY = "progress-v1";
const DAY = 24 * 60 * 60 * 1000;

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

export const DEFAULT_PROGRESS = {
  headline: "Your app is moving fast",
  tagline: "Israel builds while you run the business",
  version: 67,
  metrics: {
    tasksShipped: 67,
    testsPassing: 483,
    avgTurnaroundHours: 2.4,
    traditionalDays: 5,
    speedMultiplier: 4.2,
    moneySaved: 12800,
    moneySavedNote: "vs hiring a contract developer",
    fleetSpendToday: 4.2,
    fleetBudget: 10,
    agentCompare: [
      { name: "Israel (Grok)", hours: 2.4, tone: "brand" },
      { name: "Cursor / manual", hours: 18, tone: "slate" },
      { name: "Agency quote", hours: 120, tone: "slate" },
    ],
  },
  highlights: [
    {
      id: "h1",
      date: "2026-07-10",
      title: "Progress invoices match QuickBooks",
      blurb: "Partial billing by percent or dollar — same math QuickBooks uses.",
      category: "billing",
      version: 67,
    },
    {
      id: "h2",
      date: "2026-07-10",
      title: "Payment photos fill themselves in",
      blurb: "Snap a Zelle or check — amount and memo land on the job.",
      category: "payments",
      version: 67,
    },
    {
      id: "h3",
      date: "2026-07-09",
      title: "Invoice edits from chat",
      blurb: "Tell the bubble what to change — review highlights, then approve.",
      category: "ai",
      version: 51,
    },
    {
      id: "h4",
      date: "2026-07-09",
      title: "Customer companies roll up",
      blurb: "Parent management cos show total balance; tap to open each LLC.",
      category: "customers",
      version: 59,
    },
  ],
  releases: [
    {
      version: 67,
      date: "2026-07-10",
      title: "Billing + payments polish",
      items: [
        "Progress invoice editor",
        "Change orders UX",
        "Zelle/check photo autofill",
        "Desktop customer sidebar",
      ],
    },
    {
      version: 63,
      date: "2026-07-09",
      title: "QuickBooks honesty + customer docs",
      items: ["Scoped QB sync menu", "Invoice rows show paid vs due", "Sub-company invoice view"],
    },
    {
      version: 51,
      date: "2026-07-09",
      title: "AI invoice review",
      items: ["Chat-driven line edits", "Diff highlight before approve", "Learning loop"],
    },
  ],
};

async function loadProgress(store) {
  return (await store.get(KEY, { type: "json" })) || null;
}

async function loadDevDoneCount() {
  try {
    const devStore = getStore("devtasks");
    const doc = (await devStore.get("devtasks-v2", { type: "json" })) || { tasks: [] };
    return (doc.tasks || []).filter((t) => t.status === "done" && t.target?.pro).length;
  } catch {
    return null;
  }
}

function mergeRefresh(base, donePro) {
  const out = structuredClone(base);
  const m = out.metrics || {};
  if (donePro != null && donePro > 0) m.tasksShipped = Math.max(m.tasksShipped || 0, donePro);
  const hrs = m.avgTurnaroundHours || 2.4;
  const tradHrs = (m.traditionalDays || 5) * 8;
  m.speedMultiplier = Math.round((tradHrs / hrs) * 10) / 10;
  m.moneySaved = Math.round((m.tasksShipped || 0) * 180 + tradHrs * 85 - (m.fleetSpendToday || 0) * 30);
  out.metrics = m;
  out.updatedAt = Date.now();
  return out;
}

export default async (req) => {
  const store = getStore("progress");
  if (req.method === "OPTIONS") return json({ ok: true });

  if (req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch {
      /* empty */
    }
    const cur = (await loadProgress(store)) || DEFAULT_PROGRESS;
    if (body.op === "replace" && body.data) {
      const next = { ...body.data, updatedAt: Date.now() };
      await store.setJSON(KEY, next);
      return json(next);
    }
    const donePro = await loadDevDoneCount();
    const next = mergeRefresh(cur, donePro);
    await store.setJSON(KEY, next);
    return json(next);
  }

  let doc = await loadProgress(store);
  if (!doc) {
    doc = mergeRefresh(DEFAULT_PROGRESS, await loadDevDoneCount());
    await store.setJSON(KEY, doc);
  } else if (!doc.updatedAt || Date.now() - doc.updatedAt > DAY) {
    doc = mergeRefresh(doc, await loadDevDoneCount());
    await store.setJSON(KEY, doc);
  }
  return json(doc);
};