// Inline SVG chart helpers — ported from approved Company + Dev Progress mockups.
import React from "react";

export const CO = {
  green: "#1DB954",
  gd: "#159a44",
  blue: "#2f7de1",
  amber: "#e8940c",
  orange: "#cf6a12",
  red: "#e0483b",
  purple: "#7a4fd1",
  grey: "#8a94a0",
  track: "#eef1f4",
  ink: "#141b24",
  mint: "#5eff9b",
  cyan: "#37d0ff",
};

export function VBars({ last, now, color, l1 = "LW", l2 = "TW" }) {
  const max = Math.max(last, now) || 1;
  const h = 44;
  const bw = 20;
  const gap = 16;
  const w = bw * 2 + gap;
  const lh = Math.max(3, (last / max) * h);
  const nh = Math.max(3, (now / max) * h);
  return (
    <svg className="block h-[58px]" viewBox={`0 0 ${w} ${h + 13}`} width={w} aria-hidden>
      <rect x="0" y={h - lh} width={bw} height={lh} rx="3" fill="#c9d0d8" />
      <rect x={bw + gap} y={h - nh} width={bw} height={nh} rx="3" fill={color} />
      <text x={bw / 2} y={h + 11} textAnchor="middle" className="fill-slate-400 text-[9px] font-extrabold">
        {l1}
      </text>
      <text x={bw + gap + bw / 2} y={h + 11} textAnchor="middle" className="fill-slate-400 text-[9px] font-extrabold">
        {l2}
      </text>
    </svg>
  );
}

export function Donut({ segs, size = 128, stroke = 20, topT, botT }) {
  const total = segs.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  let off = 0;
  return (
    <svg className="block" viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img">
      {segs.map((s, i) => {
        const len = (s.value / total) * c;
        const el = (
          <circle
            key={i}
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-off}
            transform={`rotate(-90 ${cx} ${cx})`}
          />
        );
        off += len;
        return el;
      })}
      <text x={cx} y={cx - 1} textAnchor="middle" className="fill-slate-900 text-[19px] font-extrabold">
        {topT}
      </text>
      <text x={cx} y={cx + 12} textAnchor="middle" className="fill-slate-500 text-[8.5px] font-bold uppercase tracking-wide">
        {botT}
      </text>
    </svg>
  );
}

export function HBar({ frac, color }) {
  const f = Math.max(0, Math.min(1, frac));
  return (
    <svg className="block w-full h-[11px]" viewBox="0 0 100 11" preserveAspectRatio="none" aria-hidden>
      <rect width="100" height="11" rx="5.5" fill={CO.track} />
      <rect width={f * 100} height="11" rx="5.5" fill={color} />
    </svg>
  );
}

export function HBarRow({ name, frac, color, val }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="flex-[0_0_40%] text-[13px] font-semibold truncate">{name}</span>
      <span className="flex-1 min-w-[40px]">
        <HBar frac={frac} color={color} />
      </span>
      <span className="flex-none text-[13px] font-extrabold tabular-nums min-w-[56px] text-right">{val}</span>
    </div>
  );
}

export function StackBar({ segs }) {
  const total = segs.reduce((a, s) => a + s.value, 0) || 1;
  let x = 0;
  return (
    <svg className="block w-full h-4 rounded-lg overflow-hidden" viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden>
      {segs.map((s, i) => {
        const sw = (s.value / total) * 100;
        const el = <rect key={i} x={x} y="0" width={sw} height="16" fill={s.color} />;
        x += sw;
        return el;
      })}
    </svg>
  );
}

export function Gauge({ value, max, target, color }) {
  const f = Math.min(1, value / max);
  const tf = Math.min(1, target / max);
  return (
    <svg className="block w-full h-[14px]" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden>
      <rect width="100" height="14" rx="7" fill={CO.track} />
      <rect width={f * 100} height="14" rx="7" fill={color} />
      <line x1={tf * 100} y1="-1" x2={tf * 100} y2="15" stroke={CO.ink} strokeWidth="1.4" strokeDasharray="2 2" />
    </svg>
  );
}

