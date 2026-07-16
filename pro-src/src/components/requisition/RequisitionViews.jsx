import React, { useMemo, useState } from "react";
import { fmtUsd } from "../../lib/requisitionData.js";
import { buildG703Rows, requisitionItems } from "../../lib/requisitionCalc.js";

const G703_COLS = (
  <tr className="text-slate-500 border-b">
    <th className="text-left px-2 py-2">Item</th>
    <th className="text-right px-2 py-2 whitespace-nowrap">Scheduled value</th>
    <th className="text-right px-2 py-2 whitespace-nowrap">Previous application</th>
    <th className="text-right px-2 py-2 whitespace-nowrap">Total completed &amp; stored</th>
    <th className="text-right px-2 py-2 whitespace-nowrap">% G/C</th>
    <th className="text-right px-2 py-2 whitespace-nowrap">Balance to finish</th>
    <th className="text-right px-2 py-2 whitespace-nowrap">Ret. %</th>
    <th className="text-right px-2 py-2 whitespace-nowrap">Retainage</th>
  </tr>
);

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

export function G703View({ req, editable = false, onPctChange, prevPctById = {} }) {
  const rows = req?.g703 || [];
  const [openSections, setOpenSections] = useState(() => new Set());

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

  const toggleSection = (name) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  if (!sections.length) {
    return <p className="text-sm text-slate-400 text-center py-6" data-testid="g703-view">No continuation lines yet.</p>;
  }

  return (
    <div className="space-y-2" data-testid="g703-view">
      <p className="text-xs text-slate-500">
        Continuation sheet — scheduled value, previous application, total completed &amp; stored, % G/C, balance to finish.
      </p>
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
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[640px]">
                  <thead>{G703_COLS}</thead>
                  <tbody>
                    {sec.items.map((r) => (
                      <tr key={r.itemNo} className="border-b border-slate-100 last:border-0">
                        <td className="px-2 py-1.5">{r.itemLabel}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums">{fmtUsd(r.scheduledValue)}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums">{fmtUsd(r.prevCompleted)}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums">{fmtUsd(r.totalCompleted)}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums font-semibold">
                          {editable && onPctChange && r.itemId ? (
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              className="w-14 text-right border rounded px-1 py-0.5"
                              value={Math.round(Number(r.pctComplete) || 0)}
                              onChange={(e) => onPctChange(r.itemId, Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                              data-testid="g703-pct-input"
                            />
                          ) : (
                            `${Math.round(Number(r.pctComplete) || 0)}%`
                          )}
                        </td>
                        <td className="text-right px-2 py-1.5 tabular-nums">{fmtUsd(r.balance)}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums">{Number(r.retainagePct) || 0}%</td>
                        <td className="text-right px-2 py-1.5 tabular-nums">{fmtUsd(r.retainage)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
export function G703DraftContinuation({ items, prevPctById = {}, retainagePct = 10, onPctChange, renderPct }) {
  const baseItems = useMemo(() => requisitionItems(items), [items]);
  const rowById = useMemo(() => {
    const rows = draftContinuationRows(baseItems, prevPctById, retainagePct);
    return Object.fromEntries(rows.map((r) => [r.itemId, r]));
  }, [baseItems, prevPctById, retainagePct]);
  const sections = useMemo(() => groupRequisitionSections(items), [items]);

  return (
    <div className="space-y-3" data-testid="g703-draft">
      {sections.map((sec) => (
        <div key={sec.name} className="card overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 font-bold text-sm border-b">{sec.name}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="text-xs">{G703_COLS}</thead>
              <tbody>
                {sec.items.map((it) => {
                  const r = rowById[it.id];
                  if (!r) return null;
                  return (
                    <tr key={it.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2">{it.description}</td>
                      <td className="text-right px-2 py-2 tabular-nums text-xs">{fmtUsd(r.scheduledValue)}</td>
                      <td className="text-right px-2 py-2 tabular-nums text-xs">{fmtUsd(r.prevCompleted)}</td>
                      <td className="text-right px-2 py-2 tabular-nums text-xs">{fmtUsd(r.totalCompleted)}</td>
                      <td className="text-right px-2 py-2">
                        {renderPct ? renderPct(it) : (
                          <span className="tabular-nums font-semibold text-xs">{Math.round(Number(r.pctComplete) || 0)}%</span>
                        )}
                      </td>
                      <td className="text-right px-2 py-2 tabular-nums text-xs">{fmtUsd(r.balance)}</td>
                      <td className="text-right px-2 py-2 tabular-nums text-xs">{Number(r.retainagePct) || 0}%</td>
                      <td className="text-right px-2 py-2 tabular-nums text-xs">{fmtUsd(r.retainage)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
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

export function ReqTabBar({ tabs, tab, setTab, testId = "req-detail-tabs" }) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1" data-testid={testId}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${
            tab === t.id ? "bg-brand text-white border-brand" : "bg-white text-slate-600 border-slate-200"
          }`}
          onClick={() => setTab(t.id)}
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