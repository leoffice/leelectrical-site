// Dev Progress — infographic dashboard (approved mockup). Data from /.netlify/functions/progress.
import React, { useCallback, useEffect, useState } from "react";

import { fetchProgress, fmtUpdated } from "../lib/progressDashboard.js";
import { commas, kfmt, md, money, shortTitle, DEV_PROGRESS_CONFIG } from "../lib/devProgressFormat.js";
import { MomentumLine, SpeedBars } from "../lib/dashboard/charts.jsx";
import { useTenantConfig } from "../state/tenant.jsx";
import { tenantChrome } from "../lib/tenantBranding.js";

function StatCard({ n, label, colorClass = "" }) {
  const colors = { b: "text-sky-400", p: "text-purple-400", o: "text-amber-400", pk: "text-pink-400" };
  return (
    <div className="bg-gradient-to-b from-[#182140] to-[#0f1730] border border-[#24325e] rounded-[14px] px-3 py-4 text-center" data-testid="dev-stat">
      <div className={"text-[26px] font-extrabold leading-none " + (colors[colorClass] || "text-[#5eff9b]")}>{n}</div>
      <div className="text-[11px] text-[#9fb0d6] mt-1.5 uppercase tracking-wide">{label}</div>
    </div>
  );
}

function UpdateRow({ item, open, onToggle }) {
  const iters = (item.iterations || []).slice().reverse();
  return (
    <div className="bg-[#111935] border border-[#223059] rounded-[10px] mb-1.5 overflow-hidden" data-testid={"dev-update-" + item.id}>
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2.5 min-h-[44px] text-left hover:bg-[#141d3d] active:bg-[#141d3d]"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className={"text-[#5eff9b] text-[11px] w-3 shrink-0 transition-transform " + (open ? "rotate-90" : "")}>▶</span>
        <span className="text-[11px] text-[#8fa0c8] w-[52px] shrink-0 hidden sm:inline">{md(item.date)}</span>
        <span className="flex-1 text-xs text-[#eaf0ff] truncate font-medium">{shortTitle(item.title)}</span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#0c1330] text-[#37d0ff] shrink-0">{item.commits} commits</span>
      </button>
      {open ? (
        <div className="border-t border-[#223059]">
          {iters.map((it) => (
            <div key={it.hash} className="flex gap-2 px-3 py-1.5 pl-8 text-[11px] border-b border-[#182244]/30 last:border-0">
              <span className="text-[#6f7fa8] w-10 shrink-0 tabular-nums">{it.time}</span>
              <span className="text-[#c99bff] w-[52px] shrink-0 font-mono text-[10px]">{it.hash}</span>
              <span className="flex-1 text-[#cdd9f5] truncate">{it.subject}</span>
              <span className="shrink-0 text-[10px] text-[#8fa0c8] tabular-nums">
                <span className="text-[#5eff9b]">+{it.insertions}</span>/<span className="text-[#ff7ea8]">-{it.deletions}</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function yesterdayLabel(ts) {
  if (!ts) return "yesterday";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "yesterday";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export default function Progress() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [openUpdate, setOpenUpdate] = useState(null);
  const product = tenantChrome(useTenantConfig()).product;

  const load = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      const doc = await fetchProgress({ refresh: false });
      setData(doc);
    } catch (e) {
      setErr("Couldn't load build progress");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (err && !data) {
    return (
      <div className="card px-4 py-8 text-center" data-testid="progress-error">
        <p className="text-sm text-slate-600 mb-3">{err}</p>
        <button type="button" className="btn btn-brand" onClick={() => load()}>
          Try again
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card px-4 py-10 text-center text-sm text-slate-500" data-testid="progress-loading">
        Loading build progress…
      </div>
    );
  }

  const t = data.totals || {};
  const m = data.meta || {};
  const cfg = DEV_PROGRESS_CONFIG;
  const sp = t.speed_lines_landed_per_hour || 0;
  const one = cfg.humanDevNetLinesPerHour;
  const team = cfg.copilotTeamNetLinesPerHour;

  const hero = [
    ["", commas(t.updates), "Updates"],
    ["b", commas(t.commits), "Commits"],
    ["p", commas(t.deploys), "Live deploys"],
    ["o", kfmt(t.lines_implemented), "Lines landed"],
    ["pk", t.active_time_hms, "Time coding"],
  ];

  const bars = [
    { lab: "Israel (Grok) — this build", val: sp, fill: "linear-gradient(90deg,#5eff9b,#37d0ff)", disp: commas(sp) + "/hr" },
    { lab: "Copilot-assisted team", val: team, fill: "#37d0ff", disp: commas(team) + "/hr" },
    { lab: "One full-time developer", val: one, fill: "#5b6cff", disp: commas(one) + "/hr" },
  ];

  const chips = (data.updates || []).slice().reverse().slice(0, cfg.maxChips);
  const extra = (data.updates || []).length - cfg.maxChips;

  const facts = [
    { big: t.active_time_hms, txt: `Active build time — equivalent to ${t.active_hours} senior-dev hours at $${m.human_rate_usd_per_hour}/hr.` },
    { big: money(t.money_saved_usd), txt: `Money saved vs that human cost — AI cost ≈ $0 (${m.ai_cost_note || "Grok flat sub"}).` },
    { big: `${commas(t.deploys)} → live`, txt: "Every deploy shipped to the real app — build, test, ship, repeat." },
  ];

  return (
    <div className="space-y-4 pb-4 -mx-1 px-1 text-[#eaf0ff]" data-testid="progress-dashboard" style={{ background: "#0b1020", margin: "-1rem -0.25rem", padding: "1rem 0.75rem 2rem", minHeight: "100%" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-[34px] font-extrabold tracking-tight m-0 bg-gradient-to-r from-[#5eff9b] to-[#37d0ff] bg-clip-text text-transparent">
            ⚡ {m.project || product} — Development Progress
          </h1>
          <p className="text-sm text-[#8fa0c8] mt-1 mb-0">
            {t.first_commit ? md(t.first_commit.slice(0, 10)) : "—"} → {t.last_commit ? md(t.last_commit.slice(0, 10)) : "—"}, 2026 · {t.active_days} build days · built, tested & shipped live
          </p>
          <span className="inline-block mt-2 bg-[#14224a] border border-[#2b3d70] text-[#9fd0ff] rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
            🤖 {m.agent}
          </span>
        </div>
        <div className="text-right max-w-[11rem]">
          <p className="text-[10px] text-[#9fd0ff] font-semibold mt-1" data-testid="progress-updated">
            {busy ? "Loading…" : "Through " + yesterdayLabel(data.updatedAt || data.meta?.generated_at)}
          </p>
          <p className="text-[9px] text-[#6f7fa8] mt-0.5">Refreshes nightly — no button needed</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5" data-testid="dev-hero-stats">
        {hero.map((h) => (
          <StatCard key={h[2]} n={h[1]} label={h[2]} colorClass={h[0]} />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-[#111935] border border-[#223059] rounded-[14px] px-4 py-4" data-testid="progress-speed">
          <div className="text-[13px] text-[#9fb0d6] uppercase tracking-wide font-bold mb-3">How fast, really?</div>
          <SpeedBars rows={bars} maxVal={sp} />
          <p className="text-[11px] text-[#8fa0c8] mt-2">
            ≈ <b className="text-[#5eff9b]">{Math.round(sp / one)}×</b> a solo dev · <b className="text-[#37d0ff]">{Math.round(sp / team)}×</b> a Copilot team — net lines landed / hour.{" "}
            <span className="text-[#6f7fa8]">(human throughput = assumptions)</span>
          </p>
        </div>
        <div className="bg-[#111935] border border-[#223059] rounded-[14px] px-4 py-4">
          <div className="text-[13px] text-[#9fb0d6] uppercase tracking-wide font-bold mb-3">Momentum — cumulative lines written</div>
          <MomentumLine updates={data.updates} kfmt={kfmt} />
          <p className="text-[11px] text-[#8fa0c8] mt-1.5">
            {commas(t.lines_written)} written across {t.active_days} build days — output accelerated over the sprint.
          </p>
        </div>
      </div>

      <div className="bg-[#111935] border border-[#223059] rounded-[14px] px-4 py-4">
        <div className="text-[13px] text-[#9fb0d6] uppercase tracking-wide font-bold mb-2">Some of what shipped</div>
        <div className="flex flex-wrap gap-1">
          {chips.map((u) => (
            <span key={u.id} className="inline-block bg-[#14224a] border border-[#2b3d70] text-[#9fd0ff] rounded-full px-2.5 py-1 text-[11px]">
              {shortTitle(u.title)}
            </span>
          ))}
          {extra > 0 ? (
            <span className="inline-block bg-[#14224a] border border-[#2b3d70] text-[#9fd0ff] rounded-full px-2.5 py-1 text-[11px]">
              + {extra} more
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {facts.map((f, i) => (
          <div key={i} className="bg-gradient-to-b from-[#1a1330] to-[#12102a] border border-[#3a2b63] rounded-[14px] px-3.5 py-3.5">
            <div className="text-[22px] font-extrabold text-[#c99bff]">{f.big}</div>
            <div className="text-xs text-[#b9c4e6] mt-1 leading-snug" dangerouslySetInnerHTML={{ __html: f.txt }} />
          </div>
        ))}
      </div>

      <div>
        <div className="text-xs text-[#9fb0d6] uppercase tracking-wide font-bold mb-2 px-0.5">Updates · tap to expand into iterations (commits)</div>
        {(data.updates || [])
          .slice()
          .reverse()
          .map((u) => (
            <UpdateRow key={u.id} item={u} open={openUpdate === u.id} onToggle={() => setOpenUpdate((id) => (id === u.id ? null : u.id))} />
          ))}
      </div>

      <p className="text-xs text-[#7f8fb8] text-center leading-relaxed mt-4">
        {m.project} · leelectrical.us/app/pro — built with <b className="text-[#9fd0ff]">{m.agent}</b> + Dispatch (Claude), on Grok to keep costs near zero.
        <br />
        <span className="text-[10px] text-[#5c6a8f]">Generated {m.generated_at} · time is an estimate</span>
      </p>
    </div>
  );
}

