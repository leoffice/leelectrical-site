import { getStore } from "./lib/storage/index.mjs";
import { rotateJsonBackup } from "./blob-backup.mjs";

/**
 * Tenant / white-label settings for LE Pro.
 * GET  -> { profile, features, updatedAt, ts }
 * POST -> { op:"set", profile?, features? } | full document merge
 */
const KEY = "tenant-settings-v1";

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

async function load(store) {
  const cur = (await store.get(KEY, { type: "json", consistency: "strong" })) || {};
  return {
    profile: normalizeProfile(cur.profile),
    features: normalizeFeatures(cur.features),
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
      updatedAt: Date.now(),
      ts: Date.now(),
    };
    await rotateJsonBackup(store, KEY, next);
    return json({ ok: true, ...next });
  }

  return json(await load(store));
};

export { DEFAULT_PROFILE, DEFAULT_FEATURES };
