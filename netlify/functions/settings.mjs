import { getStore } from "./lib/storage/index.mjs";
import { rotateJsonBackup } from "./blob-backup.mjs";

/**
 * Tenant / white-label settings for LE Pro.
 * GET  -> { profile, features, tenant, updatedAt, ts }
 * POST -> { op:"set", profile?, features?, tenant? } | full document merge
 *
 * `tenant` is the tenant_config record (branding / plan tier / module
 * overrides / agency presets). See pro-src/src/lib/tenantConfig.js.
 *
 * SECURITY: `tenant.internal` is server-authoritative and is stripped from
 * every client payload — it unlocks dev tooling, so a tenant must never be
 * able to grant it to themselves by POSTing it. It comes from the
 * TENANT_INTERNAL env var alone.
 */
const KEY = "tenant-settings-v1";

const TENANT_ID = process.env.TENANT_ID || "le";

/**
 * Internal defaults TRUE only for the LE flagship deployment ('le'), so the
 * live instance keeps its Build tab. Any other tenant id is false unless
 * TENANT_INTERNAL is explicitly "1".
 */
const TENANT_INTERNAL =
  process.env.TENANT_INTERNAL != null
    ? process.env.TENANT_INTERNAL === "1" || process.env.TENANT_INTERNAL === "true"
    : TENANT_ID === "le";

const PLAN_TIERS = ["free", "pro", "full"];
const MODULE_KEYS = [
  "invoicing",
  "estimates",
  "requisitions",
  "permits",
  "crew",
  "quickbooks",
  "documents",
  "reports",
];

const NYC_AGENCIES = [
  { id: "dob", label: "DOB" },
  { id: "coned", label: "Con Edison" },
];

const DEFAULT_TENANT = {
  tenantId: TENANT_ID,
  internal: TENANT_INTERNAL,
  plan: { tier: TENANT_ID === "le" ? "full" : "free", crewAddon: TENANT_ID === "le" },
  branding: {
    companyName: "",
    logoUrl: "",
    primaryColor: "#2d8a3e",
    letterheadTemplate: "default",
    supportEmail: "",
  },
  moduleOverrides: {},
  agencies: TENANT_ID === "le" ? NYC_AGENCIES : [],
};

const DEFAULT_PROFILE = {
  companyName: "BLZ Electric Inc.",
  license: "Lic #11212",
  street: "383 Kingston Ave",
  cityStateZip: "Brooklyn, NY 11213",
  phone: "(718) 594-1850",
  email: "Office@LeElectrical.us",
  brandColor: "#2d8a3e",
  logoDataUrl: "",
  paymentMethods: { card: true, zelle: true, check: true },
  zelleInstructions: "Zelle: Send payment to Office@LeElectrical.us.",
  checkInstructions:
    'Check: Make checks payable to "BLZ Electric Inc." and either mail it or email a clear picture to Office@LeElectrical.us.',
  payLinkBase: "https://secure.cardknox.com/blzelectric",
  emailFrom: "payments@leelectrical.us",
  defaultTerms: "Net 30",
  taxRate: 0,
  invoiceStart: "",
  estimateStart: "",
  calendarAccount: "office@leelectrical.us",
};

const DEFAULT_FEATURES = {
  requisitions: true,
  timeTracking: true,
  changeOrders: true,
  estimates: true,
  statements: true,
  letterhead: true,
  quickbooks: true,
  calendar: true,
  reminders: true,
  progressDashboard: true,
  subCompanies: true,
  paymentCard: true,
  paymentZelle: true,
  paymentCheck: true,
  aiFeatures: true,
  speechToText: true,
};

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

function normalizeProfile(raw) {
  const p = { ...DEFAULT_PROFILE, ...(raw && typeof raw === "object" ? raw : {}) };
  p.paymentMethods = {
    ...DEFAULT_PROFILE.paymentMethods,
    ...(p.paymentMethods && typeof p.paymentMethods === "object" ? p.paymentMethods : {}),
  };
  return p;
}

function normalizeFeatures(raw) {
  return { ...DEFAULT_FEATURES, ...(raw && typeof raw === "object" ? raw : {}) };
}

function normalizeAgencies(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => {
      if (typeof a === "string" && a.trim()) {
        return { id: slug(a), label: a.trim() };
      }
      if (a && typeof a === "object" && (a.label || a.id)) {
        const label = String(a.label || a.id);
        return { id: String(a.id || slug(label)), label };
      }
      return null;
    })
    .filter(Boolean);
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Normalize a stored/incoming tenant_config. `internal` is ALWAYS taken from
 * the environment, never from `raw` — see the security note at the top.
 */
function normalizeTenant(raw) {
  const t = raw && typeof raw === "object" ? raw : {};
  const plan = t.plan && typeof t.plan === "object" ? t.plan : {};

  const overrides = {};
  if (t.moduleOverrides && typeof t.moduleOverrides === "object") {
    for (const k of MODULE_KEYS) {
      if (typeof t.moduleOverrides[k] === "boolean") overrides[k] = t.moduleOverrides[k];
    }
  }

  return {
    tenantId: TENANT_ID,
    internal: TENANT_INTERNAL, // server-authoritative — client value discarded
    plan: {
      tier: PLAN_TIERS.includes(plan.tier) ? plan.tier : DEFAULT_TENANT.plan.tier,
      crewAddon:
        typeof plan.crewAddon === "boolean" ? plan.crewAddon : DEFAULT_TENANT.plan.crewAddon,
    },
    branding: { ...DEFAULT_TENANT.branding, ...(t.branding && typeof t.branding === "object" ? t.branding : {}) },
    moduleOverrides: overrides,
    agencies: Array.isArray(t.agencies) ? normalizeAgencies(t.agencies) : DEFAULT_TENANT.agencies,
  };
}

async function load(store) {
  const cur = (await store.get(KEY, { type: "json", consistency: "strong" })) || {};
  return {
    profile: normalizeProfile(cur.profile),
    features: normalizeFeatures(cur.features),
    tenant: normalizeTenant(cur.tenant),
    updatedAt: cur.updatedAt || 0,
    ts: cur.ts || 0,
  };
}

export default async (req) => {
  const store = getStore("settings");
  if (req.method === "OPTIONS") return json({ ok: true });

  if (req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const cur = await load(store);
    const next = {
      profile: normalizeProfile(body.profile != null ? body.profile : cur.profile),
      features: normalizeFeatures(body.features != null ? body.features : cur.features),
      tenant: normalizeTenant(body.tenant != null ? body.tenant : cur.tenant),
      updatedAt: Date.now(),
      ts: Date.now(),
    };
    await rotateJsonBackup(store, KEY, next);
    return json({ ok: true, ...next });
  }

  return json(await load(store));
};

export { DEFAULT_PROFILE, DEFAULT_FEATURES, DEFAULT_TENANT, normalizeTenant };
