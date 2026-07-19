// tenant_config — the white-label foundation.
//
// One record per tenant. Everything that makes the app "theirs" (branding),
// everything they're allowed to see (module toggles + plan tier), and the
// one flag that unlocks dev tooling (`internal`).
//
// GOLDEN RULE — enforced in App.jsx, restated here because this file is where
// people come looking: a disabled module is hidden from the nav AND its route
// is never registered. Hiding a nav link alone is not a gate; URLs are typed.
//
// The LE Electrical flagship is not special-cased in the app: it is simply a
// tenant whose config has every module on and `internal: true`. Its values
// live in LE_TENANT_SEED below.

import { DEFAULT_PROFILE, mergeProfile } from "./tenantProfile.js";
import { resolveProductBrand } from "../../../shared/productBrand.mjs";

/** Plan tiers, cheapest first. `crewAddon` is orthogonal — see resolveModules. */
export const PLAN_TIERS = ["free", "pro", "full"];

/**
 * Every gateable module. Keys are stable identifiers — they appear in stored
 * tenant records, so rename only with a migration.
 */
export const MODULES = [
  "invoicing",
  "estimates",
  "requisitions",
  "permits",
  "crew",
  "quickbooks",
  "documents",
  "reports",
];

export const MODULE_LABELS = {
  invoicing: "Invoicing",
  estimates: "Estimates",
  requisitions: "Requisitions (per-item %)",
  permits: "Permit / paperwork tracker",
  crew: "Crew time-clock",
  quickbooks: "QuickBooks sync",
  documents: "Document generation",
  reports: "Reports",
};

/**
 * What each tier unlocks. `crew` is deliberately false everywhere — it is a
 * paid add-on gated by `plan.crewAddon`, not by tier (see resolveModules).
 */
export const PLAN_MODULES = {
  free: {
    invoicing: true,
    estimates: true,
    requisitions: false,
    permits: false,
    crew: false,
    quickbooks: false,
    documents: false,
    reports: false,
  },
  pro: {
    invoicing: true,
    estimates: true,
    requisitions: true,
    permits: false,
    crew: false,
    quickbooks: true,
    documents: false,
    reports: true,
  },
  full: {
    invoicing: true,
    estimates: true,
    requisitions: true,
    permits: true,
    crew: false,
    quickbooks: true,
    documents: true,
    reports: true,
  },
};

/** NYC ships as the default preset pair — the permit wedge the plan is built on. */
export const NYC_AGENCY_PRESETS = [
  { id: "dob", label: "DOB" },
  { id: "coned", label: "Con Edison" },
];

/**
 * Non-NYC tenants keep the *mechanism* and swap the labels. Presets are seeded
 * at provisioning time (Batch 3) from the signup trade/region answer.
 */
export const AGENCY_PRESETS_BY_REGION = {
  nyc: NYC_AGENCY_PRESETS,
  chicago: [
    { id: "chi_dob", label: "City of Chicago DOB" },
    { id: "comed", label: "ComEd" },
  ],
  other: [],
};

/** Branding defaults for a brand-new tenant — deliberately unbranded. */
export const DEFAULT_BRANDING = {
  companyName: "",
  logoUrl: "",
  primaryColor: "#2d8a3e",
  letterheadTemplate: "default",
  supportEmail: "",
};

/**
 * A fresh tenant: Free tier, nothing internal, no agencies until they pick a
 * region. Provisioning (Batch 3) overlays company name / logo / presets.
 */
export const DEFAULT_TENANT_CONFIG = {
  tenantId: "",
  internal: false,
  plan: { tier: "free", crewAddon: false },
  branding: { ...DEFAULT_BRANDING },
  // Sparse overrides on top of the tier defaults. Absent key = use the tier.
  moduleOverrides: {},
  agencies: [],
  profile: { ...DEFAULT_PROFILE },
};

/**
 * The LE Electrical flagship, expressed as an ordinary tenant record.
 * Everything on, internal on, NYC agencies. Nothing in the app branches on
 * this id — it is data, not a code path.
 */
export const LE_TENANT_SEED = {
  tenantId: "le",
  internal: true,
  plan: { tier: "full", crewAddon: true },
  branding: {
    companyName: "BLZ Electric Inc.",
    logoUrl: "",
    primaryColor: "#2d8a3e",
    letterheadTemplate: "default",
    supportEmail: "Office@LeElectrical.us",
  },
  moduleOverrides: {},
  agencies: NYC_AGENCY_PRESETS.map((a) => ({ ...a })),
  profile: { ...DEFAULT_PROFILE },
};

/** Which tenant this build defaults to when the server has no record yet. */
const BUILD_TENANT_ID =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_TENANT) || "le";

/** The seed used when the settings endpoint returns nothing. */
export function seedTenantConfig(tenantId = BUILD_TENANT_ID) {
  if (tenantId === "le") return structuredCloneish(LE_TENANT_SEED);
  return { ...structuredCloneish(DEFAULT_TENANT_CONFIG), tenantId };
}

