import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { fmtUsd } from "../../lib/requisitionData.js";
import { buildG703Rows, requisitionItems } from "../../lib/requisitionCalc.js";

/** Compact SOV / G703 columns — one line per row, no horizontal slider (Levi 2026-07-16). */
const TH =
  "text-right px-0.5 py-1 font-semibold leading-tight text-[9px] sm:text-[10px] text-slate-500 align-bottom whitespace-nowrap";
const TH_L =
  "text-left px-1 py-1 font-semibold leading-tight text-[9px] sm:text-[10px] text-slate-500 align-bottom whitespace-nowrap";
const TD = "text-right px-0.5 py-1 tabular-nums text-[10px] sm:text-[11px] whitespace-nowrap leading-none";
const TD_L = "text-left px-1 py-1 text-[10px] sm:text-[11px] whitespace-nowrap leading-none";

const G703_COLS = (
  <tr className="border-b border-slate-200">
    <th className={TH_L} style={{ minWidth: "9.5rem" }}>
      Item
    </th>
    <th className={TH}>Sched</th>
    <th className={TH}>Prev</th>
    <th className={TH}>Total</th>
    <th className={TH}>%</th>
    <th className={TH}>Bal</th>
    <th className={TH}>R%</th>
    <th className={TH}>Retain</th>
  </tr>
);

