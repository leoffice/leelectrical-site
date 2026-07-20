// Company dashboard (Reports) layout — edit order, visibility, and grid span here.
//
// WHITE-LABEL: a tenant's Reports tab is trimmed to the five things a
// contractor actually reads —
//   revenue · outstanding invoices (A/R aging) · job pipeline ·
//   requisition % complete · payments collected
// — and nothing else. The deeper analytics (conversion funnels, win-rate
// trends, fastest-payer leaderboards, forecasts) are LE's own operating
// instruments, not a product feature we support for tenants; they stay behind
// `internal` rather than being deleted, so the flagship keeps everything.
//
// Each widget: { id, section, order, visible, cols, internal?, module? }
//   internal — LE only (tenant_config.internal)
//   module   — requires tenant_config.modules[key]
//
// Grids are MOBILE-FIRST: single column by default so every card stays
// legible on a phone, widening only at sm/lg. Reports is read on a truck seat.

import { isInternal, isModuleEnabled } from "./tenantConfig.js";

export const COMPANY_SECTIONS = {
  // These are small single-number tiles — 2-up stays scannable on a phone,
  // whereas one-per-row turns the top of the page into a long column of
  // mostly-empty cards you must scroll past to reach the real reports.
  week: "grid grid-cols-2 lg:grid-cols-4 gap-2.5",
  month: "block",
  ar: "block",
  pipeline: "block",
  requisitions: "block",
  performance: "grid grid-cols-1 lg:grid-cols-3 gap-2.5",
  extras: "columns-1 md:columns-2 gap-2.5 [&>*]:break-inside-avoid [&>*]:mb-2.5",
};

/**
 * Section headings, in render order. `module`/`internal` gate the whole
 * section — a heading with no visible widgets under it is just noise.
 */
export const SECTION_ORDER = [
  { key: "week", title: "This week", subtitle: "vs last week" },
  { key: "month", title: "Payments collected", subtitle: "month to date" },
  { key: "ar", title: "Outstanding invoices", subtitle: "tap any row for detail" },
  { key: "pipeline", title: "Job pipeline", subtitle: "where open work is sitting" },
  { key: "requisitions", title: "Requisitions", subtitle: "% complete by project", module: "requisitions" },
  { key: "performance", title: "Performance analytics", internal: true },
  { key: "extras", title: "More insights", internal: true },
];

/** Widget registry — add/remove/reorder entries to change the dashboard. */
export const COMPANY_WIDGETS = [
  // — Revenue in / out, the top-line numbers —
  { id: "estimates-week", section: "week", order: 1, visible: true, cols: 1 },
  { id: "invoices-week", section: "week", order: 2, visible: true, cols: 1 },
  { id: "collected-week", section: "week", order: 3, visible: true, cols: 1 },
  // Appointments booked is a scheduling stat, not a money report.
  { id: "appointments-week", section: "week", order: 4, visible: true, cols: 1, internal: true },

  { id: "collected-month", section: "month", order: 5, visible: true, cols: "full" },

  // — Outstanding invoices: aging buckets, then who to chase —
  { id: "ar-panel", section: "ar", order: 6, visible: true, cols: "full" },
  { id: "chase-list", section: "ar", order: 7, visible: true, cols: "full" },

  // — Job pipeline —
  { id: "pipeline-panel", section: "pipeline", order: 8, visible: true, cols: "full" },

  // — Requisition % complete (the differentiator; keep it prominent) —
  { id: "requisition-progress", section: "requisitions", order: 9, visible: true, cols: "full", module: "requisitions" },

  // — LE-only analytics —
  { id: "conversion", section: "performance", order: 10, visible: true, cols: 1, internal: true },
  { id: "avg-pay", section: "performance", order: 11, visible: true, cols: 1, internal: true },
  { id: "fast-payers", section: "performance", order: 12, visible: true, cols: 1, internal: true },
  { id: "top-customers", section: "extras", order: 13, visible: true, cols: 1, internal: true },
  { id: "win-trend", section: "extras", order: 14, visible: true, cols: 1, internal: true },
  { id: "avg-deal", section: "extras", order: 15, visible: true, cols: 1, internal: true },
  { id: "forecast", section: "extras", order: 16, visible: true, cols: 1, internal: true },
  { id: "leads-week", section: "extras", order: 17, visible: true, cols: 1, internal: true },
  { id: "revenue-mix", section: "extras", order: 18, visible: false, cols: 1, internal: true },
];

/** Is this entry (widget or section) allowed for the tenant? */
export function isEntryAllowed(entry, config) {
  if (entry.internal && !isInternal(config)) return false;
  if (entry.module && !isModuleEnabled(config, entry.module)) return false;
  return true;
}

export function widgetsForSection(section, config) {
  return COMPANY_WIDGETS.filter(
    (w) => w.section === section && w.visible !== false && isEntryAllowed(w, config)
  ).sort((a, b) => (a.order || 0) - (b.order || 0));
}

/** Sections with at least one visible widget for this tenant, in order. */
export function sectionsForTenant(config) {
  return SECTION_ORDER.filter(
    (s) => isEntryAllowed(s, config) && widgetsForSection(s.key, config).length > 0
  );
}