export function Funnel({ stages }) {
  const w = 210;
  const rowH = 26;
  const gap = 7;
  const maxV = stages[0]?.value || 1;
  const svgH = stages.length * (rowH + gap) - gap;
  return (
    <svg className="block w-full max-w-[240px] mx-auto mt-1" viewBox={`0 0 ${w} ${svgH}`} aria-hidden>
      {stages.map((s, i) => {
        const bw = Math.max(30, (s.value / maxV) * w);
        const x = (w - bw) / 2;
        const y = i * (rowH + gap);
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={rowH} rx="5" fill={s.color} />
            <text x={w / 2} y={y + rowH / 2 + 4} textAnchor="middle" className="fill-white text-[10px] font-extrabold">
              {s.label} · {s.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Trend({ vals, labels, color }) {
  const w = 210;
  const h = 58;
  const pad = 7;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const rng = max - min || 1;
  const n = vals.length;
  const pts = vals.map((v, i) => {
    const x = pad + i * ((w - 2 * pad) / (n - 1 || 1));
    const y = h - 13 - ((v - min) / rng) * (h - 2 * pad - 14);
    return [x, y];
  });
  const poly = pts.map((p) => `${p[0]},${p[1]}`).join(" ");
  const area =
    `M ${pts[0][0]} ${pts[0][1]} ` +
    pts
      .slice(1)
      .map((p) => `L ${p[0]} ${p[1]}`)
      .join(" ") +
    ` L ${pts[n - 1][0]} ${h - 13} L ${pts[0][0]} ${h - 13} Z`;
  return (
    <svg className="block w-full max-w-[340px]" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={area} fill={color + "22"} />
      <polyline points={poly} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === n - 1 ? 3.2 : 2} fill={i === n - 1 ? color : "#fff"} stroke={color} strokeWidth="1.6" />
      ))}
      {labels.map((l, i) => (
        <text key={i} x={pts[i][0]} y={h - 1} textAnchor="middle" className="fill-slate-400 text-[8px] font-bold">
          {l}
        </text>
      ))}
    </svg>
  );
}

export function SpeedBars({ rows, maxVal }) {
  const mx = maxVal || Math.max(1, ...rows.map((r) => r.val));
  return (
    <div className="space-y-2">
      {rows.map((b) => {
        const w = Math.max(3, (b.val / mx) * 100);
        return (
          <div key={b.lab}>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-semibold text-slate-600">{b.lab}</span>
              <span className="text-slate-400 font-bold">{b.disp}</span>
            </div>
            <div className="h-4 rounded-lg bg-[#0c1330] overflow-hidden">
              <div className="h-full rounded-lg" style={{ width: `${w}%`, background: b.fill }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MomentumLine({ updates, kfmt }) {
  const W = 320;
  const H = 140;
  const pl = 34;
  const pr = 12;
  const pt = 14;
  const pb = 24;
  let cum = 0;
  const pts = (updates || []).map((u, i) => {
    cum += u.insertions || 0;
    return { i, y: cum, d: u.date };
  });
  const nx = pts.length - 1 || 1;
  const maxY = cum || 1;
  const X = (i) => pl + ((W - pl - pr) * i) / nx;
  const Y = (v) => pt + (H - pt - pb) * (1 - v / maxY);
  const poly = pts.map((p) => `${X(p.i)},${Y(p.y)}`).join(" ");
  const md = (dateStr) => {
    const p = dateStr.slice(5).split("-");
    return "Jul " + parseInt(p[1], 10);
  };
  return (
    <svg className="w-full h-auto block" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Cumulative lines written">
      {[0, 1, 2].map((k) => {
        const gv = (maxY * k) / 2;
        const gy = Y(gv);
        return (
          <g key={k}>
            <line x1={pl} y1={gy} x2={W - pr} y2={gy} stroke="#1c2a52" />
            <text x={pl - 4} y={gy + 3} fill="#6f7fa8" fontSize="8" textAnchor="end">
              {kfmt(gv)}
            </text>
          </g>
        );
      })}
      <polyline points={poly} fill="none" stroke="#5eff9b" strokeWidth="3" strokeLinejoin="round" />
      {pts.map((p, j) => (
        <circle key={j} cx={X(p.i)} cy={Y(p.y)} r={j === pts.length - 1 ? 4 : 3} fill={j === pts.length - 1 ? "#5eff9b" : "#37d0ff"} />
      ))}
      <text x={X(0)} y={H - 8} fill="#9fb0d6" fontSize="9">
        {pts[0] ? md(pts[0].d) : ""}
      </text>
      <text x={X(nx)} y={H - 8} fill="#9fb0d6" fontSize="9" textAnchor="end">
        {pts[nx] ? md(pts[nx].d) : ""}
      </text>
      <text x={X(nx)} y={Y(maxY) - 7} fill="#5eff9b" fontSize="12" fontWeight="700" textAnchor="end">
        {kfmt(maxY)}
      </text>
    </svg>
  );
}