// Jobs view — search, filter chips, amount-sorted cards, customer grouping
// (clientGroup OR normalized name), and per-card quick actions.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store.jsx";
import { CustomerAvatar, GroupJobRow, PaidPill, StagePill } from "../components/JobCard.jsx";
import { Link } from "react-router-dom";
import { progressPct } from "../lib/stages.js";
import MergePrompt from "../components/MergePrompt.jsx";
import Sheet, { Opt } from "../components/Sheet.jsx";
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
} from "../lib/customers.js";
import { customerSyncCardClass } from "../lib/customerSync.js";
import { fmt$, parseAmount } from "../lib/format.js";
import { useNavigate } from "react-router-dom";

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

/** Short job description line — titles or invoice numbers. */
function jobTitlesHint(list, max = 3) {
  const bits = list
    .map((j) => j.title || (j.invoiceNo ? `Inv #${j.invoiceNo}` : ""))
    .filter(Boolean);
  if (!bits.length) return "";
  if (bits.length <= max) return bits.join(" · ");
  return bits.slice(0, max).join(" · ") + ` · +${bits.length - max}`;
}

/** Customer row: name + balance on one line; meta + job hint stacked below. */
function ClientListHeader({ name, amount, meta, hint, hintHref, amountHref, onNameClick, trailing, avatar }) {
  const AmountTag = amountHref ? Link : "div";
  const amountProps = amountHref
    ? { to: amountHref, className: "shrink-0 text-sm font-semibold text-slate-900 tabular-nums lg:font-bold lg:text-base hover:text-brand" }
    : { className: "shrink-0 text-sm font-semibold text-slate-900 tabular-nums lg:font-bold lg:text-base" };
  return (
    <div className="flex items-start gap-2 min-w-0">
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            className="flex-1 min-w-0 text-left text-sm font-semibold text-slate-900 break-words line-clamp-2 leading-snug max-lg:line-clamp-3 lg:text-base lg:font-bold lg:truncate"
            title={name}
            data-testid="client-group-name"
            onClick={onNameClick}
          >
            {name}
          </button>
          <AmountTag {...amountProps} data-testid="client-group-amount">
            {amount}
          </AmountTag>
          {trailing}
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
          hintHref ? (
            <Link
              to={hintHref}
              className="block text-[11px] text-slate-500 leading-snug truncate mt-0.5 hover:text-brand"
              title={hint}
            >
              {hint}
            </Link>
          ) : (
            <div className="text-[11px] text-slate-500 leading-snug truncate mt-0.5" title={hint}>
              {hint}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

const IDLE_COLLAPSE_MS = 8000; // expanded customer rows fold back after ~8s idle
const SORT_LS_KEY = "lepro_jobs_sort_v1"; // persisted sort-by choice

const loadSort = () => {
  try {
    const s = localStorage.getItem(SORT_LS_KEY);
    return SORT_OPTIONS.some((o) => o.key === s) ? s : "smart";
  } catch {
    return "smart";
  }
};

export default function Jobs({ embedded }) {
  const { jobs, loading, showToast, api, enqueue } = useStore();
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
    for (const [k, list] of map) {
      if (!k.startsWith("g:")) continue;
      for (const j of list) {
        const n = normalizeCustomer(j.customer);
        if (n && !nameToGroup.has(n)) nameToGroup.set(n, k);
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

  /** Jobs shown inside an expanded group — full customer when Active/All + no search. */
  const expandJobs = useCallback(
    (list) => {
      const showAll = (filter === "Active" || filter === "All") && !q.trim();
      return showAll ? list : list.filter(matchesChip);
    },
    [filter, q, matchesChip]
  );

  /* auto-collapse an expanded row after ~8s without interaction */
  const armCollapse = (key) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(
      () => setOpen((o) => (o[key] ? { ...o, [key]: false } : o)),
      IDLE_COLLAPSE_MS
    );
  };
  const toggleGroup = (key) => {
    setOpen((o) => {
      const now = !o[key];
      if (now) armCollapse(key);
      else clearTimeout(timers.current[key]);
      return { ...o, [key]: now };
    });
  };
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

  // Confirm-import → enqueue an import_customer command. NOTE (stub): the host
  // command handler that creates the customer + turns their open QBO invoices
  // into jobs is NOT wired yet (qbo-exec only handles send_invoice/estimate).
  // TODO(host): add an `import_customer` handler to qbo-exec.mjs that fetches
  // the customer's open invoices and writes them into jobsdata as jobs.
  const confirmImport = async () => {
    const c = importCust;
    if (!c) return;
    setImportCust(null);
    const key = c.id != null ? String(c.id) : c.name;
    await enqueue(
      "import_customer",
      "import-" + key,
      { name: c.name, qboId: c.id != null ? String(c.id) : "" },
      "judgment",
      "import_customer|" + key
    );
    showToast("Import requested — Dispatch will pull open invoices as jobs");
  };

  return (
    <div className="space-y-3">
      <input
        className="input"
        type="search"
        placeholder="🔍  Search customer, job, address…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
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
          {groups.map(([key, list]) => {
            const job = list[0];
            const customerName = job.customer || "(no customer)";
            const showFullGroup = (filter === "Active" || filter === "All") && !q.trim();
            const chipHits = list.filter(matchesChip);
            const displayList = showFullGroup ? list : chipHits.length ? chipHits : list;
            const sum = customerAmountSummary(showFullGroup ? list : displayList);
            const syncCardClass = customerSyncCardClass(customerContact(list));

            if (list.length === 1) {
              const href = "/job/" + encodeURIComponent(job.id);
              const pct = progressPct(job);
              const due = fmtAmountDue(job) || fmt$(openBalance(job)) || "—";
              const title = job.title || "(untitled job)";
              return (
                <div
                  key={key}
                  className={`card ${syncCardClass} ${embedded ? "px-2.5 py-2" : "px-3 py-2.5 lg:px-4 lg:py-3"}`}
                  data-testid="client-single"
                >
                  <ClientListHeader
                    name={customerName}
                    amount={due}
                    meta={singleJobMetaLine(job)}
                    hint={title}
                    hintHref={href}
                    amountHref={href}
                    onNameClick={() => nav("/customer/" + encodeURIComponent(key))}
                    avatar={<CustomerAvatar name={customerName} />}
                  />
                  {!embedded && (
                    <>
                      <div className="mt-1.5 flex items-center gap-1 flex-wrap pl-9">
                        <StagePill job={job} />
                        <PaidPill job={job} />
                      </div>
                      <div className="mt-1.5 h-1 rounded-full bg-slate-100 overflow-hidden ml-9">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand to-accent"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            }

            return (
              <div key={key} className={`card overflow-hidden ${syncCardClass}`} data-testid="client-group">
                <div className={`w-full px-3 py-2.5 ${embedded ? "" : "lg:px-4 lg:py-3"}`}>
                  <ClientListHeader
                    name={customerName}
                    amount={fmt$(sum.due) || "$0"}
                    meta={customerMetaLine(sum)}
                    hint={open[key] ? "" : jobTitlesHint(displayList)}
                    onNameClick={() => nav("/customer/" + encodeURIComponent(key))}
                    avatar={<CustomerAvatar name={customerName} />}
                    trailing={
                      <button
                        type="button"
                        className="p-1 -m-1 text-slate-400 shrink-0"
                        aria-label={open[key] ? "Collapse" : "Expand"}
                        data-testid="client-group-toggle"
                        onClick={() => toggleGroup(key)}
                      >
                        <span className={`inline-block transition-transform ${open[key] ? "rotate-180" : ""}`}>▾</span>
                      </button>
                    }
                  />
                </div>
                {open[key] && (
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

      {!embedded && <MergePrompt />}

      {sheet?.kind === "paid" && <MarkPaidSheet job={sheet.job} onClose={() => setSheet(null)} />}
      {sheet?.kind === "send" && <QuickSendSheet job={sheet.job} onClose={() => setSheet(null)} />}

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
