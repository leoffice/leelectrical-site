// Customer-list view model — Balance/All view, the sort picker, and the
// stability rule that fixes the "customer jumps to top" bug.
//
// The list is ordered ONCE per "epoch". An epoch is a deliberate re-sort:
// switching view, changing sort, editing the search box, a pull-to-refresh, or
// remounting the screen. Everything else the user does (tapping a card,
// expanding it, editing a customer, a background recency touch) leaves the
// order alone — rows keep the slot they were assigned when the epoch began.

import { normalizeCustomer } from "./customers.js";
import { compareCustomerRecency } from "./customerRecency.js";

export const VIEW_LS_KEY = "lepro_cust_view_v1"; // "balance" | "all"
export const CUST_SORT_LS_KEY = "lepro_cust_sort_v1"; // default sort, user-settable

export const CUSTOMER_VIEWS = ["balance", "all"];

/** Sort picker options. `balance` is the factory default; any can be made the user default. */
export const CUSTOMER_SORTS = [
  { key: "balance", label: "Balance amount", note: "Highest owed first" },
  { key: "az", label: "A–Z", note: "By name or company" },
  { key: "recent", label: "Recent", note: "Last modified first" },
];

export const isCustomerSort = (k) => CUSTOMER_SORTS.some((o) => o.key === k);

const read = (key, fallback, ok) => {
  try {
    const v = localStorage.getItem(key);
    return ok(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

/** Persisted default view (factory: Balance). */
export const loadCustomerView = () =>
  read(VIEW_LS_KEY, "balance", (v) => CUSTOMER_VIEWS.includes(v));

/** Persisted default sort (factory: Balance amount). */
export const loadCustomerSort = () => read(CUST_SORT_LS_KEY, "balance", isCustomerSort);

export function saveCustomerView(view) {
  try {
    if (CUSTOMER_VIEWS.includes(view)) localStorage.setItem(VIEW_LS_KEY, view);
  } catch {}
}

/** "Set as default" — the list opens to this sort next time. */
export function saveCustomerSort(sort) {
  try {
    if (isCustomerSort(sort)) localStorage.setItem(CUST_SORT_LS_KEY, sort);
  } catch {}
}

/** A–Z key: case-insensitive, blank names sort last. */
export function azKey(row) {
  const n = normalizeCustomer(row?.name || "");
  return n || "￿"; // blanks to the end
}

/** Comparator for a customer-row sort key. Rows: {key, name, jobs, summary}. */
export function customerRowCmp(sort) {
  if (sort === "az") return (a, b) => azKey(a).localeCompare(azKey(b));
  if (sort === "recent") return (a, b) => compareCustomerRecency(a.key, a.jobs, b.key, b.jobs);
  // balance — biggest open balance first, then A–Z so equal amounts are stable
  return (a, b) => (b.summary?.due || 0) - (a.summary?.due || 0) || azKey(a).localeCompare(azKey(b));
}

export const sortCustomerRows = (rows, sort) => rows.slice().sort(customerRowCmp(sort));

/** Rows with money actually owed — the Balance view's population. */
export const hasOpenBalance = (row) => (row?.summary?.due || 0) > 0;

/**
 * Freeze row order for the life of an epoch.
 *
 * Each key is assigned a slot the first time it is seen during the epoch, in
 * the order the freshly-sorted list presented it. Later renders reuse that
 * slot, so a row can never move because of a recency touch or a re-render.
 * Genuinely new customers append at the end rather than shuffling the list.
 *
 * `state` is a caller-owned mutable box ({epoch, slots, next}) — normally a ref.
 */
export function applyStableOrder(rows, state, epoch, keyOf = (r) => r.key) {
  if (!state) return rows;
  if (state.epoch !== epoch) {
    state.epoch = epoch;
    state.slots = new Map();
    state.next = 0;
  }
  const slots = state.slots || (state.slots = new Map());
  for (const r of rows) {
    const k = keyOf(r);
    if (!slots.has(k)) slots.set(k, state.next++);
  }
  return rows.slice().sort((a, b) => slots.get(keyOf(a)) - slots.get(keyOf(b)));
}

/**
 * Balance-view search split: rows that owe money first, then everyone else
 * under an "Other customers" divider. In All view the caller uses a flat list.
 */
export function partitionBalanceSearch(rows) {
  const owing = [];
  const other = [];
  for (const r of rows) (hasOpenBalance(r) ? owing : other).push(r);
  return { owing, other };
}
