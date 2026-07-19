// Project requisition seed data + helpers.

import { customerKeyForName, customerContact, normalizeCustomer } from "./customers.js";
import { baseContractItems, sumItemValues } from "./requisitionCalc.js";
import { activeTenantConfig, onTenantConfigChange } from "./tenantBranding.js";
import { isInternal } from "./tenantConfig.js";
import { DEFAULT_PROFILE } from "./tenantProfile.js";

/* ------------------------------------------------------------------ *
 * LE-SPECIFIC SAMPLE DATA — INTERNAL TENANT ONLY
 *
 * The Joy Construction / Baez Place constants below are REAL customer and
 * project data belonging to LE Electrical, not generic demo fixtures. They
 * predate multi-tenancy, when this app had exactly one tenant and the pilot
 * project could safely be a hard-coded seed.
 *
 * They must never reach another tenant: shipping them would put one
 * customer's GC name, jobsite address and contract structure into a
 * stranger's account. Every entry point that SEEDS or MATCHES this data is
 * therefore gated on `internal === true` (see seedBaezProject, findBaezJob
 * and projectCustomerContact). The LE tenant is internal, so those gates are
 * no-ops there and the live Baez requisition ledger is untouched.
 *
 * The constants themselves stay exported at their literal values because
 * views/Projects.jsx and views/JobDetail.jsx import them for the customer-hub
 * heading and the pilot route. Gating the entry points is what keeps the data
 * from being written; the strings alone are inert.
 *
 * PROPER FIX (Batch 3): a new tenant's first project should come from the
 * provisioning flow seeding tenant-owned data, not from a constant in a
 * library module. When that lands, this whole block can be deleted.
 * ------------------------------------------------------------------ */
export const JOY_CONSTRUCTION_NAME = "Joy Construction";
export const JOY_GC_LABEL = "JOY CONSTRUCTION CORP.";
export const BAEZ_PROJECT_ID = "proj-baez-place";
export const BAEZ_ADDRESS = "334 East 176th Street, Bronx NY";

/** True when this tenant may seed/match the LE pilot data above. */
function internalTenant() {
  return isInternal(activeTenantConfig());
}

/**
 * Default contractor name on requisitions (FROM / CONTRACTOR lines).
 *
 * A live ESM binding, not a frozen literal: requisitionPdf.js, requisitionExcel.js
 * and views/Projects.jsx import it as a plain string (one compares it with !==,
 * so a String wrapper or getter would silently break identity), and importers
 * see the updated binding. Kept current by the subscription below rather than
 * lazily — an importer that read it before any function in this module had run
 * would otherwise get the build seed. Prefer reqCompanyName() in new code.
 */
export let DEFAULT_REQ_COMPANY_NAME = DEFAULT_PROFILE.requisition.companyName;

// Refresh the live binding whenever tenant_config changes, so its value never
// depends on whether some other read path happened to run first.
onTenantConfigChange(() => {
  DEFAULT_REQ_COMPANY_NAME = reqProfile().companyName || "";
});

/**
 * The tenant's requisition branding block, read LIVE on every call.
 *
 * Capturing this at import time would freeze it to the build seed, because
 * TenantProvider publishes the real config asynchronously after boot.
 */
function reqProfile() {
  const raw = activeTenantConfig()?.profile?.requisition;
  const merged =
    raw && typeof raw === "object"
      ? { ...DEFAULT_PROFILE.requisition, ...raw }
      : { ...DEFAULT_PROFILE.requisition };
  DEFAULT_REQ_COMPANY_NAME = merged.companyName || "";
  return merged;
}

/** Contractor name for this tenant's requisitions. */
export function reqCompanyName() {
  return reqProfile().companyName || "";
}

/**
 * Billing block under the logo on printed requisitions, from tenant_config.
 *
 * Getters, not values: PDF/Excel builders and the Projects view read these
 * properties at render time, and each read must reflect the tenant whose
 * config is live — this is no longer a fixed LE address.
 *
 * Kept deliberately separate from the invoice header block: LE's requisitions
 * go out under a different trading name, suite and mailbox (see
 * tenantProfile.js). Do not collapse them onto profile.companyName/street/phone.
 *
 * Print order: company (bold) → street → suite → city → phone + email on one line.
 */
export const REQ_BILLING = {
  get addressLines() {
    return reqProfile().addressLines || [];
  },
  get phone() {
    return reqProfile().phone || "";
  },
  get email() {
    return reqProfile().email || "";
  },
};

/** Contractor name shown on G702 FROM (Contractor) and CONTRACTOR signature. */
export function projectCompanyName(project, override) {
  const fromOverride = override != null ? String(override).trim() : "";
  if (fromOverride) return fromOverride;
  const fromProject = String(project?.companyName || "").trim();
  if (fromProject) return fromProject;
  return reqCompanyName();
}

/** Route key for the Joy Construction customer hub. */
export function joyCustomerKey() {
  return customerKeyForName(JOY_CONSTRUCTION_NAME);
}

