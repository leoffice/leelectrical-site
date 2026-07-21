// Jobs view — search, filter chips, amount-sorted cards, customer grouping
// (clientGroup OR normalized name), and per-card quick actions.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store.jsx";
import { CustomerAvatar, GroupJobRow, PaidPill, StagePill } from "../components/JobCard.jsx";
import { progressPct } from "../lib/stages.js";

import Sheet, { Opt } from "../components/Sheet.jsx";
import DocBuilderSheet from "../components/DocBuilderSheet.jsx";
import { MarkPaidSheet, QuickSendSheet } from "../components/JobSheets.jsx";
import {
  FILTER_NAMES,
  SORT_OPTIONS,
  clientKey,
  matchesFilter,
  matchesQuery,
  sortByNextAction,
  sortCmp,
  sortJobs,
} from "../lib/stages.js";
import {
  agingStripeColor,
  customerAmountSummary,
  customerContact,
  customerNameMatches,
  fmtAmountDue,
  groupJobsByServiceAddress,
  normalizeCustomer,
  oldestOpenInvoiceAgeDays,
  openBalance,
  unknownCustomers,
  customerKeyForImport,
  boardCustomerLabel,
  PENDING_IMPORT_LS,
} from "../lib/customers.js";
import { customerSyncCardClass } from "../lib/customerSync.js";
import { needsAttentionJob } from "../lib/jobAwareness.js";
import { fmt$, parseAmount } from "../lib/format.js";
import { useNavigate } from "react-router-dom";
import {
  buildCustomerBoardGroups,
  buildQboHierarchyCtx,
  effectiveHasParentCustomer,
  subsUnderParent,
} from "../lib/customerHierarchy.js";
import { compareCustomerRecency, subscribeRecency, touchCustomer } from "../lib/customerRecency.js";
import { waitForCommandDone } from "../lib/commandWait.js";
import {
  CUSTOMER_SORTS,
  applyStableOrder,
  loadCustomerSort,
  loadCustomerView,
  partitionBalanceSearch,
  saveCustomerSort,
  saveCustomerView,
  sortCustomerRows,
} from "../lib/customerListView.js";

/** Gray subline under customer name — jobs / open invoices / invoiced / paid. */
function customerMetaLine(sum) {
  const parts = [`${sum.jobCount} job${sum.jobCount === 1 ? "" : "s"}`];
  if (sum.openInvoices > 0) {
    parts.push(sum.openInvoices === 1 ? "1 open invoice" : `${sum.openInvoices} open invoices`);
  }
  if (sum.invoiced > 0) parts.push(`${fmt$(sum.invoiced)} invoiced`);
  if (sum.paid > 0) {
    const pct = sum.invoiced > 0 ? Math.min(100, Math.round((sum.paid / sum.invoiced) * 100)) : 0;
    parts.push(`${fmt$(sum.paid)} paid${pct ? ` (${pct}%)` : ""}`);
  }
  return parts.join(" · ");
}

function singleJobMetaLine(job) {
  // Estimates never read as "invoiced" — only real invoices.
  if (!String(job?.invoiceNo || "").trim()) {
    if (job?.estimateNo) return `Est #${job.estimateNo}`;
    const total = parseAmount(job?.amount);
    return total ? `${fmt$(total)} quoted` : "";
  }
  const total = parseAmount(job.amount);
  if (!total) return "";
  if (job.paid) return `${fmt$(total)} invoiced`;
  const due = openBalance(job);
  const paid = total - due;
  if (paid > 0.01) {
    const pct = Math.min(100, Math.round((paid / total) * 100));
    return `${fmt$(total)} invoiced · ${fmt$(paid)} paid (${pct}%)`;
  }
  return `${fmt$(total)} invoiced`;
}

/** Bottom-edge tint when any job in the group needs follow-up. */
function AttentionGradient({ show }) {
  if (!show) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[10%] min-h-[0.4rem] bg-gradient-to-t from-red-200/80 via-red-100/45 to-transparent rounded-b-[inherit]"
      data-testid="needs-attention-gradient"
      aria-hidden
    />
  );
}

/** Aging stripe on the card bottom — older open balance = darker red. */
function AgingBottomStripe({ jobs }) {
  const age = oldestOpenInvoiceAgeDays(jobs);
  if (age == null) {
    return (
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-slate-200 rounded-b-[inherit]"
        data-testid="aging-stripe-zero"
        aria-hidden
      />
    );
  }
  const color = agingStripeColor(age, 1);
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 h-1 rounded-b-[inherit]"
      style={{ backgroundColor: color }}
      data-testid="aging-stripe"
      data-age-days={String(age)}
      aria-hidden
    />
  );
}