/** Full dollars+cents without $ — denser cells; hover/title keeps standard currency. */
function fmtUsdTight(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function MoneyCell({ n }) {
  return (
    <td className={TD} title={fmtUsd(n)}>
      {fmtUsdTight(n)}
    </td>
  );
}

function ItemCell({ label }) {
  const text = String(label || "");
  return (
    <td className={TD_L} title={text}>
      {text}
    </td>
  );
}

/** Scale the SOV table to the card width so every column stays on one line — no side slider. */
function FitSovTable({ children, testId }) {
  const wrapRef = useRef(null);
  const innerRef = useRef(null);
  const lastScale = useRef(1);

  useLayoutEffect(() => {
    const fit = () => {
      const wrap = wrapRef.current;
      const inner = innerRef.current;
      if (!wrap || !inner) return;
      // Measure natural table width (unscaled)
      inner.style.transform = "none";
      inner.style.width = "max-content";
      wrap.style.height = "auto";
      const need = Math.max(inner.scrollWidth, inner.offsetWidth) || 1;
      const have = wrap.clientWidth || 1;
      const next = need > have + 0.5 ? have / need : 1;
      // Skip no-op updates so ResizeObserver height tweaks don't loop
      if (Math.abs(next - lastScale.current) < 0.002 && next >= 1 && lastScale.current >= 1) {
        inner.style.width = "100%";
        return;
      }
      lastScale.current = next;
      if (next < 1) {
        inner.style.transform = `scale(${next})`;
        inner.style.transformOrigin = "top left";
        wrap.style.height = `${inner.offsetHeight * next}px`;
      } else {
        inner.style.transform = "none";
        inner.style.width = "100%";
        wrap.style.height = "auto";
      }
    };
    fit();
    const t = window.setTimeout(fit, 80);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    if (ro && wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", fit);
    return () => {
      window.clearTimeout(t);
      ro?.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [children]);

  return (
    <div ref={wrapRef} className="w-full overflow-hidden" data-testid={testId}>
      <div ref={innerRef} className="origin-top-left">
        {children}
      </div>
    </div>
  );
}

export function G702View({ req, showContract = false, live = false }) {
  if (!req) return null;
  return (
    <div className="space-y-2 text-sm" data-testid="g702-view">
      {live ? (
        <p className="text-xs text-slate-500">Application — updates as you change line percentages.</p>
      ) : null}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {showContract ? (
          <>
            <span className="text-slate-500">Contract sum to date</span>
            <span className="text-right font-semibold">{fmtUsd(req.contractSumToDate)}</span>
          </>
        ) : null}
        <span className="text-slate-500">Total completed &amp; stored to date</span>
        <span className="text-right font-semibold">{fmtUsd(req.totalCompleted)}</span>
        <span className="text-slate-500">Retainage ({req.retainagePct || 10}%)</span>
        <span className="text-right">{fmtUsd(req.totalRetainage)}</span>
        <span className="text-slate-500 font-semibold">Total earned, less retainage</span>
        <span className="text-right font-bold">{fmtUsd(req.earnedLessRetainage)}</span>
        <span className="text-slate-500">Less previous certified for payment</span>
        <span className="text-right">{fmtUsd(req.previousCertificates)}</span>
        <span className="text-slate-500 font-bold">Current payment due</span>
        <span className="text-right font-extrabold text-brand">{fmtUsd(req.currentPaymentDue)}</span>
        <span className="text-slate-500">Balance to finish</span>
        <span className="text-right font-semibold">{fmtUsd(req.balanceToFinish)}</span>
      </div>
    </div>
  );
}

function parseG703Section(description) {
  const d = String(description || "");
  const dash = d.indexOf(" - ");
  if (dash > 0) return { section: d.slice(0, dash).trim(), item: d.slice(dash + 3).trim() };
  return { section: "General", item: d };
}

export function G703View({
  req,
  editable = false,
  onPctChange,
  prevPctById = {},
  pctStatusById = {},
  expandAllToken = 0,
  collapseAllToken = 0,
  defaultExpandAll = true,
  renderPct,
}) {
  const rows = req?.g703 || [];

  const sections = useMemo(() => {
    const groups = [];
    const map = new Map();
    for (const r of rows) {
      if (/change orders/i.test(r.description || "")) continue;
      const { section, item } = parseG703Section(r.description);
      if (!map.has(section)) {
        const g = { name: section, items: [] };
        map.set(section, g);
        groups.push(g);
      }
      map.get(section).items.push({ ...r, itemLabel: item });
    }
    return groups;
  }, [rows]);

  const allNames = useMemo(() => sections.map((s) => s.name), [sections]);
  const [openSections, setOpenSections] = useState(
    () => (defaultExpandAll ? new Set(allNames) : new Set())
  );

  // When section names first load / change with defaultExpandAll, open them.
  React.useEffect(() => {
    if (defaultExpandAll && allNames.length) {
      setOpenSections(new Set(allNames));
    }
  }, [allNames.join("|"), defaultExpandAll]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (expandAllToken > 0) setOpenSections(new Set(allNames));
  }, [expandAllToken]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (collapseAllToken > 0) setOpenSections(new Set());
  }, [collapseAllToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSection = (name) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const toggleAll = () => {
    setOpenSections((prev) => {
      if (prev.size >= allNames.length) return new Set();
      return new Set(allNames);
    });
  };

  if (!sections.length) {
    return <p className="text-sm text-slate-400 text-center py-6" data-testid="g703-view">No continuation lines yet.</p>;
  }

  const allOpen = openSections.size >= allNames.length && allNames.length > 0;

  return (
    <div className="space-y-2" data-testid="g703-view">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-slate-500 flex-1">
          Continuation sheet — scheduled value, previous application, total completed &amp; stored, % G/C, balance to finish.
        </p>
        <button
          type="button"
          className="text-[11px] font-bold text-brand shrink-0 px-2 py-1 rounded-lg border border-brand/30 bg-brand-soft"
          onClick={toggleAll}
          data-testid="g703-expand-all"
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>
      {sections.map((sec) => {
        const open = openSections.has(sec.name);
        return (
          <div key={sec.name} className="card overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 font-bold text-sm border-b"
              onClick={() => toggleSection(sec.name)}
              data-testid={`g703-floor-${sec.name}`}
            >
              <span>{sec.name}</span>
              <span className="text-brand text-xs font-semibold">{open ? "Hide ▴" : "Show ▾"}</span>
            </button>
            {open ? (
              <FitSovTable testId="g703-sov-fit">
                <table className="w-full text-[10px] sm:text-[11px]">
                  <thead>{G703_COLS}</thead>
                  <tbody>
                    {sec.items.map((r) => {
                      const itemId = r.itemId || r.id;
                      const status = pctStatusById[itemId] || "new";
                      const pctCls =
                        status === "changed"
                          ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                          : status === "unchanged"
                            ? "bg-red-50 text-red-700 border-red-200"
                            : "bg-white border-slate-200";
                      return (
                      <tr key={r.itemNo} className="border-b border-slate-100 last:border-0">
                        <ItemCell label={r.itemLabel} />
                        <MoneyCell n={r.scheduledValue} />
                        <MoneyCell n={r.prevCompleted} />
                        <MoneyCell n={r.totalCompleted} />
                        <td className={`${TD} font-semibold`}>
                          {renderPct ? (
                            renderPct(r)
                          ) : editable && onPctChange && itemId ? (
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.01}
                              inputMode="decimal"
                              className={`w-11 text-right border rounded px-0.5 py-0 text-[10px] sm:text-[11px] ${pctCls}`}
                              value={Math.round((Number(r.pctComplete) || 0) * 100) / 100}
                              onChange={(e) =>
                                onPctChange(
                                  itemId,
                                  Math.min(100, Math.max(0, Math.round((Number(e.target.value) || 0) * 100) / 100))
                                )
                              }
                              data-testid="g703-pct-input"
                            />
                          ) : (
                            `${(Math.round((Number(r.pctComplete) || 0) * 100) / 100).toFixed(
                              Number(r.pctComplete) % 1 ? 2 : 0
                            )}%`
                          )}
                        </td>
                        <MoneyCell n={r.balance} />
                        <td className={TD}>{Number(r.retainagePct) || 0}%</td>
                        <MoneyCell n={r.retainage} />
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </FitSovTable>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Build G703-shaped rows from draft SOV items for the new-requisition continuation tab. */
export function draftContinuationRows(items, prevPctById = {}, retainagePct = 10) {
  const prevItemsById = {};
  for (const it of items || []) {
    const pct = prevPctById[it.id];
    if (pct != null) prevItemsById[it.id] = { completedPct: pct };
  }
  const rows = buildG703Rows(items, prevItemsById, retainagePct);
  return rows.map((r, idx) => ({
    ...r,
    itemId: items[idx]?.id,
  }));
}

function groupRequisitionSections(items) {
  const groups = [];
  let cur = { name: "General", items: [] };
  for (const it of requisitionItems(items)) {
    if (it.section && it.section !== cur.name) {
      if (cur.items.length) groups.push(cur);
      cur = { name: it.section, items: [] };
    }
    cur.items.push(it);
  }
  if (cur.items.length) groups.push(cur);
  return groups;
}

/** Editable continuation sheet for a new requisition draft (matches Excel column order). */
export function G703DraftContinuation({
  items,
  prevPctById = {},
  retainagePct = 10,
  onPctChange,
  renderPct,
  expandAllToken = 0,
  collapseAllToken = 0,
  defaultExpandAll = true,
}) {
  const baseItems = useMemo(() => requisitionItems(items), [items]);
  const rowById = useMemo(() => {
    const rows = draftContinuationRows(baseItems, prevPctById, retainagePct);
    return Object.fromEntries(rows.map((r) => [r.itemId, r]));
  }, [baseItems, prevPctById, retainagePct]);
  const sections = useMemo(() => groupRequisitionSections(items), [items]);
  const allNames = useMemo(() => sections.map((s) => s.name), [sections]);
  const [openSections, setOpenSections] = useState(
    () => (defaultExpandAll ? new Set(allNames) : new Set())
  );

  React.useEffect(() => {
    if (defaultExpandAll && allNames.length) setOpenSections(new Set(allNames));
  }, [allNames.join("|"), defaultExpandAll]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (expandAllToken > 0) setOpenSections(new Set(allNames));
  }, [expandAllToken]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (collapseAllToken > 0) setOpenSections(new Set());
  }, [collapseAllToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSection = (name) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const allOpen = openSections.size >= allNames.length && allNames.length > 0;
  const toggleAll = () => {
    setOpenSections((prev) => (prev.size >= allNames.length ? new Set() : new Set(allNames)));
  };

  return (
    <div className="space-y-3" data-testid="g703-draft">
      <div className="flex justify-end">
        <button
          type="button"
          className="text-[11px] font-bold text-brand shrink-0 px-2 py-1 rounded-lg border border-brand/30 bg-brand-soft"
          onClick={toggleAll}
          data-testid="g703-draft-expand-all"
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>
      {sections.map((sec) => {
        const open = openSections.has(sec.name);
        return (
          <div key={sec.name} className="card overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-2 bg-slate-50 font-bold text-sm border-b text-left"
              onClick={() => toggleSection(sec.name)}
              data-testid={`g703-draft-floor-${sec.name}`}
            >
              <span>{sec.name}</span>
              <span className="text-brand text-xs font-semibold">{open ? "Hide ▴" : "Show ▾"}</span>
            </button>
            {open ? (
              <FitSovTable testId="g703-draft-sov-fit">
                <table className="w-full text-[10px] sm:text-[11px]">
                  <thead>{G703_COLS}</thead>
                  <tbody>
                    {sec.items.map((it) => {
                      const r = rowById[it.id];
                      if (!r) return null;
                      return (
                        <tr key={it.id} className="border-b border-slate-100 last:border-0">
                          <ItemCell label={it.description} />
                          <MoneyCell n={r.scheduledValue} />
                          <MoneyCell n={r.prevCompleted} />
                          <MoneyCell n={r.totalCompleted} />
                          <td className={TD}>
                            {renderPct ? renderPct(it) : (
                              <span className="tabular-nums font-semibold">
                                {(Math.round((Number(r.pctComplete) || 0) * 100) / 100).toFixed(
                                  Number(r.pctComplete) % 1 ? 2 : 0
                                )}%
                              </span>
                            )}
                          </td>
                          <MoneyCell n={r.balance} />
                          <td className={TD}>{Number(r.retainagePct) || 0}%</td>
                          <MoneyCell n={r.retainage} />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </FitSovTable>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function useReqTabSwipe(tabs, tab, setTab) {
  const touchX = React.useRef(0);
  const idx = tabs.findIndex((t) => t.id === tab);
  const onTouchStart = (e) => (touchX.current = e.touches[0]?.clientX ?? 0);
  const onTouchEnd = (e) => {
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
    if (Math.abs(dx) < 50) return;
    const next = dx < 0 ? Math.min(tabs.length - 1, idx + 1) : Math.max(0, idx - 1);
    setTab(tabs[next].id);
  };
  return { onTouchStart, onTouchEnd };
}

export function ReqTabBar({ tabs, tab, setTab, onTabPress, testId = "req-detail-tabs" }) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1" data-testid={testId}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${
            tab === t.id ? "bg-brand text-white border-brand" : "bg-white text-slate-600 border-slate-200"
          }`}
          onClick={() => {
            // Re-pressing the active tab still fires (Continuation Sheet expand/collapse toggle).
            if (onTabPress) onTabPress(t.id, tab === t.id);
            setTab(t.id);
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ReqNavArrows({ label, onPrev, onNext, prevDisabled, nextDisabled, testId = "req-nav" }) {
  return (
    <div className="flex items-center justify-between gap-2" data-testid={testId}>
      <button
        type="button"
        className="btn btn-sm shrink-0 disabled:opacity-30"
        onClick={onPrev}
        disabled={prevDisabled}
        data-testid="req-nav-prev"
      >
        ← Prev
      </button>
      <span className="text-sm font-extrabold text-slate-900 text-center flex-1 truncate">{label}</span>
      <button
        type="button"
        className="btn btn-sm shrink-0 disabled:opacity-30"
        onClick={onNext}
        disabled={nextDisabled}
        data-testid="req-nav-next"
      >
        Next →
      </button>
    </div>
  );
}