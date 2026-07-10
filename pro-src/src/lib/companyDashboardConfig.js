// Company dashboard widget layout — edit order, visibility, and grid span here.
// Each widget: { id, section, order, visible, cols } where cols = 1 (default) | 2 | full
// Section grids: week = 2 cols mobile / 4 desktop; performance = 1 / 3; extras = masonry 2-col

export const COMPANY_SECTIONS = {
  week: "grid grid-cols-2 lg:grid-cols-4 gap-2.5",
  month: "block",
  ar: "block",
  performance: "grid grid-cols-1 lg:grid-cols-3 gap-2.5",
  extras: "columns-1 md:columns-2 gap-2.5 [&>*]:break-inside-avoid [&>*]:mb-2.5",
};

/** Widget registry — add/remove/reorder entries to change the dashboard layout. */
export const COMPANY_WIDGETS = [
  { id: "estimates-week", section: "week", order: 1, visible: true, cols: 1 },
  { id: "invoices-week", section: "week", order: 2, visible: true, cols: 1 },
  { id: "appointments-week", section: "week", order: 3, visible: true, cols: 1 },
  { id: "collected-week", section: "week", order: 4, visible: true, cols: 1 },
  { id: "collected-month", section: "month", order: 5, visible: true, cols: "full" },
  { id: "ar-panel", section: "ar", order: 6, visible: true, cols: "full" },
  { id: "conversion", section: "performance", order: 7, visible: true, cols: 1 },
  { id: "avg-pay", section: "performance", order: 8, visible: true, cols: 1 },
  { id: "fast-payers", section: "performance", order: 9, visible: true, cols: 1 },
  { id: "top-customers", section: "extras", order: 10, visible: true, cols: 1 },
  { id: "win-trend", section: "extras", order: 11, visible: true, cols: 1 },
  { id: "avg-deal", section: "extras", order: 12, visible: true, cols: 1 },
  { id: "chase-list", section: "extras", order: 13, visible: true, cols: 1 },
  { id: "forecast", section: "extras", order: 14, visible: true, cols: 1 },
  { id: "leads-week", section: "extras", order: 15, visible: true, cols: 1 },
  { id: "revenue-mix", section: "extras", order: 16, visible: false, cols: 1 },
];

export function widgetsForSection(section) {
  return COMPANY_WIDGETS.filter((w) => w.section === section && w.visible !== false).sort(
    (a, b) => (a.order || 0) - (b.order || 0)
  );
}