/** Small deep-clone that avoids depending on structuredClone in old runtimes. */
function structuredCloneish(v) {
  return JSON.parse(JSON.stringify(v));
}

function normalizePlan(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const tier = PLAN_TIERS.includes(p.tier) ? p.tier : "free";
  return { tier, crewAddon: p.crewAddon === true };
}

/**
 * Resolve the effective module map: tier defaults → crew add-on → explicit
 * per-tenant overrides → internal override.
 *
 * `internal` wins over everything and turns every module on: the LE instance
 * must never lose a feature because a tier default changed.
 */
export function resolveModules({ plan, moduleOverrides, internal } = {}) {
  const p = normalizePlan(plan);
  const base = PLAN_MODULES[p.tier] || PLAN_MODULES.free;
  const out = {};
  for (const key of MODULES) out[key] = base[key] === true;

  // Crew is an add-on, not a tier feature.
  if (p.crewAddon) out.crew = true;

  // Explicit per-tenant overrides (can enable OR disable).
  if (moduleOverrides && typeof moduleOverrides === "object") {
    for (const key of MODULES) {
      if (typeof moduleOverrides[key] === "boolean") out[key] = moduleOverrides[key];
    }
  }

  // Internal tenants get everything, unconditionally.
  if (internal === true) for (const key of MODULES) out[key] = true;

  return out;
}

/**
 * Normalize a raw stored record into the shape the app reads. Always returns a
 * complete config — callers never need to null-check nested fields.
 */
export function resolveTenantConfig(raw, { fallbackTenantId = BUILD_TENANT_ID } = {}) {
  const seed = seedTenantConfig(fallbackTenantId);
  const r = raw && typeof raw === "object" ? raw : {};

  // A record is "present" once it carries any tenant_config field. Seed values
  // are only inherited by a genuinely ABSENT record (first boot / offline).
  // Inheriting them into a malformed record would be fail-OPEN: a tenant whose
  // plan failed to parse would silently pick up the seed's tier, and on this
  // build the seed is LE — i.e. everything on. Malformed => free.
  const present =
    r.plan != null ||
    r.moduleOverrides != null ||
    r.branding != null ||
    r.agencies != null ||
    typeof r.internal === "boolean";

  const internal = typeof r.internal === "boolean" ? r.internal : !present && seed.internal === true;
  const plan = normalizePlan(present ? r.plan : seed.plan);
  const moduleOverrides =
    r.moduleOverrides && typeof r.moduleOverrides === "object" ? r.moduleOverrides : {};

  const branding = {
    ...DEFAULT_BRANDING,
    ...(seed.branding || {}),
    ...(r.branding && typeof r.branding === "object" ? r.branding : {}),
  };

  const profile = mergeProfile({ ...(seed.profile || {}), ...(r.profile || {}) });

  // Branding is the source of truth for the fields the two shapes share, so a
  // tenant editing "company name" once updates the app chrome and the PDFs.
  if (!branding.companyName) branding.companyName = profile.companyName || "";
  if (!branding.supportEmail) branding.supportEmail = profile.email || "";
  if (!branding.primaryColor) branding.primaryColor = profile.brandColor || "#2d8a3e";
  if (!branding.logoUrl && profile.logoDataUrl) branding.logoUrl = profile.logoDataUrl;

  const agencies = normalizeAgencies(
    Array.isArray(r.agencies) ? r.agencies : present ? [] : seed.agencies
  );

  // Product brand: platform defaults from shared/productBrand.mjs, optionally
  // overridden per tenant. A rename is a change in that one file (or one
  // tenant_config field) — never a sweep through the codebase.
  const product = resolveProductBrand(r.product);

  return {
    tenantId: r.tenantId || seed.tenantId || fallbackTenantId,
    internal,
    plan,
    branding,
    moduleOverrides,
    agencies,
    product,
    profile,
    modules: resolveModules({ plan, moduleOverrides, internal }),
  };
}

function normalizeAgencies(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((a) => {
      if (typeof a === "string") return { id: slug(a), label: a };
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

/** Is a module enabled for this tenant? Unknown keys are denied by default. */
export function isModuleEnabled(config, key) {
  if (!config || !config.modules) return false;
  return config.modules[key] === true;
}

/** Is this tenant an internal (LE / dev) tenant? Deny by default. */
export function isInternal(config) {
  return config?.internal === true;
}

/** The subset of the config that is safe + useful to persist back. */
export function serializeTenantConfig(config) {
  return {
    tenantId: config.tenantId,
    internal: config.internal === true,
    plan: normalizePlan(config.plan),
    branding: { ...DEFAULT_BRANDING, ...(config.branding || {}) },
    moduleOverrides: config.moduleOverrides || {},
    agencies: normalizeAgencies(config.agencies),
    product: config.product || {},
  };
}
