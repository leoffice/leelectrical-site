// Progress — build momentum dashboard: speed vs other agents, money saved,
// tap-to-expand highlights and release versions. Data from /.netlify/functions/progress.
import React, { useCallback, useEffect, useState } from "react";
import { useStore } from "../state/store.jsx";
import { fetchProgress, fmtMoney, fmtUpdated, maxAgentHours } from "../lib/progressDashboard.js";

const CAT_IC = {
  billing: "🧾",
  payments: "💳",
  ai: "🤖",
  customers: "🗂️",
  default: "⚡",
};

function StatCard({ label, value, note, accent }) {
  return (
    <div className={"card px-3 py-3 text-center " + (accent ? "border-brand/30 bg-brand-soft/40" : "")} data-testid="progress-stat">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={"text-xl font-extrabold mt-0.5 " + (accent ? "text-brand" : "text-slate-900")}>{value}</div>
      {note ? <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{note}</div> : null}
    </div>
  );
}

function HighlightRow({ item, open, onToggle }) {
  const ic = CAT_IC[item.category] || CAT_IC.default;
  return (
    <div className="card overflow-hidden" data-testid={"progress-highlight-" + item.id}>
      <button
        type="button"
        className="w-full text-left px-4 py-3 flex items-start gap-3 active:bg-slate-50"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="text-xl shrink-0">{ic}</span>
        <span className="min-w-0 flex-1">
          <div className="font-bold text-slate-900 text-sm leading-snug">{item.title}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {item.date}
            {item.version ? " · v" + item.version : ""}
          </div>
        </span>
        <span className="text-slate-400 text-xs shrink-0 mt-1">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="px-4 pb-3.5 -mt-1 text-sm text-slate-600 border-t border-slate-100 pt-2.5">{item.blurb}</div>
      ) : null}
    </div>
  );
}