/**
 * Match the Baez Place job from the jobs list (address, title, or GC name).
 *
 * INTERNAL ONLY — the "176" / "bae" / "joy" needles are LE's real jobsite and
 * GC. On another tenant they would silently mis-link an unrelated job that
 * happens to contain those substrings, so match nothing at all.
 */
export function findBaezJob(jobs) {
  if (!internalTenant()) return null;
  const active = (jobs || []).filter((j) => j && !j._archived && !j._deleted);
  const addrNeedle = "176";
  for (const j of active) {
    const hay = [j.title, j.customer, j.businessName, j.serviceAddress, j.address]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (hay.includes("bae") || hay.includes(addrNeedle)) return j;
  }
  for (const j of active) {
    const gc = normalizeCustomer(j.gc || j.generalContractor || "");
    if (gc.includes("joy")) return j;
  }
  return null;
}

/**
 * Contact card fields — prefer the linked job, else the project's own fields.
 *
 * The Joy / Baez literals are only used as a fallback for the internal tenant
 * (LE's pilot project predates the project record carrying its own gc/address).
 * Other tenants fall back to their project data, or to blanks.
 */
/**
 * Heading name for the requisition hub.
 *
 * The internal tenant keeps the title-cased pilot label so LE's live hub is
 * unchanged (its persisted project records predate a customerName field, and
 * project.gc is the uppercase "…CORP." form). Every other tenant reads their
 * own project record and never sees LE's customer.
 */
export function projectDisplayName(project) {
  if (project?.customerName) return project.customerName;
  if (internalTenant()) return JOY_CONSTRUCTION_NAME;
  return project?.gc || "";
}

export function projectCustomerContact(project, linkedJob) {
  if (linkedJob) return customerContact([linkedJob]);
  const internal = internalTenant();
  return {
    name: internal ? JOY_CONSTRUCTION_NAME : project?.gc || "",
    businessName: project?.gc || (internal ? JOY_GC_LABEL : ""),
    personName: "",
    phone: "",
    email: "",
    billingAddress: "",
    apartment: "",
    address: project?.address || (internal ? BAEZ_ADDRESS : ""),
    qboCustomerId: "",
  };
}

/** Ensure pilot project has requisition + drive fields. */
export function ensureProjectDefaults(project) {
  if (!project) return project;
  const enabled =
    project.requisitionEnabled ??
    (project.id === BAEZ_PROJECT_ID && (project.items?.length > 0));
  return {
    driveLinks: [],
    jobId: "",
    // Joy is LE's pilot customer — only default other tenants' projects to it
    // when we are the internal tenant.
    customerKey: internalTenant() ? joyCustomerKey() : "",
    ...project,
    requisitionEnabled: !!enabled,
    driveLinks: project.driveLinks || [],
  };
}

/**
 * First-boot project seed — INTERNAL ONLY. Returns null for other tenants.
 *
 * ASYNC ON PURPOSE. The schedule of values in ../data/baezSovItems.js is LE's
 * real contract: line descriptions and dollar values down to the cent. A static
 * import puts all 14KB of it in the main bundle, where any tenant can read it
 * out of devtools — gating the seed only stops it being WRITTEN, not shipped.
 * Importing it dynamically makes Rollup emit it as its own chunk that is
 * fetched only when this function actually runs.
 *
 * The internal check therefore has to come BEFORE the await: an early return
 * means a non-internal tenant never even requests the chunk.
 */
export async function seedBaezProject() {
  if (!internalTenant()) return null;
  const { BAEZ_SOV_ITEMS } = await import("../data/baezSovItems.js");
  // Progress SOV = base contract lines only. CO1–CO8 on the raw Drive sheet are
  // mistakes — not on the schedule and never calculated (Levi 2026-07-16).
  // Electric Service Equipment (item-1) is the only retainage-exempt line.
  const baseItems = baseContractItems(BAEZ_SOV_ITEMS);
  const baseContract = sumItemValues(baseItems);
  return ensureProjectDefaults({
    id: BAEZ_PROJECT_ID,
    name: "Baez Place",
    address: BAEZ_ADDRESS,
    companyName: reqCompanyName(),
    contractor: reqCompanyName(),
    gc: JOY_GC_LABEL,
    customerKey: joyCustomerKey(),
    contractSum: baseContract,
    retainagePct: 10,
    changeOrders: 0,
    changeOrderList: [],
    items: baseItems.map((it) => ({
      ...it,
      retainageExempt: it.id === "item-1" || it.retainageExempt === true,
    })),
    requisitions: [],
    requisitionEnabled: true,
    driveLinks: [],
    jobId: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export function normalizeProjects(raw) {
  if (!raw || typeof raw !== "object") return { list: [] };
  const list = Array.isArray(raw.list) ? raw.list : [];
  return { list };
}

export function findProject(projects, id) {
  return (projects?.list || []).find((p) => p.id === id) || null;
}

export function upsertProject(projects, project) {
  const list = [...(projects?.list || [])];
  const idx = list.findIndex((p) => p.id === project.id);
  const next = { ...project, updatedAt: Date.now() };
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  return { list };
}

/** Format money to the cent (Levi 2026-07-16 — requisition paid-so-far / due must show cents). */
export function fmtUsd(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}