/** Expanded customer body: service addresses → open invoices → billing (tap → customer info). */
function CustomerExpandPanel({ jobs, onOpenCustomer, openInvoicesOnly = false }) {
  const contact = customerContact(jobs);
  const billing = String(contact.billingAddress || "").trim();
  const groups = groupJobsByServiceAddress(jobs);
  const openGroups = groups
    .map((g) => ({
      ...g,
      openJobs: g.jobs.filter((j) => openBalance(j) > 0),
      otherJobs: openInvoicesOnly ? [] : g.jobs.filter((j) => !(openBalance(j) > 0)),
    }))
    .filter((g) => (openInvoicesOnly ? g.openJobs.length : g.jobs.length));

  return (
    <div className="px-2.5 pb-2.5 space-y-2 bg-slate-50/60 border-t border-slate-100 pt-2" data-testid="customer-expand-panel">
      {openGroups.length ? (
        openGroups.map((g) => (
          <div key={g.address} className="space-y-1" data-testid="expand-service-block">
            <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider px-0.5">
              Service
            </div>
            <div className="text-[11px] font-semibold text-slate-700 px-0.5 leading-snug break-words">
              {g.address}
            </div>
            <div className="space-y-1">
              {g.openJobs.map((j) => (
                <GroupJobRow key={j.id} job={j} openInvoiceOnly />
              ))}
              {!openInvoicesOnly &&
                g.otherJobs.map((j) => (
                  <GroupJobRow key={j.id} job={j} />
                ))}
            </div>
          </div>
        ))
      ) : (
        <div className="text-[11px] text-slate-400 px-0.5" data-testid="expand-no-open">
          {openInvoicesOnly ? "No open invoices" : "No jobs at this address"}
        </div>
      )}
      <button
        type="button"
        className="w-full text-left rounded-xl bg-white border border-slate-200 px-3 py-2 active:bg-slate-50"
        data-testid="expand-billing-box"
        onClick={onOpenCustomer}
      >
        <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Billing address</div>
        <div className="text-[11px] font-semibold text-slate-800 mt-0.5 break-words leading-snug">
          {billing || "No billing on file — tap for customer info"}
        </div>
        <div className="text-[10px] text-brand font-semibold mt-1">Customer information ›</div>
      </button>
    </div>
  );
}

/** Short job description line — titles or invoice numbers. */
function jobTitlesHint(list, max = 3) {
  const bits = list
    .map((j) => j.title || (j.invoiceNo ? `Inv #${j.invoiceNo}` : ""))
    .filter(Boolean);
  if (!bits.length) return "";
  if (bits.length <= max) return bits.join(" · ");
  return bits.slice(0, max).join(" · ") + ` · +${bits.length - max}`;
}