function ReleaseRow({ rel, open, onToggle }) {
  return (
    <div className="card overflow-hidden" data-testid={"progress-release-" + rel.version}>
      <button
        type="button"
        className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-slate-50"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="pill bg-brand text-white font-extrabold">v{rel.version}</span>
        <span className="min-w-0 flex-1">
          <div className="font-bold text-slate-900 text-sm">{rel.title}</div>
          <div className="text-[11px] text-slate-400">{rel.date}</div>
        </span>
        <span className="text-slate-400 text-xs shrink-0">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <ul className="px-4 pb-3.5 text-sm text-slate-600 border-t border-slate-100 pt-2.5 space-y-1 list-disc pl-5">
          {(rel.items || []).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function Progress() {
  const { showToast } = useStore();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [openHighlight, setOpenHighlight] = useState(null);
  const [openRelease, setOpenRelease] = useState(null);

  const load = useCallback(
    async (refresh) => {
      setBusy(true);
      setErr("");
      try {
        const doc = await fetchProgress({ refresh });
        setData(doc);
        if (refresh) showToast("Progress updated");
      } catch (e) {
        setErr("Couldn’t load progress");
      } finally {
        setBusy(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    const onRefresh = () => load(true);
    window.addEventListener("le-progress-refresh", onRefresh);
    return () => window.removeEventListener("le-progress-refresh", onRefresh);
  }, [load]);

  if (err && !data) {
    return (
      <div className="card px-4 py-8 text-center" data-testid="progress-error">
        <p className="text-sm text-slate-600 mb-3">{err}</p>
        <button type="button" className="btn btn-brand" onClick={() => load(false)}>
          Try again
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card px-4 py-10 text-center text-sm text-slate-500" data-testid="progress-loading">
        Loading momentum…
      </div>
    );
  }

  const m = data.metrics || {};
  const maxH = maxAgentHours(m.agentCompare);
  const mult = m.speedMultiplier || 1;

  return (
    <div className="space-y-4 pb-2" data-testid="progress-dashboard">
      {/* Hero */}
      <div
        className="card px-4 py-5 border-0 text-white overflow-hidden relative"
        style={{ background: "linear-gradient(135deg, #0c4a6e 0%, #0369a1 55%, #d97706 100%)" }}
        data-testid="progress-hero"
      >
        <div className="relative z-10">
          <div className="text-[11px] font-bold uppercase tracking-widest opacity-80">⚡ LE Pro momentum</div>
          <h1 className="text-xl font-extrabold mt-1 leading-tight">{data.headline}</h1>
          <p className="text-sm opacity-90 mt-1">{data.tagline}</p>
          <div className="flex flex-wrap gap-3 mt-4">
            <div>
              <div className="text-3xl font-black leading-none">{mult}×</div>
              <div className="text-[10px] font-semibold uppercase opacity-80 mt-0.5">faster than agency pace</div>
            </div>
            <div className="w-px bg-white/25 self-stretch" />
            <div>
              <div className="text-3xl font-black leading-none">{fmtMoney(m.moneySaved)}</div>
              <div className="text-[10px] font-semibold uppercase opacity-80 mt-0.5">saved so far</div>
            </div>
          </div>
        </div>
        <div className="absolute -right-6 -bottom-8 text-[120px] opacity-10 select-none pointer-events-none">⚡</div>
      </div>

      <p className="text-[11px] text-slate-400 text-center" data-testid="progress-updated">
        Updated {fmtUpdated(data.updatedAt)}
        {busy ? " · refreshing…" : ""}
      </p>

      {/* Stat grid */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Shipped" value={m.tasksShipped ?? "—"} note="Pro builds done" accent />
        <StatCard label="Avg fix" value={(m.avgTurnaroundHours ?? "—") + "h"} note="idea → live" />
        <StatCard label="Tests" value={m.testsPassing ?? "—"} note="passing" />
      </div>

      {/* Speed compare */}
      <div className="card px-4 py-4" data-testid="progress-speed">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-3">Speed vs other ways</div>
        <div className="space-y-2.5">
          {(m.agentCompare || []).map((row) => {
            const pct = Math.max(8, Math.round(((row.hours || 1) / maxH) * 100));
            const isUs = row.tone === "brand";
            return (
              <div key={row.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className={"font-semibold " + (isUs ? "text-brand" : "text-slate-600")}>{row.name}</span>
                  <span className="text-slate-400">{row.hours}h typical</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={"h-full rounded-full transition-all " + (isUs ? "bg-gradient-to-r from-brand to-accent" : "bg-slate-300")}
                    style={{ width: pct + "%" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Israel turns around most requests in hours — not the {m.traditionalDays || 5}-day agency cycle.
        </p>
      </div>

      {/* Fleet budget */}
      <div className="card px-4 py-3 flex items-center gap-3" data-testid="progress-budget">
        <div className="text-2xl">💰</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-slate-900">AI spend today</div>
          <div className="text-xs text-slate-500">
            ${m.fleetSpendToday ?? 0} of ${m.fleetBudget ?? 10} daily cap · {m.moneySavedNote || "vs contract dev"}
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 mt-2 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: Math.min(100, Math.round(((m.fleetSpendToday || 0) / (m.fleetBudget || 10)) * 100)) + "%" }}
            />
          </div>
        </div>
      </div>

      {/* Highlights */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2 px-0.5">Recent wins</div>
        <div className="space-y-2">
          {(data.highlights || []).map((h) => (
            <HighlightRow
              key={h.id}
              item={h}
              open={openHighlight === h.id}
              onToggle={() => setOpenHighlight((id) => (id === h.id ? null : h.id))}
            />
          ))}
        </div>
      </div>

      {/* Releases */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2 px-0.5">Versions shipped</div>
        <div className="space-y-2">
          {(data.releases || []).map((r) => (
            <ReleaseRow
              key={r.version}
              rel={r}
              open={openRelease === r.version}
              onToggle={() => setOpenRelease((v) => (v === r.version ? null : r.version))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Circle refresh control — only rendered on the Progress route (App.jsx). */
export function ProgressRefreshButton({ busy }) {
  return (
    <button
      type="button"
      aria-label="Update progress"
      data-testid="progress-refresh-btn"
      disabled={busy}
      onClick={() => window.dispatchEvent(new CustomEvent("le-progress-refresh"))}
      className="w-8 h-8 rounded-full border border-slate-200 bg-white shadow-sm flex items-center justify-center text-brand text-sm font-bold active:scale-95 disabled:opacity-50 shrink-0"
      title="Update progress"
    >
      ↻
    </button>
  );
}