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
  customerAmountSummary,
  customerContact,
  customerNameMatches,
  fmtAmountDue,
  normalizeCustomer,
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
import { buildCustomerBoardGroups, hasParentCustomer, parentBoardKey, subsUnderParent } from "../lib/customerHierarchy.js";

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
  if (headless) return body;
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
const SEARCH_IDLE_MS = 10_000; // clear search + collapse after ~10s without interaction
const SORT_LS_KEY = "lepro_jobs_sort_v1"; // persisted sort-by choice

const loadSort = () => {
  try {
    const s = localStorage.getItem(SORT_LS_KEY);
    return SORT_OPTIONS.some((o) => o.key === s) ? s : "smart";
  } catch {
    return "smart";
  }
};

export default function Jobs({ embedded, collapseGroups = false, activeJobId = "" }) {
  const { jobs, loading, showToast, api, enqueue, refreshJobs } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("Active");
  const [sort, setSort] = useState(loadSort);
  const [open, setOpen] = useState({}); // groupKey -> expanded
  const [sheet, setSheet] = useState(null); // {kind:"paid"|"send", job}
  const [custMatches, setCustMatches] = useState([]); // #56 QBO customers not yet in the app
  const [importCust, setImportCust] = useState(null); // #56 confirm-import target
  const timers = useRef({}); // groupKey -> auto-collapse timer
  const custTimer = useRef(null);
  const searchIdleTimer = useRef(null);

  const pickSort = (k) => {
    setSort(k);
    try {
      localStorage.setItem(SORT_LS_KEY, k);
    } catch {}
  };

  const active = useMemo(() => jobs.filter((j) => !j._archived && !j._deleted), [jobs]);
  const matchesChip = useCallback(
    (j) => matchesFilter(j, filter) && matchesQuery(j, q),
    [filter, q]
  );
  const shown = useMemo(() => {
    const list = active.filter(matchesChip);
    if (filter === "To Do" || filter === "Upcoming") return sortByNextAction(list);
    return sortJobs(list, sort);
  }, [active, matchesChip, sort, filter]);

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
    return [...map.entries()]
      .filter(([, list]) => list.some(matchesChip))
      .map(([k, list]) => [k, sortJobs(list, sort)])
      .sort((A, B) => cmp(rank(A[1]), rank(B[1])));
  }, [active, matchesChip, sort]);

  /** Parent companies with sub-entities — separate from flat customer groups. */
  const { parentRows, flatGroups } = useMemo(() => {
    const board = buildCustomerBoardGroups(active, (list) => sortJobs(list, sort));
    const parentJobIds = new Set();
    const parents = board
      .filter((r) => r.kind === "parent")
      .filter((r) => r.jobs.some(matchesChip))
      .map((r) => {
        r.jobs.forEach((j) => parentJobIds.add(j.id));
        return { ...r, subs: subsUnderParent(active, r.key).map((s) => ({ ...s, jobs: sortJobs(s.jobs, sort) })) };
      });
    const flat = groups
      .map(([k, list]) => [k, list.filter((j) => !parentJobIds.has(j.id) && !hasParentCustomer(j))])
      .filter(([, list]) => list.length && list.some(matchesChip));
    return { parentRows: parents, flatGroups: flat };
  }, [active, groups, matchesChip, sort]);

  /** Jobs shown inside an expanded group — full customer when Active/All + no search. */
  const expandJobs = useCallback(
    (list) => {
      const showAll = (filter === "Active" || filter === "All") && !q.trim();
      return showAll ? list : list.filter(matchesChip);
    },
    [filter, q, matchesChip]
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

  /* auto-collapse an expanded row after ~10s without interaction */
  const armCollapse = (key) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(
      () => setOpen((o) => (o[key] ? { ...o, [key]: false } : o)),
      IDLE_COLLAPSE_MS
    );
  };
  const toggleGroup = (key) => {
    if (collapseGroups) return;
    setOpen((o) => {
      const now = !o[key];
      if (now) armCollapse(key);
      else clearTimeout(timers.current[key]);
      return { ...o, [key]: now };
    });
  };
  const groupExpanded = (key) => !collapseGroups && open[key];
  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

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

  const confirmImport = async () => {
    const c = importCust;
    if (!c) return;
    const key = c.id != null ? String(c.id) : c.name;
    const name = c.name || "";
    const custKey = customerKeyForImport(c);
    setImportCust(null);
    setQ("");
    setCustMatches([]);
    setOpen({});
    if (custKey) {
      try {
        sessionStorage.setItem(
          PENDING_IMPORT_LS,
          JSON.stringify({ key: custKey, name, qboId: c.id != null ? String(c.id) : "", started: Date.now() })
        );
      } catch {}
      nav("/customer/" + encodeURIComponent(custKey));
    }
    showToast("Importing " + name + "…");
    await enqueue(
      "import_customer",
      "import-" + key,
      { name, qboId: c.id != null ? String(c.id) : "" },
      "deterministic",
      "import_customer|" + key
    );
    try {
      await api.pullJobs?.();
    } catch {}
    refreshJobs?.(true);
  };

  return (
    <div className="space-y-3">
      <input
        className="input"
        type="search"
        placeholder="🔍  Search customers, jobs, addresses…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={armSearchIdle}
        onBlur={armSearchIdle}
        aria-label="Search jobs"
      />

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

      {loading && !jobs.length ? (
        <div className="card px-4 py-8 text-center text-slate-400 text-sm">Loading jobs…</div>
      ) : !shown.length ? (
        <div className="card px-4 py-8 text-center text-slate-400 text-sm">
          <span className="block text-3xl mb-2">🗂️</span>
          No jobs match.
          <br />
          Try another filter, or hit ＋ to add a job.
        </div>
      ) : (
        <div className="space-y-2.5">
          {parentRows.map((row) => {
            const multiSub = row.subs.length > 1;
            const expanded = groupExpanded(row.key);
            const needsAttention = row.jobs.some(needsAttentionJob);
            const syncCardClass = customerSyncCardClass(customerContact(row.jobs));
            return (
              <div key={row.key} className={`card relative overflow-hidden ${syncCardClass}`} data-testid="parent-customer-group">
                <AttentionGradient show={needsAttention} />
                <div className="w-full px-3 py-2.5 lg:px-4 lg:py-3">
                  <ClientListHeader
                    name={row.name}
                    amount={fmt$(row.summary.due) || "$0"}
                    meta={customerMetaLine(row.summary) + (multiSub ? ` · ${row.subs.length} companies` : "")}
                    hint={expanded ? "" : jobTitlesHint(row.jobs)}
                    onCardClick={() => nav("/customer/" + encodeURIComponent(row.key))}
                    avatar={<CustomerAvatar name={row.name} />}
                    trailing={
                      collapseGroups || !multiSub ? null : (
                        <button
                          type="button"
                          className="p-1 -m-1 text-slate-400 shrink-0"
                          aria-label={expanded ? "Collapse" : "Expand"}
                          data-testid="parent-group-toggle"
                          onClick={() => toggleGroup(row.key)}
                        >
                          <span className={`inline-block transition-transform ${expanded ? "rotate-180" : ""}`}>▾</span>
                        </button>
                      )
                    }
                  />
                </div>
                {multiSub && expanded && (
                  <div
                    className="px-2.5 pb-2.5 space-y-1.5 bg-slate-50/60 border-t border-slate-100 pt-2"
                    onPointerDown={() => armCollapse(row.key)}
                    data-testid="parent-sub-list"
                  >
                    {row.subs.map((sub) => (
                      <button
                        key={sub.key}
                        type="button"
                        className="w-full text-left rounded-lg bg-white border border-slate-100 px-3 py-2 active:bg-slate-50"
                        data-testid="sub-customer-row"
                        onClick={() => nav("/customer/" + encodeURIComponent(sub.key))}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-800 truncate">{sub.name}</span>
                          <span className="text-sm font-semibold tabular-nums shrink-0">{fmt$(sub.summary.due) || "$0"}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{customerMetaLine(sub.summary)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {flatGroups.map(([key, list]) => {
            const job = list[0];
            const customerName = boardCustomerLabel(job, list);
            const showFullGroup = (filter === "Active" || filter === "All") && !q.trim();
            const chipHits = list.filter(matchesChip);
            const displayList = showFullGroup ? list : chipHits.length ? chipHits : list;
            const sum = customerAmountSummary(showFullGroup ? list : displayList);
            const syncCardClass = customerSyncCardClass(customerContact(list));
            const needsAttention = list.some(needsAttentionJob);

            if (list.length === 1) {
              const pct = progressPct(job);
              const due = fmtAmountDue(job) || fmt$(openBalance(job)) || "—";
              const title = job.title || "(untitled job)";
              const openCustomer = () => nav("/customer/" + encodeURIComponent(key));
              return (
                <button
                  key={key}
                  type="button"
                  className={`card relative overflow-hidden w-full text-left active:opacity-90 ${syncCardClass} ${embedded ? "px-2.5 py-2" : "px-3 py-2.5 lg:px-4 lg:py-3"}`}
                  data-testid="client-single"
                  onClick={openCustomer}
                >
                  <AttentionGradient show={needsAttention} />
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
                <div className={`w-full px-3 py-2.5 ${embedded ? "" : "lg:px-4 lg:py-3"}`}>
                  <ClientListHeader
                    name={customerName}
                    amount={fmt$(sum.due) || "$0"}
                    meta={customerMetaLine(sum)}
                    hint={groupExpanded(key) ? "" : jobTitlesHint(displayList)}
                    onCardClick={() => nav("/customer/" + encodeURIComponent(key))}
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
                  <div
                    className="px-2.5 pb-2.5 space-y-1.5 bg-slate-50/60 border-t border-slate-100 pt-2"
                    onPointerDown={() => armCollapse(key)}
                  >
                    {expandJobs(list).map((j) => (
                      <GroupJobRow key={j.id} job={j} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* #56 — existing QBO customers not yet in the app. Tapping one offers to
          import the customer with all their open invoices as jobs. */}
      {q.trim().length >= 2 && custMatches.length > 0 && (
        <div className="pt-1" data-testid="qbo-customer-matches">
          <div className="px-1 pb-1.5 text-xs font-bold text-slate-500">
            Existing QuickBooks customers
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
                    In QuickBooks · tap to import their open invoices as jobs
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