/** Customer row: entire header is one tap target; optional chevron toggles inline jobs. */
function ClientListHeader({ name, amount, meta, hint, onCardClick, trailing, avatar, headless = false }) {
  const body = (
    <div className="flex items-start gap-2 min-w-0">
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="flex-1 min-w-0 text-sm font-semibold text-slate-900 break-words line-clamp-2 leading-snug max-lg:line-clamp-3 lg:text-base lg:font-bold lg:truncate"
            title={name}
            data-testid="client-group-name"
          >
            {name}
          </div>
          <div
            className="shrink-0 text-sm font-semibold text-slate-900 tabular-nums lg:font-bold lg:text-base"
            data-testid="client-group-amount"
          >
            {amount}
          </div>
        </div>
        {meta ? (
          <div
            className="text-[10px] text-slate-400 leading-snug truncate mt-0.5 lg:text-[11px]"
            data-testid="client-group-meta"
          >
            {meta}
          </div>
        ) : null}
        {hint ? (
          <div className="text-[11px] text-slate-500 leading-snug truncate mt-0.5" title={hint}>
            {hint}
          </div>
        ) : null}
      </div>
    </div>
  );
  if (headless) {
    return (
      <div className="flex items-start gap-1 min-w-0">
        <div className="flex-1 min-w-0">{body}</div>
        {trailing}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-1 min-w-0">
      <button
        type="button"
        className="flex-1 min-w-0 text-left active:opacity-90"
        onClick={onCardClick}
        data-testid="client-group-card"
      >
        {body}
      </button>
      {trailing}
    </div>
  );
}

const IDLE_COLLAPSE_MS = 10_000; // expanded customer rows fold back after ~10s idle
const PARENT_SUB_COLLAPSE_MS = 30_000; // parent + sub-company rows stay open ~30s
const SEARCH_IDLE_MS = 10_000; // clear search + collapse after ~10s without interaction

const isParentBoardKey = (key) => String(key || "").startsWith("p:");
const SORT_LS_KEY = "lepro_jobs_sort_v1"; // persisted sort-by choice

const loadSort = () => {
  try {
    const s = localStorage.getItem(SORT_LS_KEY);
    return SORT_OPTIONS.some((o) => o.key === s) ? s : "smart";
  } catch {
    return "smart";
  }
};

/** How many customer rows to paint first — rest load as you scroll (keeps open snappy). */
const LIST_PAGE = 48;

/**
 * Expanded balance card — open invoices with balance only (no estimates /
 * paid / payment history). Grouped by service address; invoice # on each row.
 * Billing box opens full customer info.
 */
function BalanceCardDetail({ row, onOpen, onInteract }) {
  return (
    <div
      data-testid="balance-card-detail"
      onPointerDown={() => onInteract?.()}
    >
      <CustomerExpandPanel
        jobs={row.jobs}
        openInvoicesOnly
        onOpenCustomer={onOpen}
      />
    </div>
  );
}

/**
 * Compact balance row — name/company left, amount due right. Tapping toggles
 * the detail open in place; it never navigates and never moves the row.
 * Expanded rows auto-fold after ~10s idle (re-armed on touch inside).
 */
function BalanceCard({ row, expanded, onToggle, onOpen, onInteract }) {
  const due = row.summary?.due || 0;
  return (
    <div className="card relative overflow-hidden" data-testid="balance-card">
      <button
        type="button"
        className="w-full px-3 py-2.5 text-left active:opacity-90"
        data-testid="balance-card-tap"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 min-w-0">
          <CustomerAvatar name={row.name} />
          <div className="min-w-0 flex-1">
            <div
              className="text-sm font-semibold text-slate-900 truncate leading-snug"
              title={row.name}
              data-testid="balance-card-name"
            >
              {row.name}
            </div>
          </div>
          {due > 0 ? (
            <div
              className="shrink-0 text-sm font-bold text-slate-900 tabular-nums"
              data-testid="balance-card-amount"
            >
              {fmt$(due)}
            </div>
          ) : null}
        </div>
      </button>
      {expanded ? (
        <BalanceCardDetail row={row} onOpen={onOpen} onInteract={onInteract} />
      ) : null}
    </div>
  );
}

/** Sort picker — pick for now, or "Set as default" to persist it per user. */
function SortSheet({ value, onPick, onSetDefault, onClose }) {
  return (
    <Sheet title="Sort customers" onClose={onClose}>
      <div className="space-y-1.5">
        {CUSTOMER_SORTS.map((o) => (
          <div
            key={o.key}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
              value === o.key ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"
            }`}
          >
            <button
              type="button"
              className="flex-1 min-w-0 text-left"
              data-testid={`sort-opt-${o.key}`}
              onClick={() => onPick(o.key)}
            >
              <div className="text-sm font-semibold text-slate-900">
                {value === o.key ? "✓ " : ""}
                {o.label}
              </div>
              <div className="text-[11px] text-slate-500">{o.note}</div>
            </button>
            <button
              type="button"
              className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 active:bg-slate-100"
              data-testid={`sort-default-${o.key}`}
              onClick={() => onSetDefault(o.key)}
            >
              Set as default
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

export default function Jobs({ embedded, collapseGroups = false, activeJobId = "" }) {
  const { jobs, loading, showToast, api, enqueue, refreshJobs, setNewJob } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("Active");
  const [sort, setSort] = useState(loadSort);
  const [view, setView] = useState(loadCustomerView); // "balance" | "all"
  const [custSort, setCustSort] = useState(loadCustomerSort);
  const [sortSheet, setSortSheet] = useState(false);
  const [expanded, setExpanded] = useState({}); // balance card key -> open in place
  const [resortNonce, setResortNonce] = useState(0); // bumped by explicit refresh
  const [open, setOpen] = useState({}); // groupKey -> expanded
  const [sheet, setSheet] = useState(null); // {kind:"paid"|"send", job}
  const [custMatches, setCustMatches] = useState([]); // #56 QBO customers not yet in the app
  const [importCust, setImportCust] = useState(null); // #56 confirm-import target
  const [qboIndex, setQboIndex] = useState([]);
  const [recencyTick, setRecencyTick] = useState(0);
  const [listLimit, setListLimit] = useState(LIST_PAGE);
  const timers = useRef({}); // groupKey -> auto-collapse timer
  const custTimer = useRef(null);
  const searchIdleTimer = useRef(null);
  const listMoreRef = useRef(null);

  const pickSort = (k) => {
    setSort(k);
    try {
      localStorage.setItem(SORT_LS_KEY, k);
    } catch {}
  };

  // Balance view spans every customer with money owed — the Active/To-Do chips
  // only apply to the All view, so internally Balance always filters as "All".
  const balanceView = view === "balance";
  const effFilter = balanceView ? "All" : filter;

  const pickView = (v) => {
    setView(v);
    saveCustomerView(v);
    setExpanded({});
  };

  /**
   * Re-sort epoch. Order is frozen inside an epoch, so tapping / expanding /
   * editing a customer can never move its row (the "jumps to top" bug). It
   * changes only on a deliberate re-sort: view, sort, search, refresh, remount.
   */
  const epoch = `${view}|${custSort}|${sort}|${effFilter}|${q.trim()}|${resortNonce}`;
  const balanceOrder = useRef({});
  const otherOrder = useRef({});
  const parentOrder = useRef({});
  const flatOrder = useRef({});

  const refreshList = useCallback(async () => {
    setExpanded({});
    setOpen({});
    await refreshJobs?.(true);
    setResortNonce((n) => n + 1);
  }, [refreshJobs]);

  useEffect(() => {
    let cancelled = false;
    api
      .searchCustomers("")
      .then((list) => {
        if (!cancelled) setQboIndex(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => subscribeRecency(() => setRecencyTick((n) => n + 1)), []);

  // Filter / search / sort change → show the top page again (recency order is already top-first).
  useEffect(() => {
    setListLimit(LIST_PAGE);
  }, [effFilter, q, sort, view, custSort]);

  const active = useMemo(() => jobs.filter((j) => !j._archived && !j._deleted), [jobs]);
  const matchesChip = useCallback(
    (j) => matchesFilter(j, effFilter) && matchesQuery(j, q),
    [effFilter, q]
  );
  const shown = useMemo(() => {
    const list = active.filter(matchesChip);
    if (effFilter === "To Do" || effFilter === "Upcoming") return sortByNextAction(list);
    return sortJobs(list, sort);
  }, [active, matchesChip, sort, effFilter]);

  // Bug #1: group ALL jobs for a customer together (paid + unpaid). The filter
  // chip only controls which *groups* appear, not whether paid siblings vanish
  // from a multi-invoice customer (e.g. izzy: $650 paid + $870 open).
  const groups = useMemo(() => {
    const map = new Map();
    for (const j of active) {
      const k = clientKey(j);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(j);
    }
    const nameToGroup = new Map(); // normalized name -> first "g:" key containing it
    const qboToGroup = new Map(); // qboCustomerId -> "q:" group key
    for (const [k, list] of map) {
      if (k.startsWith("g:")) {
        for (const j of list) {
          const n = normalizeCustomer(j.customer);
          if (n && !nameToGroup.has(n)) nameToGroup.set(n, k);
        }
      }
      if (k.startsWith("q:")) {
        qboToGroup.set(k.slice(2), k);
      }
    }
    for (const [k, list] of [...map]) {
      if (!k.startsWith("c:")) continue;
      const name = k.slice(2);
      let target = nameToGroup.get(name);
      if (!target) {
        for (const [nn, gk] of nameToGroup) {
          if (customerNameMatches({ customer: nn }, name)) {
            target = gk;
            break;
          }
        }
      }
      if (!target) {
        for (const j of list) {
          const qid = String(j.qboCustomerId || "").trim();
          if (qid && qboToGroup.has(qid)) {
            target = qboToGroup.get(qid);
            break;
          }
        }
      }
      if (!target) {
        for (const [qk, qgk] of qboToGroup) {
          const qlist = map.get(qgk) || [];
          if (qlist.some((j) => customerNameMatches(j, name) || customerNameMatches({ customer: j.personName }, name))) {
            target = qgk;
            break;
          }
        }
      }
      if (target) {
        map.set(target, sortJobs(map.get(target).concat(list), sort));
        map.delete(k);
      }
    }
    const cmp = sortCmp(sort);
    const rank = (list) => {
      const hit = list.filter(matchesChip);
      return sortJobs(hit.length ? hit : list, sort)[0];
    };
    const entries = [...map.entries()]
      .filter(([, list]) => list.some(matchesChip))
      .map(([k, list]) => [k, sortJobs(list, sort)]);
    if (effFilter === "Active") {
      return entries.sort((A, B) => compareCustomerRecency(A[0], A[1], B[0], B[1]));
    }
    return entries.sort((A, B) => cmp(rank(A[1]), rank(B[1])));
  }, [active, matchesChip, sort, effFilter, recencyTick]);

  const qboHierarchy = useMemo(() => buildQboHierarchyCtx(qboIndex), [qboIndex]);

  /** Parent companies with sub-entities — separate from flat customer groups. */
  const { parentRows, flatGroups } = useMemo(() => {
    const board = buildCustomerBoardGroups(active, (list) => sortJobs(list, sort), qboIndex);
    const parentJobIds = new Set();
    let parents = board
      .filter((r) => r.kind === "parent")
      .filter((r) => r.jobs.some(matchesChip))
      .map((r) => {
        r.jobs.forEach((j) => parentJobIds.add(j.id));
        return { ...r, subs: subsUnderParent(active, r.key, qboHierarchy).map((s) => ({ ...s, jobs: sortJobs(s.jobs, sort) })) };
      });
    let flat = groups
      .map(([k, list]) => [k, list.filter((j) => !parentJobIds.has(j.id) && !effectiveHasParentCustomer(j, qboHierarchy))])
      .filter(([, list]) => list.length && list.some(matchesChip));
    if (effFilter === "Active") {
      const parentJobs = (row) => row.jobs.concat((row.subs || []).flatMap((s) => s.jobs));
      parents = parents
        .slice()
        .sort((a, b) => compareCustomerRecency(a.key, parentJobs(a), b.key, parentJobs(b)));
      flat = flat.slice().sort((A, B) => compareCustomerRecency(A[0], A[1], B[0], B[1]));
    }
    return { parentRows: parents, flatGroups: flat };
  }, [active, groups, matchesChip, sort, qboIndex, qboHierarchy, effFilter, recencyTick]);

  /** One flat row per customer (parent companies + plain groups) for the Balance view. */
  const customerRows = useMemo(() => {
    const rows = parentRows.map((r) => ({
      key: r.key,
      name: r.name,
      jobs: r.jobs.concat((r.subs || []).flatMap((s) => s.jobs)),
      summary: r.summary,
    }));
    for (const [key, list] of flatGroups) {
      rows.push({
        key,
        name: boardCustomerLabel(list[0], list),
        jobs: list,
        summary: customerAmountSummary(list),
      });
    }
    return rows;
  }, [parentRows, flatGroups]);

  /**
   * Balance view. Sorted fresh per epoch, then frozen: `applyStableOrder` hands
   * every row the slot it had when the epoch began, so expanding a card at the
   * bottom of the list leaves it exactly where the finger landed.
   */
  const searching = !!q.trim();
  const { owing, other } = partitionBalanceSearch(sortCustomerRows(customerRows, custSort));
  const balanceRows = applyStableOrder(owing, balanceOrder.current, epoch);
  const otherRows = searching ? applyStableOrder(other, otherOrder.current, epoch) : [];

  // The All view keeps its existing grouping/markup — it just gets the same
  // frozen ordering so its rows hold still too.
  const stableParentRows = applyStableOrder(parentRows, parentOrder.current, epoch);
  const stableFlatGroups = applyStableOrder(flatGroups, flatOrder.current, epoch, (t) => t[0]);

  /** Balance-card expand — folds after ~10s idle unless touched. */
  const armBalanceCollapse = useCallback((key) => {
    const tKey = `b:${key}`;
    clearTimeout(timers.current[tKey]);
    timers.current[tKey] = setTimeout(
      () => setExpanded((o) => (o[key] ? { ...o, [key]: false } : o)),
      IDLE_COLLAPSE_MS
    );
  }, []);

  const toggleExpanded = useCallback(
    (key) => {
      setExpanded((m) => {
        const now = !m[key];
        const tKey = `b:${key}`;
        if (now) armBalanceCollapse(key);
        else clearTimeout(timers.current[tKey]);
        return { ...m, [key]: now };
      });
    },
    [armBalanceCollapse]
  );

  /** Jobs shown inside an expanded group — full customer when Active/All + no search. */
  const expandJobs = useCallback(
    (list) => {
      const showAll = (effFilter === "Active" || effFilter === "All") && !q.trim();
      return showAll ? list : list.filter(matchesChip);
    },
    [effFilter, q, matchesChip]
  );

  /** After ~10s idle with text in the search bar, clear search and collapse groups. */
  const armSearchIdle = useCallback(() => {
    clearTimeout(searchIdleTimer.current);
    if (!q.trim()) return;
    searchIdleTimer.current = setTimeout(() => {
      setQ("");
      setCustMatches([]);
      setOpen({});
      Object.values(timers.current).forEach(clearTimeout);
    }, SEARCH_IDLE_MS);
  }, [q]);

  useEffect(() => {
    armSearchIdle();
    return () => clearTimeout(searchIdleTimer.current);
  }, [armSearchIdle]);

  /* auto-collapse an expanded row after idle (default ~10s; parent subs ~30s) */
  const armCollapse = (key, idleMs = IDLE_COLLAPSE_MS) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(
      () => setOpen((o) => (o[key] ? { ...o, [key]: false } : o)),
      idleMs
    );
  };
  const toggleGroup = (key, idleMs = IDLE_COLLAPSE_MS) => {
    if (collapseGroups && !isParentBoardKey(key)) return;
    setOpen((o) => {
      const now = !o[key];
      if (now) armCollapse(key, idleMs);
      else clearTimeout(timers.current[key]);
      return { ...o, [key]: now };
    });
  };

  /** Searching a sub-company name expands its parent and shows matching subs only. */
  useEffect(() => {
    const query = q.trim();
    if (!query) return;
    for (const row of parentRows) {
      if (row.subs.length < 2) continue;
      const subHit = row.subs.some((sub) => sub.jobs.some(matchesChip));
      if (subHit) {
        setOpen((o) => (o[row.key] ? o : { ...o, [row.key]: true }));
        armCollapse(row.key, PARENT_SUB_COLLAPSE_MS);
      }
    }
  }, [q, parentRows, matchesChip]);

  const groupExpanded = (key) => (isParentBoardKey(key) || !collapseGroups) && open[key];
  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  // Progressive list: paint top rows first, grow as the sentinel nears the viewport.
  const totalListRows = balanceView
    ? balanceRows.length + otherRows.length
    : stableParentRows.length + stableFlatGroups.length;
  const visibleParentRows = stableParentRows.slice(0, listLimit);
  const flatRoom = Math.max(0, listLimit - stableParentRows.length);
  const visibleFlatGroups = stableFlatGroups.slice(0, flatRoom);
  const visibleBalanceRows = balanceRows.slice(0, listLimit);
  const otherRoom = Math.max(0, listLimit - balanceRows.length);
  const visibleOtherRows = otherRows.slice(0, otherRoom);
  useEffect(() => {
    const el = listMoreRef.current;
    if (!el || listLimit >= totalListRows) return;
    if (typeof IntersectionObserver !== "function") {
      // No IO (tests / old webview) — reveal the rest in a couple of frames.
      const t = setTimeout(() => setListLimit(totalListRows), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setListLimit((n) => Math.min(totalListRows, n + LIST_PAGE));
        }
      },
      { root: null, rootMargin: "240px 0px", threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [listLimit, totalListRows, effFilter, q, sort, view, custSort]);

  const quickSend = (job) => {
    if (!job.email) return showToast("No email on file — add one first");
    setSheet({ kind: "send", job });
  };

  // #56 — when the typed name doesn't already match the jobs on screen, also
  // search the QBO customer index. We only surface customers NOT already
  // present in the app (by normalized name), so the list stays "not here yet".
  // jobs is read via a ref so a background jobs poll doesn't re-fire the search.
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  useEffect(() => {
    clearTimeout(custTimer.current);
    const query = q.trim();
    if (query.length < 2) {
      setCustMatches([]);
      return;
    }
    custTimer.current = setTimeout(async () => {
      const list = await api.searchCustomers(query);
      setCustMatches(unknownCustomers(list, jobsRef.current));
    }, 250);
    return () => clearTimeout(custTimer.current);
  }, [q, api]);
  useEffect(() => () => clearTimeout(custTimer.current), []);

  const openCustomer = (key, jobs = []) => {
    touchCustomer(key, jobs);
    nav("/customer/" + encodeURIComponent(key));
  };

  const confirmImport = async () => {
    const c = importCust;
    if (!c) return;
    const key = c.id != null ? String(c.id) : c.name;
    const name = c.name || "";
    const qboId = c.id != null ? String(c.id) : "";
    const custKey = customerKeyForImport(c);
    const idk = "import_customer|" + key + "|" + Date.now();
    setImportCust(null);
    setQ("");
    setCustMatches([]);
    setOpen({});
    if (custKey) {
      try {
        sessionStorage.setItem(
          PENDING_IMPORT_LS,
          JSON.stringify({ key: custKey, name, qboId, started: Date.now(), idempotencyKey: idk })
        );
      } catch {}
      openCustomer(custKey);
    }
    showToast("Importing " + name + "…");
    await enqueue(
      "import_customer",
      "import-" + key,
      { name, qboId },
      "deterministic",
      idk
    );
    const testMode = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.MODE === "test";
    const wait = await waitForCommandDone(api, idk, { maxMs: testMode ? 80 : 120000, intervalMs: testMode ? 15 : 2000 });
    await refreshJobs?.(true);
    if (!wait.ok && !wait.timeout) showToast(String(wait.cmd?.error || "Import failed"));
  };

  return (
    <div className="space-y-3">
      {/*
        Add control docked in the top bar, right beside the search input, so it
        is the most prominent thing on the main screen on every viewport — the
        fix for the mobile FAB that got squeezed off to the right edge. Same
        handler and `fab-add` testid as the old floating button. When Jobs is
        embedded in a job/customer page, that page's own top bar provides the
        add control, so this copy must not render (else two `fab-add`s exist).
      */}
      <div className="flex items-center gap-2">
        <input
          className="input flex-1 min-w-0"
          type="search"
          placeholder="🔍  Search customers, jobs, addresses…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={armSearchIdle}
          onBlur={armSearchIdle}
          aria-label="Search jobs"
        />
        {!embedded ? (
          <button
            type="button"
            onClick={() => setNewJob({ step: "choose", context: null })}
            aria-label="Add"
            data-testid="fab-add"
            className="shrink-0 flex items-center gap-1.5 rounded-xl bg-slate-900 text-white text-sm font-bold px-3.5 py-2.5 shadow-sm hover:bg-slate-800 active:opacity-80"
          >
            <span className="text-lg leading-none">＋</span>
            <span className="hidden sm:inline">Add</span>
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <div
          className="flex rounded-xl bg-slate-100 p-0.5 shrink-0"
          role="group"
          aria-label="Customer view"
        >
          {[
            { key: "balance", text: "Balance", label: "Balance customers" },
            { key: "all", text: "All", label: "All customers" },
          ].map((v) => (
            <button
              key={v.key}
              type="button"
              aria-label={v.label}
              aria-pressed={view === v.key}
              data-testid={`view-${v.key}`}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-[10px] transition-colors ${
                view === v.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
              onClick={() => pickView(v.key)}
            >
              {v.text}
            </button>
          ))}
        </div>
        {balanceView ? (
          <>
            <button
              type="button"
              className="input !w-auto !py-1.5 !px-2.5 !text-xs shrink-0 text-left"
              aria-label="Sort customers"
              data-testid="sort-customers"
              onClick={() => setSortSheet(true)}
            >
              {CUSTOMER_SORTS.find((o) => o.key === custSort)?.label} ▾
            </button>
            <button
              type="button"
              className="ml-auto shrink-0 rounded-lg px-2 py-1.5 text-xs text-slate-500 active:bg-slate-100"
              aria-label="Refresh customers"
              data-testid="refresh-customers"
              onClick={refreshList}
            >
              ↻
            </button>
          </>
        ) : null}
      </div>

      {balanceView ? null : (
      <div className="flex items-center gap-2 -mx-4 px-4">
        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] flex-1 min-w-0">
          {FILTER_NAMES.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`chip ${
                filter === f ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <select
          className="input !w-auto max-w-[130px] !py-1.5 !px-2 !text-xs shrink-0 self-start"
          aria-label="Sort jobs"
          value={sort}
          onChange={(e) => pickSort(e.target.value)}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      )}

      {loading && !jobs.length ? (
        <div className="card px-4 py-8 text-center text-slate-400 text-sm">Loading jobs…</div>
      ) : !shown.length ? (
        <div className="card px-4 py-8 text-center text-slate-400 text-sm">
          <span className="block text-3xl mb-2">🗂️</span>
          No jobs match.
          <br />
          Try another filter, or hit ＋ to add a job.
        </div>
      ) : balanceView ? (
        <div className="space-y-2" data-testid="balance-list">
          {!visibleBalanceRows.length && !visibleOtherRows.length ? (
            <div className="card px-4 py-8 text-center text-slate-400 text-sm">
              <span className="block text-3xl mb-2">✅</span>
              {searching ? "No customers match." : "Nothing owed — every balance is clear."}
            </div>
          ) : null}
          {visibleBalanceRows.map((row) => (
            <BalanceCard
              key={row.key}
              row={row}
              expanded={!!expanded[row.key]}
              onToggle={() => toggleExpanded(row.key)}
              onOpen={() => openCustomer(row.key, row.jobs)}
              onInteract={() => armBalanceCollapse(row.key)}
            />
          ))}
          {visibleOtherRows.length ? (
            <div
              className="flex items-center gap-2 pt-2 pb-0.5 px-1"
              data-testid="other-customers-divider"
            >
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-[11px] font-semibold text-slate-400">Other customers</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
          ) : null}
          {visibleOtherRows.map((row) => (
            <BalanceCard
              key={row.key}
              row={row}
              expanded={!!expanded[row.key]}
              onToggle={() => toggleExpanded(row.key)}
              onOpen={() => openCustomer(row.key, row.jobs)}
              onInteract={() => armBalanceCollapse(row.key)}
            />
          ))}
          {listLimit < totalListRows ? (
            <div
              ref={listMoreRef}
              className="py-3 text-center text-xs text-slate-400"
              data-testid="jobs-list-more"
            >
              Loading more customers…
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleParentRows.map((row) => {
            const searchOn = !!q.trim();
            const visibleSubs = searchOn ? row.subs.filter((sub) => sub.jobs.some(matchesChip)) : row.subs;
            const multiSub = visibleSubs.length > 0;
            const expanded = groupExpanded(row.key);
            const needsAttention = row.jobs.some(needsAttentionJob);
            const syncCardClass = customerSyncCardClass(customerContact(row.jobs), { qboIndex });
            return (
              <div key={row.key} className={`card relative overflow-hidden ${syncCardClass}`} data-testid="parent-customer-group">
                <AttentionGradient show={needsAttention} />
                <AgingBottomStripe jobs={row.jobs} />
                <button
                  type="button"
                  className="w-full px-3 py-2.5 lg:px-4 lg:py-3 text-left active:opacity-90"
                  data-testid={multiSub ? "parent-group-card" : "client-group-card"}
                  aria-expanded={multiSub ? expanded : undefined}
                  onClick={() => {
                    if (!multiSub) {
                      openCustomer(row.key, row.jobs);
                      return;
                    }
                    if (expanded) openCustomer(row.key, row.jobs);
                    else toggleGroup(row.key, PARENT_SUB_COLLAPSE_MS);
                  }}
                >
                  <ClientListHeader
                    headless
                    name={row.name}
                    amount={fmt$(row.summary.due) || "$0"}
                    meta={customerMetaLine(row.summary) + (multiSub ? ` · ${row.subs.length} companies` : visibleSubs.length === 1 && searchOn ? ` · ${visibleSubs[0].name}` : "")}
                    hint={expanded ? "" : jobTitlesHint(row.jobs)}
                    avatar={<CustomerAvatar name={row.name} />}
                    trailing={
                      !multiSub ? null : (
                        <span
                          className="p-1 -m-1 text-slate-400 shrink-0 pointer-events-none"
                          aria-hidden
                          data-testid="parent-group-chevron"
                        >
                          <span className={`inline-block transition-transform ${expanded ? "rotate-180" : ""}`}>▾</span>
                        </span>
                      )
                    }
                  />
                </button>
                {multiSub && expanded && (
                  <div
                    className="px-2.5 pb-2.5 space-y-1.5 bg-slate-50/60 border-t border-slate-100 pt-2"
                    onPointerDown={() => armCollapse(row.key, PARENT_SUB_COLLAPSE_MS)}
                    data-testid="parent-sub-list"
                  >
                    {visibleSubs.map((sub) => {
                      const subOpen = !!open[sub.key];
                      return (
                        <div key={sub.key} className="rounded-lg bg-white border border-slate-100 overflow-hidden" data-testid="sub-customer-row">
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 active:bg-slate-50"
                            onClick={() => {
                              if (subOpen) openCustomer(sub.key, sub.jobs);
                              else toggleGroup(sub.key, PARENT_SUB_COLLAPSE_MS);
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-slate-800 truncate">{sub.name}</span>
                              <span className="text-sm font-semibold tabular-nums shrink-0 flex items-center gap-1">
                                {fmt$(sub.summary.due) || "$0"}
                                <span className={`inline-block text-slate-400 transition-transform ${subOpen ? "rotate-180" : ""}`}>▾</span>
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{customerMetaLine(sub.summary)}</div>
                          </button>
                          {subOpen ? (
                            <div onPointerDown={() => armCollapse(sub.key, PARENT_SUB_COLLAPSE_MS)}>
                              <CustomerExpandPanel
                                jobs={sub.jobs}
                                openInvoicesOnly
                                onOpenCustomer={() => openCustomer(sub.key, sub.jobs)}
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className="w-full text-left rounded-xl bg-white border border-slate-200 px-3 py-2 active:bg-slate-50"
                      data-testid="expand-billing-box"
                      onClick={() => openCustomer(row.key, row.jobs)}
                    >
                      <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Billing address</div>
                      <div className="text-[11px] font-semibold text-slate-800 mt-0.5 break-words leading-snug">
                        {String(customerContact(row.jobs).billingAddress || "").trim() ||
                          "No billing on file — tap for customer info"}
                      </div>
                      <div className="text-[10px] text-brand font-semibold mt-1">Customer information ›</div>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {visibleFlatGroups.map(([key, list]) => {
            const job = list[0];
            const customerName = boardCustomerLabel(job, list);
            const showFullGroup = (effFilter === "Active" || effFilter === "All") && !q.trim();
            const chipHits = list.filter(matchesChip);
            const displayList = showFullGroup ? list : chipHits.length ? chipHits : list;
            const sum = customerAmountSummary(showFullGroup ? list : displayList);
            const syncCardClass = customerSyncCardClass(customerContact(list));
            const needsAttention = list.some(needsAttentionJob);

            if (list.length === 1) {
              const pct = progressPct(job);
              const due = fmtAmountDue(job) || fmt$(openBalance(job)) || "—";
              const title = job.title || "(untitled job)";
              const goCustomer = () => openCustomer(key, list);
              return (
                <button
                  key={key}
                  type="button"
                  className={`card relative overflow-hidden w-full text-left active:opacity-90 ${syncCardClass} ${embedded ? "px-2.5 py-2" : "px-3 py-2.5 lg:px-4 lg:py-3"}`}
                  data-testid="client-single"
                  onClick={goCustomer}
                >
                  <AttentionGradient show={needsAttention} />
                  <AgingBottomStripe jobs={list} />
                  <ClientListHeader
                    headless
                    name={customerName}
                    amount={due}
                    meta={singleJobMetaLine(job)}
                    hint={title}
                    avatar={<CustomerAvatar name={customerName} />}
                  />
                  {!embedded && (
                    <>
                      <div className="mt-1.5 flex items-center gap-1 flex-wrap pl-9 pointer-events-none">
                        <StagePill job={job} />
                        <PaidPill job={job} />
                      </div>
                      <div className="mt-1.5 h-1 rounded-full bg-slate-100 overflow-hidden ml-9 pointer-events-none">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand to-accent"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </>
                  )}
                </button>
              );
            }

            return (
              <div key={key} className={`card relative overflow-hidden ${syncCardClass}`} data-testid="client-group">
                <AttentionGradient show={needsAttention} />
                <AgingBottomStripe jobs={list} />
                <div className={`w-full px-3 py-2.5 ${embedded ? "" : "lg:px-4 lg:py-3"}`}>
                  <ClientListHeader
                    name={customerName}
                    amount={fmt$(sum.due) || "$0"}
                    meta={customerMetaLine(sum)}
                    hint={groupExpanded(key) ? "" : jobTitlesHint(displayList)}
                    onCardClick={() => openCustomer(key, list)}
                    avatar={<CustomerAvatar name={customerName} />}
                    trailing={
                      collapseGroups ? null : (
                        <button
                          type="button"
                          className="p-1 -m-1 text-slate-400 shrink-0"
                          aria-label={groupExpanded(key) ? "Collapse" : "Expand"}
                          data-testid="client-group-toggle"
                          onClick={() => toggleGroup(key)}
                        >
                          <span className={`inline-block transition-transform ${groupExpanded(key) ? "rotate-180" : ""}`}>▾</span>
                        </button>
                      )
                    }
                  />
                </div>
                {groupExpanded(key) && (
                  <div onPointerDown={() => armCollapse(key)}>
                    <CustomerExpandPanel
                      jobs={expandJobs(list)}
                      openInvoicesOnly
                      onOpenCustomer={() => openCustomer(key, list)}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {listLimit < totalListRows ? (
            <div
              ref={listMoreRef}
              className="py-3 text-center text-xs text-slate-400"
              data-testid="jobs-list-more"
            >
              Loading more customers…
            </div>
          ) : null}
        </div>
      )}
      {/* #56 — customers on file not yet on the board. Tap → import + open invoices. */}
      {q.trim().length >= 2 && custMatches.length > 0 && (
        <div className="pt-1" data-testid="qbo-customer-matches">
          <div className="px-1 pb-1.5 text-xs font-bold text-slate-500">
            Import customer
          </div>
          <div className="card overflow-hidden divide-y divide-slate-100">
            {custMatches.map((c) => (
              <button
                key={c.id ?? c.name}
                type="button"
                data-testid="qbo-customer-match"
                className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50"
                onClick={() => setImportCust(c)}
              >
                <CustomerAvatar name={c.name} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900 leading-snug line-clamp-2 break-words lg:text-base lg:font-bold">
                    {c.name}
                  </span>
                  <span className="block text-[11px] text-slate-500 lg:text-xs">
                    Tap to import · open invoices become jobs
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!embedded && (
        <div className="text-center text-xs text-slate-400 pt-1">
          {shown.length} of {active.length} jobs
        </div>
      )}

      {sortSheet && (
        <SortSheet
          value={custSort}
          onPick={(k) => {
            setCustSort(k);
            setSortSheet(false);
          }}
          onSetDefault={(k) => {
            setCustSort(k);
            saveCustomerSort(k);
            setSortSheet(false);
            showToast("Default sort: " + CUSTOMER_SORTS.find((o) => o.key === k)?.label);
          }}
          onClose={() => setSortSheet(false)}
        />
      )}

      {sheet?.kind === "paid" && <MarkPaidSheet job={sheet.job} onClose={() => setSheet(null)} />}
      {sheet?.kind === "send" && (
        <QuickSendSheet
          job={sheet.job}
          onClose={() => setSheet(null)}
          onEdit={() =>
            setSheet({ kind: "docBuild", docKind: "invoice", mode: "edit", job: sheet.job })
          }
        />
      )}
      {sheet?.kind === "docBuild" && sheet.job ? (
        <DocBuilderSheet
          job={sheet.job}
          kind={sheet.docKind}
          mode={sheet.mode || "edit"}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {importCust && (
        <Sheet title="Import customer?" onClose={() => setImportCust(null)}>
          <p className="text-sm text-slate-600 mb-4 px-0.5" data-testid="import-prompt">
            Import <b className="text-slate-900">{importCust.name}</b> with all their open invoices as
            jobs?
          </p>
          <Opt
            icon="📥"
            title="Yes, import customer + open invoices"
            note="Creates the customer and a job per open invoice"
            onClick={confirmImport}
          />
          <Opt icon="✕" title="Cancel" onClick={() => setImportCust(null)} />
        </Sheet>
      )}
    </div>
  );
}
