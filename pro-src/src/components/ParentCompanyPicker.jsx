// Parent-company search — parent row with nested sub-companies (expand / select).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store.jsx";
import { buildQboHierarchyCtx } from "../lib/customerHierarchy.js";
import { CustomerMatchCard } from "./CustomerMatchPanel.jsx";

function groupParentResults(results, qboIndex) {
  const ctx = buildQboHierarchyCtx(qboIndex);
  const grouped = new Map();
  const standalone = [];

  for (const c of results || []) {
    const id = String(c?.id || "").trim();
    const pid = String(c?.parentId || "").trim();
    if (pid) {
      if (!grouped.has(pid)) {
        const parent = ctx.byId.get(pid) || { id: pid, name: c.parentName, businessName: c.parentName };
        grouped.set(pid, { parent, subs: [] });
      }
      grouped.get(pid).subs.push(c);
      continue;
    }
    const children = (qboIndex || []).filter((x) => String(x?.parentId || "") === id);
    if (children.length) {
      grouped.set(id, { parent: c, subs: children });
    } else {
      standalone.push(c);
    }
  }

  return { groups: [...grouped.values()], standalone };
}

export default function ParentCompanyPicker({
  value,
  onChangeText,
  onPick,
  label = "Parent company",
  testId = "parent-company-picker",
  placeholder = "Search parent company…",
}) {
  const { api } = useStore();
  const [results, setResults] = useState([]);
  const [qboIndex, setQboIndex] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState({});
  const timer = useRef(null);
  const dismissTimer = useRef(null);
  const alive = useRef(true);

  useEffect(
    () => () => {
      alive.current = false;
      clearTimeout(timer.current);
      clearTimeout(dismissTimer.current);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    api
      .searchCustomers("")
      .then((list) => {
        if (!cancelled && Array.isArray(list)) setQboIndex(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api]);

  const q = (value || "").trim();

  useEffect(() => {
    clearTimeout(timer.current);
    if (!open || q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const list = await api.searchCustomers(q);
        if (alive.current) {
          setResults(Array.isArray(list) ? list : []);
          setLoading(false);
        }
      } catch {
        if (alive.current) {
          setResults([]);
          setLoading(false);
        }
      }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q, open, api]);

  const { groups, standalone } = useMemo(() => groupParentResults(results, qboIndex), [results, qboIndex]);

  useEffect(() => {
    clearTimeout(dismissTimer.current);
    if (!open || (!groups.length && !standalone.length)) return;
    dismissTimer.current = setTimeout(() => {
      setOpen(false);
      setExpanded({});
    }, 4000);
    return () => clearTimeout(dismissTimer.current);
  }, [open, groups, standalone]);

  const choose = (c) => {
    setOpen(false);
    setExpanded({});
    setResults([]);
    onPick && onPick(c);
  };

  const parentKey = (c) => String(c?.id ?? c?.name ?? "");

  const onParentTap = (parent, group) => {
    const key = parentKey(parent);
    const hasSubs = group.subs.length > 0;
    if (hasSubs && !expanded[key]) {
      setExpanded((o) => ({ ...o, [key]: true }));
      return;
    }
    choose(parent);
  };

  const onSubTap = (sub) => {
    const pid = String(sub?.parentId || "").trim();
    const ctx = buildQboHierarchyCtx(qboIndex);
    const parent = pid ? ctx.byId.get(pid) : null;
    if (parent) choose(parent);
    else choose(sub);
  };

  const showPanel = open && q.length >= 2;

  return (
    <div className="relative">
      <input
        className="input"
        value={value || ""}
        onChange={(e) => {
          setOpen(true);
          onChangeText(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        aria-label={label}
        data-testid={testId}
        placeholder={placeholder}
        autoComplete="off"
      />
      {showPanel ? (
        <div
          className="mt-1 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm max-h-72 overflow-y-auto lg-scroll-hidden z-10"
          data-testid={testId + "-results"}
        >
          {loading ? <div className="px-3 py-2 text-xs text-slate-400">Searching…</div> : null}
          {!loading && !groups.length && !standalone.length ? (
            <div className="px-3 py-2 text-xs text-slate-400">No matches — try another name.</div>
          ) : null}
          {groups.map((group) => {
            const key = parentKey(group.parent);
            const isOpen = expanded[key];
            const multi = group.subs.length > 0;
            return (
              <div key={key} className="border-b border-slate-100 last:border-b-0" data-testid="parent-picker-group">
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 active:bg-slate-100 flex items-center justify-between gap-2"
                  data-testid="parent-picker-parent"
                  onClick={() => onParentTap(group.parent, group)}
                >
                  <span className="truncate">{group.parent.businessName || group.parent.name}</span>
                  {multi ? (
                    <span className={`text-slate-400 text-xs shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                      ▾
                    </span>
                  ) : null}
                </button>
                {multi && isOpen ? (
                  <div className="bg-slate-50/80 border-t border-slate-100" data-testid="parent-picker-subs">
                    {group.subs.map((sub) => (
                      <button
                        key={sub.id ?? sub.name}
                        type="button"
                        className="w-full text-left pl-6 pr-3 py-2 text-sm text-slate-700 hover:bg-white active:bg-slate-50 border-b border-slate-100 last:border-b-0"
                        data-testid="parent-picker-sub"
                        onClick={() => onSubTap(sub)}
                      >
                        {sub.businessName || sub.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
          {standalone.map((c) => (
            <CustomerMatchCard key={c.id ?? c.name} customer={c} onPick={choose} testId="parent-picker-standalone" />
          ))}
        </div>
      ) : null}
    </div>
  );
}