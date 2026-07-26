import { getStore } from "./lib/storage/index.mjs";
import { resolveTenant } from "./lib/tenant.mjs";
import { searchCustomerIndex } from "./lib/customerSearch.mjs";

// Customer index for the Pro app New Job smart search (task #49) + QB contact
// prefill (QuickBooks customer info). Host push may include optional fields:
//   { name, id, businessName, personName, phone, email, billingAddress }
//   GET             -> { customers:[...], updated, ts }
//   GET ?q=drizin   -> { customers:[...top 12 matches], ts }
//   GET ?id=34      -> { customer:{...}|null, ts }
//   POST {op:"set", customers:[...], updated}   (host push)
const KEY = "customers-v1";

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    },
  });
}

async function load(store) {
  return (await store.get(KEY, { type: "json", consistency: "strong" })) ||
    { customers: [], updated: "", ts: 0 };
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const tenant = await resolveTenant(req);
  if (tenant == null) return json({ ok: false, error: "unauthenticated" }, 401);
  const store = getStore("customers", tenant);

  if (req.method === "POST") {
    let b = {};
    try { b = await req.json(); } catch (e) {}
    if (b.op === "set" && Array.isArray(b.customers)) {
      await store.setJSON(KEY, { customers: b.customers, updated: b.updated || "", ts: Date.now() });
      return json({ ok: true, count: b.customers.length });
    }
    return json({ ok: false, error: "unknown op" });
  }

  const doc = await load(store);
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").trim();
  if (id) {
    const customer = (doc.customers || []).find((c) => String(c.id) === id) || null;
    return json({ customer, ts: doc.ts });
  }
  const q = (url.searchParams.get("q") || "").trim();
  if (q) {
    const customers = searchCustomerIndex(doc.customers, q, 12);
    return json({ customers, ts: doc.ts });
  }
  return json(doc);
};
