// Company dashboard — business KPIs from QuickBooks-synced jobs + Google Calendar.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store.jsx";
import DashboardWidget, { DeltaBadge, DetailTable } from "../components/DashboardWidget.jsx";
import CompanyLinkedTable from "../components/CompanyLinkedTable.jsx";
import Toggle from "../components/Toggle.jsx";
import { ago } from "../lib/format.js";
import { CO, Donut, Funnel, Gauge, HBar, HBarRow, StackBar, Trend, VBars } from "../lib/dashboard/charts.jsx";
import { buildCompanyMetrics, fmtMoney, fmtMoneyK } from "../lib/companyMetrics.js";
import { COMPANY_SECTIONS, sectionsForTenant, widgetsForSection } from "../lib/companyDashboardConfig.js";
import { requisitionPortfolio } from "../lib/requisitionHelpers.js";
import { normalizeProjects } from "../lib/requisitionData.js";
import api from "../data/adapter.js";
import {
  clearCompanyLogo,
  readLogoFileAsDataUrl,
  setCompanyLogoDataUrl,
  setSpeechToTextEnabled,
  useAppSettings,
} from "../lib/appSettings.js";
import { useTenantConfig } from "../state/tenant.jsx";
import { applyCompanyLogoToActiveConfig, tenantChrome } from "../lib/tenantBranding.js";

function odPill(od) {
  if (!od) return '<span class="inline-block text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">current</span>';
  const cls = od > 60 ? "red" : od > 30 ? "amber" : "grey";
  const colors = { red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-700", grey: "bg-slate-100 text-slate-600" };
  return `<span class="inline-block text-[10px] font-extrabold px-1.5 py-0.5 rounded ${colors[cls]}">${od}d</span>`;
}

function metricHead(kick, val, sub) {
  return (
    <>
      <div className="text-[12.5px] text-slate-500 font-bold">{kick}</div>
      <div className="text-[28px] font-extrabold tracking-tight leading-none mt-1">{val}</div>
      {sub ? <div className="text-xs text-slate-500 font-semibold mt-1">{sub}</div> : null}
    </>
  );
}

function linkMeta(rows, doc = "invoice") {
  return (rows || []).map((r) => (r.jobId ? { jobId: r.jobId, doc: r.doc || doc } : null));
}

function LinkedOrPlain({ dataRows, doc = "invoice", title, cols, rows, align, total, foot }) {
  const hasLinks = (dataRows || []).some((r) => r.jobId);
  const props = { title, cols, rows, align, total, foot };
  if (!hasLinks) return <DetailTable {...props} />;
  return <CompanyLinkedTable {...props} linkMeta={linkMeta(dataRows, doc)} />;
}

function buildWidgets(data) {
  const w = data.week;
  const m = data.month;
  const ar = data.ar;
  const perf = data.performance;
  const ex = data.extras;

  const builders = {
    "estimates-week": () => (
      <DashboardWidget
        id="estimates-week"
        accent="green"
        layout="arow"
        head={
          <>
            {metricHead("Estimates submitted", w.estimates.count, <>last wk {w.estimates.prev} <DeltaBadge val={w.estimates.count} prev={w.estimates.prev} /></>)}
            <VBars last={w.estimates.prev} now={w.estimates.count} color={CO.green} />
          </>
        }
        detail={
          <LinkedOrPlain
            dataRows={w.estimates.rows}
            doc="estimate"
            title="Estimates submitted this week"
            cols={["Customer", "Est #", "Scope", "Amount"]}
            align={["", "", "", "r"]}
            rows={w.estimates.rows.map((e) => [e.cust, e.n, e.scope, fmtMoney(e.amt)])}
            total={["Total quoted", fmtMoney(w.estimates.amt)]}
            foot="Source: QuickBooks estimates (job sync)."
          />
        }
      />
    ),
    "invoices-week": () => (
      <DashboardWidget
        id="invoices-week"
        accent="amber"
        layout="arow"
        head={
          <>
            {metricHead("Invoices generated", w.invoices.count, <>last wk {w.invoices.prev} <DeltaBadge val={w.invoices.count} prev={w.invoices.prev} /></>)}
            <VBars last={w.invoices.prev} now={w.invoices.count} color={CO.amber} />
          </>
        }
        detail={
          <LinkedOrPlain
            dataRows={w.invoices.rows}
            title="Invoices generated this week"
            cols={["Customer", "Invoice #", "From est.", "Amount"]}
            align={["", "", "", "r"]}
            rows={w.invoices.rows.map((e) => [e.cust, e.n, e.from, fmtMoney(e.amt)])}
            total={["Total invoiced", fmtMoney(w.invoices.amt)]}
            foot="Source: QuickBooks invoices (job sync)."
          />
        }
      />
    ),
    "appointments-week": () => (
      <DashboardWidget
        id="appointments-week"
        accent="blue"
        layout="arow"
        head={
          <>
            {metricHead("Appointments made", w.appointments.count, <>last wk {w.appointments.prev} <DeltaBadge val={w.appointments.count} prev={w.appointments.prev} /></>)}
            <VBars last={w.appointments.prev} now={w.appointments.count} color={CO.blue} />
          </>
        }
        detail={
          <DetailTable
            title="Appointments booked this week"
            cols={["Type", "Customer", "Scheduled for", "Booked"]}
            rows={w.appointments.rows.map((e) => [e.type, e.cust, e.when, e.booked])}
            foot="Source: Google Calendar sync."
          />
        }
      />
    ),
    "collected-week": () => (
      <DashboardWidget
        id="collected-week"
        accent="green"
        layout="arow"
        head={
          <>
            {metricHead("Money collected", fmtMoneyK(w.collected.total), <>last wk {fmtMoneyK(w.collected.prev)} <DeltaBadge val={w.collected.total} prev={w.collected.prev} /></>)}
            <VBars last={w.collected.prev} now={w.collected.total} color={CO.green} />
          </>
        }
        detail={
          <LinkedOrPlain
            dataRows={w.collected.rows}
            title="Payments received this week"
            cols={["Customer", "Invoice #", "Method", "Amount"]}
            align={["", "", "", "r"]}
            rows={w.collected.rows.map((e) => [e.cust, e.inv, e.method, fmtMoney(e.amt)])}
            total={["Total collected", fmtMoney(w.collected.total)]}
            foot="Source: QuickBooks payments recorded on jobs."
          />
        }
      />
    ),
    "collected-month": () => (
      <DashboardWidget
        id="collected-month"
        accent="green"
        layout="brow"
        head={
          <>
            <div className="binfo">
              {metricHead("Money collected — month to date", fmtMoney(m.collected.total), <>vs last month {fmtMoney(m.collected.prev)} <DeltaBadge val={m.collected.total} prev={m.collected.prev} /></>)}
            </div>
            <VBars last={m.collected.prev} now={m.collected.total} color={CO.green} l1="Prev" l2="MTD" />
            <div className="flex-1 min-w-[160px] text-xs text-slate-500">Month still in progress — pace comparison, not a full-month result.</div>
          </>
        }
        detail={
          <LinkedOrPlain
            dataRows={m.collected.rows}
            title="Payments received this month"
            cols={["Customer", "Invoice #", "Date", "Amount"]}
            align={["", "", "", "r"]}
            rows={m.collected.rows.map((e) => [e.cust, e.inv, e.date, fmtMoney(e.amt)])}
            total={["Month to date", fmtMoney(m.collected.total)]}
          />
        }
      />
    ),
    "ar-panel": () => {
      const segs = [
        { value: ar.buckets.current.reduce((s, x) => s + x.amt, 0), color: CO.grey },
        { value: ar.buckets.b1.reduce((s, x) => s + x.amt, 0), color: CO.blue },
        { value: ar.buckets.b2.reduce((s, x) => s + x.amt, 0), color: CO.amber },
        { value: ar.buckets.b3.reduce((s, x) => s + x.amt, 0), color: CO.orange },
        { value: ar.buckets.b4.reduce((s, x) => s + x.amt, 0), color: CO.red },
      ];
      const bucketList = [
        ["Current (not due)", CO.grey, "not yet due", ar.buckets.current],
        ["1–30 days", CO.blue, "1–30 days", ar.buckets.b1],
        ["31–60 days", CO.amber, "31–60 days", ar.buckets.b2],
        ["61–90 days", CO.orange, "61–90 days", ar.buckets.b3],
        ["90+ days", CO.red, "90+ days", ar.buckets.b4],
      ];
      return (
        <div className="bg-white border border-slate-200 rounded-[14px] shadow-sm border-t-[3px] border-t-red-500 p-3" data-testid="widget-ar-panel">
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <Donut segs={segs} topT={fmtMoneyK(ar.openTotal)} botT="open A/R" />
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
              <DashboardWidget
                id="open-count"
                accent="amber"
                head={metricHead("Open invoices to collect", ar.open.length, fmtMoney(ar.openTotal) + " outstanding")}
                detail={
                  <LinkedOrPlain
                    dataRows={ar.open}
                    title="All open invoices"
                    cols={["Customer", "Invoice #", "Status", "Amount"]}
                    align={["", "", "", "r"]}
                    rows={ar.open.map((x) => [x.cust, x.inv, odPill(x.od), fmtMoney(x.amt)])}
                    total={["Total open A/R", fmtMoney(ar.openTotal)]}
                  />
                }
              />
              <DashboardWidget
                id="overdue-total"
                accent="red"
                head={metricHead("Overdue invoices", fmtMoneyK(ar.overdueTotal), ar.overdueCount + " past due")}
                detail={
                  <LinkedOrPlain
                    dataRows={ar.open.filter((x) => x.od > 0)}
                    title="Overdue invoices"
                    cols={["Customer", "Invoice #", "Overdue", "Amount"]}
                    align={["", "", "", "r"]}
                    rows={ar.open.filter((x) => x.od > 0).map((x) => [x.cust, x.inv, odPill(x.od), fmtMoney(x.amt)])}
                    total={["Total overdue", fmtMoney(ar.overdueTotal)]}
                  />
                }
              />
            </div>
          </div>
          <div className="mt-3 border-t border-slate-100 pt-2 space-y-1">
            {bucketList.map(([name, color, range, list]) => {
              const t = list.reduce((s, x) => s + x.amt, 0);
              const maxV = ar.buckets.current.reduce((s, x) => s + x.amt, 0) || 1;
              return (
                <DashboardWidget
                  key={name}
                  id={"bucket-" + name}
                  accent="grey"
                  head={
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
                      <span className="font-bold text-sm flex-[0_0_128px]">{name}</span>
                      <span className="flex-1 min-w-[40px]">
                        <HBar frac={t / maxV} color={color} />
                      </span>
                      <span className="text-sm font-extrabold tabular-nums">
                        {list.length} inv · {fmtMoney(t)}
                      </span>
                    </div>
                  }
                  detail={
                    <LinkedOrPlain
                      dataRows={list}
                      title={`${name} (${range})`}
                      cols={["Customer", "Invoice #", "Overdue", "Amount"]}
                      align={["", "", "", "r"]}
                      rows={list.map((x) => [x.cust, x.inv, odPill(x.od), fmtMoney(x.amt)])}
                      total={["Bucket total", fmtMoney(t)]}
                    />
                  }
                />
              );
            })}
          </div>
        </div>
      );
    },
    conversion: () => {
      const rate = perf.conversion.sent ? (perf.conversion.won / perf.conversion.sent) * 100 : 0;
      return (
        <DashboardWidget
          id="conversion"
          accent="green"
          head={
            <>
              {metricHead("Estimate → invoice conversion", rate.toFixed(0) + "%", `${perf.conversion.won} of ${perf.conversion.sent} estimates (90d)`)}
              <Funnel
                stages={[
                  { label: "Sent", value: perf.conversion.sent, color: CO.grey },
                  { label: "Invoiced", value: perf.conversion.won, color: CO.green },
                ]}
              />
            </>
          }
          detail={
            <DetailTable
              title="Estimate outcomes — trailing 90 days"
              cols={["Outcome", "Count", "Share"]}
              align={["", "r", "r"]}
              rows={[
                [`<span class="inline-block text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">Invoiced</span>`, String(perf.conversion.won), perf.conversion.sent ? ((perf.conversion.won / perf.conversion.sent) * 100).toFixed(0) + "%" : "—"],
                [`<span class="inline-block text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-red-50 text-red-700">Declined</span>`, String(perf.conversion.declined), perf.conversion.sent ? ((perf.conversion.declined / perf.conversion.sent) * 100).toFixed(0) + "%" : "—"],
                [`<span class="inline-block text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Still pending</span>`, String(perf.conversion.pending), perf.conversion.sent ? ((perf.conversion.pending / perf.conversion.sent) * 100).toFixed(0) + "%" : "—"],
              ]}
              total={["Estimates sent", String(perf.conversion.sent)]}
            />
          }
        />
      );
    },
    "avg-pay": () => (
      <DashboardWidget
        id="avg-pay"
        accent="blue"
        head={
          <>
            {metricHead("Avg invoice → payment time", perf.avgPayDays.toFixed(1), `across ${perf.paidRows.length} paid invoices`)}
            <Gauge value={perf.avgPayDays} max={35} target={15} color={CO.blue} />
            <div className="text-[11px] text-slate-500 mt-1">┆ dashed marker = 15-day target</div>
          </>
        }
        detail={
          <LinkedOrPlain
            dataRows={perf.paidRows}
            title="Days from invoice to payment"
            cols={["Customer", "Invoice #", "Days to pay"]}
            align={["", "", "r"]}
            rows={perf.paidRows.map((x) => [
              x.cust,
              x.inv,
              `<span class="inline-block text-[10px] font-extrabold px-1.5 py-0.5 rounded ${x.days > 21 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}">${x.days}d</span>`,
            ])}
            total={["Average", perf.avgPayDays.toFixed(1) + " days"]}
          />
        }
      />
    ),
    "fast-payers": () => {
      const maxF = perf.fast[0]?.days || 1;
      return (
        <DashboardWidget
          id="fast-payers"
          accent="green"
          head={
            <>
              {metricHead("Fastest-paying customers", (perf.fast[0]?.days || 0).toFixed(1), perf.fast[0]?.cust || "—")}
              <div className="mt-2">
                {perf.fast.slice(0, 5).map((x) => (
                  <HBarRow key={x.cust} name={x.cust} frac={x.days / maxF} color={CO.green} val={x.days.toFixed(1) + "d"} />
                ))}
              </div>
            </>
          }
          detail={
            <DetailTable
              title="Top fastest-paying customers"
              cols={["#", "Customer", "Paid jobs", "Avg days"]}
              align={["", "", "r", "r"]}
              rows={perf.fast.map((x, i) => [
                String(i + 1),
                x.cust,
                String(x.jobs),
                `<span class="inline-block text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">${x.days.toFixed(1)}d</span>`,
              ])}
            />
          }
        />
      );
    },
    "top-customers": () => {
      const maxY = ex.topCust[0]?.ytd || 1;
      return (
        <DashboardWidget
          id="top-customers"
          accent="purple"
          head={
            <>
              <div className="text-[12.5px] text-slate-500 font-bold">Top customers by revenue (YTD)</div>
              <div className="mt-2">
                {ex.topCust.slice(0, 5).map((x) => (
                  <HBarRow key={x.cust} name={x.cust} frac={x.ytd / maxY} color={CO.purple} val={fmtMoneyK(x.ytd)} />
                ))}
              </div>
            </>
          }
          detail={
            <DetailTable
              title="Top customers — MTD + YTD"
              cols={["Customer", "This month", "YTD"]}
              align={["", "r", "r"]}
              rows={ex.topCust.map((x) => [x.cust, x.mtd > 0 ? fmtMoney(x.mtd) : "—", fmtMoney(x.ytd)])}
            />
          }
        />
      );
    },
    "win-trend": () => {
      const last = ex.winTrend[ex.winTrend.length - 1] || { won: 0, sent: 1 };
      const prev = ex.winTrend[ex.winTrend.length - 2] || { won: 0, sent: 1 };
      const wr = (last.won / last.sent) * 100;
      const wrp = (prev.won / prev.sent) * 100;
      return (
        <DashboardWidget
          id="win-trend"
          accent="purple"
          head={
            <>
              {metricHead("Estimate win rate", wr.toFixed(0) + "%", <DeltaBadge val={wr} prev={wrp} />)}
              <Trend vals={ex.winTrend.map((x) => (x.won / x.sent) * 100)} labels={ex.winTrend.map((x) => x.mo)} color={CO.purple} />
            </>
          }
          detail={
            <DetailTable
              title="Win rate by month"
              cols={["Month", "Accepted", "Sent", "Win rate"]}
              align={["", "r", "r", "r"]}
              rows={ex.winTrend.map((x) => [x.mo, String(x.won), String(x.sent), ((x.won / x.sent) * 100).toFixed(0) + "%"])}
            />
          }
        />
      );
    },
    "avg-deal": () => (
      <DashboardWidget
        id="avg-deal"
        accent="purple"
        head={
          <div className="flex gap-3.5">
            <div className="flex-1">
              <div className="text-[11px] text-slate-500 font-bold">Avg estimate (90d)</div>
              <div className="text-2xl font-extrabold">{fmtMoney(ex.avgEst90)}</div>
            </div>
            <div className="flex-1">
              <div className="text-[11px] text-slate-500 font-bold">Avg paid job</div>
              <div className="text-2xl font-extrabold">{fmtMoney(ex.avgPaid90)}</div>
            </div>
          </div>
        }
        detail={
          <DetailTable
            title="Average deal size"
            cols={["Metric", "Basis", "Value"]}
            align={["", "", "r"]}
            rows={[
              ["Avg estimate value", "Trailing 90 days", fmtMoney(ex.avgEst90)],
              ["Avg paid job value", "From payment history", fmtMoney(ex.avgPaid90)],
            ]}
          />
        }
      />
    ),
    "chase-list": () => {
      const maxC = ex.chase[0]?.amt || 1;
      return (
        <DashboardWidget
          id="chase-list"
          accent="red"
          head={
            <>
              <div className="text-[12.5px] text-slate-500 font-bold">Chase list — who owes the most</div>
              <div className="mt-2">
                {ex.chase.slice(0, 5).map((x) => {
                  const c = x.oldest > 60 ? CO.red : x.oldest > 30 ? CO.amber : CO.grey;
                  return <HBarRow key={x.cust} name={x.cust} frac={x.amt / maxC} color={c} val={fmtMoneyK(x.amt)} />;
                })}
              </div>
            </>
          }
          detail={
            <DetailTable
              title="Outstanding by customer"
              cols={["Customer", "Inv", "Oldest overdue", "Outstanding"]}
              align={["", "r", "r", "r"]}
              rows={ex.chase.map((x) => [x.cust, String(x.invs), odPill(x.oldest), fmtMoney(x.amt)])}
              total={["Total on chase list", fmtMoney(ex.chase.reduce((s, x) => s + x.amt, 0))]}
            />
          }
        />
      );
    },
    forecast: () => {
      const total = ex.forecast.reduce((s, x) => s + x.amt, 0);
      return (
        <DashboardWidget
          id="forecast"
          accent="blue"
          head={
            <>
              {metricHead("Expected collections — next 30 days", fmtMoney(total), "")}
              <StackBar segs={ex.forecast.map((x) => ({ value: x.amt, color: x.color }))} />
            </>
          }
          detail={
            <DetailTable
              title="Where the next 30 days of cash comes from"
              cols={["Source", "Note", "Amount"]}
              align={["", "", "r"]}
              rows={ex.forecast.map((x) => [x.label, x.note, fmtMoney(x.amt)])}
              total={["Forecast collections", fmtMoney(total)]}
              foot="Forecast, not a guarantee."
            />
          }
        />
      );
    },
    "leads-week": () => {
      const n = ex.leadsWeek.length;
      const conv = ex.leadsWeek.filter((l) => l.est === "Yes").length;
      return (
        <DashboardWidget
          id="leads-week"
          accent="green"
          head={
            <>
              {metricHead("New leads this week", n, <>vs {ex.leadsPrev} last week · lead → estimate {n ? ((conv / n) * 100).toFixed(0) : 0}%</>)}
              <Funnel
                stages={[
                  { label: "Leads", value: n || 1, color: CO.green },
                  { label: "Estimates", value: conv, color: CO.gd },
                ]}
              />
            </>
          }
          detail={
            <DetailTable
              title="New leads this week"
              cols={["Customer", "Source", "Estimate sent?"]}
              rows={ex.leadsWeek.map((x) => [
                x.cust,
                x.src,
                x.est === "Yes"
                  ? '<span class="inline-block text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">Yes</span>'
                  : '<span class="inline-block text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Not yet</span>',
              ])}
              total={["Lead → estimate", conv + " of " + n]}
            />
          }
        />
      );
    },
    "pipeline-panel": () => {
      const p = data.pipeline;
      const maxPhase = Math.max(1, ...p.phases.map((x) => x.count));
      return (
        <div
          className="bg-white border border-slate-200 rounded-[14px] shadow-sm border-t-[3px] border-t-blue-500 p-3"
          data-testid="widget-pipeline-panel"
        >
          <div className="flex items-baseline gap-2 flex-wrap">
            <div className="text-[28px] font-extrabold tracking-tight leading-none">{p.activeCount}</div>
            <div className="text-[12.5px] text-slate-500 font-bold">
              open job{p.activeCount === 1 ? "" : "s"} · {fmtMoneyK(p.activeAmt)} in flight
            </div>
          </div>
          {/* Phase roll-up first — five rows a phone can read at a glance. */}
          <div className="mt-3 space-y-1">
            {p.phases.map((ph) => (
              <DashboardWidget
                key={ph.nm}
                id={"phase-" + ph.nm}
                accent="grey"
                head={
                  <div className="flex items-center gap-2">
                    <span className="text-base shrink-0">{ph.ic}</span>
                    <span className="font-bold text-sm flex-[0_0_92px] sm:flex-[0_0_128px]">{ph.nm}</span>
                    <span className="flex-1 min-w-[30px]">
                      <HBar frac={ph.count / maxPhase} color={CO.blue} />
                    </span>
                    <span className="text-sm font-extrabold tabular-nums shrink-0">
                      {ph.count} · {fmtMoneyK(ph.amt)}
                    </span>
                  </div>
                }
                detail={
                  <DetailTable
                    title={`${ph.nm} — jobs waiting by stage`}
                    cols={["Stage", "Jobs", "Value"]}
                    align={["", "r", "r"]}
                    rows={ph.stages.map((s) => [s.stage, String(s.count), fmtMoney(s.amt)])}
                    total={["Phase total", fmtMoney(ph.amt)]}
                    foot="A job counts once, against the stage it is waiting on."
                  />
                }
              />
            ))}
          </div>
        </div>
      );
    },
    "requisition-progress": () => {
      const r = data.requisitions;
      if (!r || !r.rows.length) {
        return (
          <div
            className="bg-white border border-slate-200 rounded-[14px] shadow-sm border-t-[3px] border-t-purple-500 p-4 text-sm text-slate-500"
            data-testid="widget-requisition-progress"
          >
            No requisition projects yet. Start one from the <b className="text-slate-700">Requisition</b> tab to
            track per-item % completion here.
          </div>
        );
      }
      return (
        <div
          className="bg-white border border-slate-200 rounded-[14px] shadow-sm border-t-[3px] border-t-purple-500 p-3"
          data-testid="widget-requisition-progress"
        >
          <div className="flex items-baseline gap-2 flex-wrap">
            <div className="text-[28px] font-extrabold tracking-tight leading-none">{r.pct.toFixed(0)}%</div>
            <div className="text-[12.5px] text-slate-500 font-bold">
              complete across {r.rows.length} project{r.rows.length === 1 ? "" : "s"} ·{" "}
              {fmtMoneyK(r.outstanding)} earned not yet paid
            </div>
          </div>
          <div className="mt-3 space-y-1">
            {r.rows.map((row) => (
              <DashboardWidget
                key={row.id || row.name}
                id={"req-" + (row.id || row.name)}
                accent="grey"
                head={
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm flex-[0_0_92px] sm:flex-[0_0_150px] truncate">{row.name}</span>
                    <span className="flex-1 min-w-[30px]">
                      <HBar frac={row.pct / 100} color={CO.purple} />
                    </span>
                    <span className="text-sm font-extrabold tabular-nums shrink-0">{row.pct.toFixed(0)}%</span>
                  </div>
                }
                detail={
                  <DetailTable
                    title={row.name}
                    cols={["Measure", "Amount"]}
                    align={["", "r"]}
                    rows={[
                      ["Scheduled value (incl. change orders)", fmtMoney(row.scheduled)],
                      ["Completed to date", fmtMoney(row.completed)],
                      ["Paid to date", fmtMoney(row.paid)],
                      ["Earned, not yet paid", fmtMoney(row.outstanding)],
                      ["Requisitions submitted", String(row.reqCount)],
                    ]}
                    total={["% complete", row.pct.toFixed(1) + "%"]}
                    foot="% complete is dollar-weighted across all SOV line items."
                  />
                }
              />
            ))}
          </div>
        </div>
      );
    },
    "revenue-mix": () => null,
  };

  return builders;
}

function CompanyInfoSettings({ showToast }) {
  const settings = useAppSettings();
  const logoInputRef = useRef(null);
  const [logoBusy, setLogoBusy] = useState(false);

  const onLogoPick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setLogoBusy(true);
    try {
      const dataUrl = await readLogoFileAsDataUrl(file);
      setCompanyLogoDataUrl(dataUrl);
      applyCompanyLogoToActiveConfig(dataUrl);
      showToast?.("Company logo updated — used on invoices right away");
    } catch {
      showToast?.("Couldn’t read that image — try another file");
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm space-y-3" data-testid="company-info-settings">
      <div>
        <h2 className="text-sm font-extrabold text-slate-900 m-0">Company info</h2>
        <p className="text-xs text-slate-500 mt-0.5">Logo and app settings for this device</p>
      </div>

      <div className="flex items-start gap-3" data-testid="company-logo-row">
        <div className="w-16 h-16 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
          <img
            src={settings.logoSrc}
            alt="Company logo"
            className="max-w-full max-h-full object-contain"
            data-testid="company-logo-preview"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-800">Company logo</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {settings.logoCustom ? "Custom file on this device" : "Default logo file"}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <label className="btn !py-1.5 !px-2.5 text-[11px] bg-slate-100 text-slate-800 cursor-pointer">
              {logoBusy ? "Loading…" : "Change logo"}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onLogoPick}
                disabled={logoBusy}
                data-testid="company-logo-file"
              />
            </label>
            {settings.logoCustom ? (
              <button
                type="button"
                className="btn-ghost !py-1.5 !px-2.5 text-[11px]"
                onClick={() => {
                  clearCompanyLogo();
                  applyCompanyLogoToActiveConfig("");
                  showToast?.("Restored default logo");
                }}
                data-testid="company-logo-reset"
              >
                Use default
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className="flex items-center gap-3 pt-2 border-t border-slate-100"
        data-testid="speech-to-text-setting"
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-800">Speech to text</div>
          <div className="text-xs text-slate-500 mt-0.5">
            Green voice bubble + chat mic. Turn off to hide them.
          </div>
        </div>
        <Toggle
          on={settings.speechToText}
          onChange={(on) => {
            setSpeechToTextEnabled(on);
            showToast?.(on ? "Speech to text on" : "Speech to text off");
          }}
          label="Speech to text"
        />
      </div>
    </div>
  );
}

export default function Company() {
  const { jobs, events, syncedAt, eventsSyncedAt, syncNow, pullCalendarNow, busy, showToast } = useStore();
  const [calBusy, setCalBusy] = useState(false);
  const config = useTenantConfig();
  const product = tenantChrome(config).product;
  const internal = config.internal === true;
  const settings = useAppSettings();

  // Requisition progress is the one report sourced outside the jobs/calendar
  // sync. Only fetch it when the tenant actually has the module — an off
  // module should cost them nothing, not even a request.
  const wantsRequisitions = sectionsForTenant(config).some((s) => s.key === "requisitions");
  const [projects, setProjects] = useState(null);
  useEffect(() => {
    if (!wantsRequisitions) return;
    let alive = true;
    (async () => {
      const raw = await api.getProjects?.().catch(() => ({ list: [] }));
      if (alive) setProjects(normalizeProjects(raw));
    })();
    return () => {
      alive = false;
    };
  }, [wantsRequisitions]);

  const data = useMemo(() => {
    const base = buildCompanyMetrics(jobs, events);
    return { ...base, requisitions: projects ? requisitionPortfolio(projects) : null };
  }, [jobs, events, projects]);

  const refreshQbo = async () => {
    showToast("Refreshing QuickBooks…");
    await syncNow();
    showToast("QuickBooks data updated");
  };

  const refreshCal = async () => {
    setCalBusy(true);
    showToast("Refreshing calendar…");
    try {
      await pullCalendarNow();
      showToast("Calendar updated");
    } finally {
      setCalBusy(false);
    }
  };
  const builders = useMemo(() => buildWidgets(data), [data]);

  // Sections AND the widgets inside them come from the same tenant-gated
  // registry, so an internal-only report cannot leak in via a stray heading.
  const sections = useMemo(() => sectionsForTenant(config), [config]);

  const renderSection = (s) => (
    <React.Fragment key={s.key}>
      <div className="flex items-baseline gap-2 mt-4 mb-2 px-0.5">
        <h2 className="text-[13.5px] uppercase tracking-wide text-slate-500 font-extrabold m-0">
          {s.key === "week" ? `${s.title} · ${data.weekLabel}` : s.title}
        </h2>
        {s.subtitle ? <span className="text-[11.5px] text-slate-400 font-semibold">{s.subtitle}</span> : null}
      </div>
      <div className={COMPANY_SECTIONS[s.key]}>
        {widgetsForSection(s.key, config).map((cfg) => (
          <div key={cfg.id}>{builders[cfg.id]?.()}</div>
        ))}
      </div>
    </React.Fragment>
  );

  return (
    <div className="space-y-1 pb-4" data-testid="company-dashboard">
      <div className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-[#f4f6f8]/90 backdrop-blur border-b border-slate-200/80 mb-2">
        <div className="flex items-center gap-2.5">
          <img
            src={settings.logoSrc}
            alt={product}
            className="w-9 h-9 rounded-lg object-contain bg-white border border-slate-200 shadow-sm"
            data-testid="company-header-logo"
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-extrabold tracking-tight m-0">Reports</h1>
            <div className="text-xs text-slate-500 truncate">{product} · Business overview</div>
          </div>
          <div className="text-xs font-extrabold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full shrink-0">
            {fmtMoneyK(data.ar.openTotal)} open A/R
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-[11px] px-3 py-2.5 mt-2 text-xs text-slate-500 shadow-sm space-y-2">
          <div className="flex gap-2 items-start">
            <span className="text-base">🔄</span>
            <span>
              Live from <b className="text-slate-800">QuickBooks</b> + <b className="text-slate-800">Google Calendar</b>. Tap any card for detail.
              {/* Raw record counts are a sync diagnostic, not a report. */}
              {internal ? ` ${data.sources.jobs} jobs · ${data.sources.events} calendar events.` : ""}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn !py-1.5 !px-2.5 text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200"
              onClick={refreshQbo}
              disabled={busy}
              data-testid="company-refresh-qbo"
            >
              ↻ QuickBooks{syncedAt ? " · " + ago(syncedAt) : ""}
            </button>
            <button
              type="button"
              className="btn !py-1.5 !px-2.5 text-[11px] bg-blue-50 text-blue-800 border border-blue-200"
              onClick={refreshCal}
              disabled={calBusy || busy}
              data-testid="company-refresh-cal"
            >
              ↻ Calendar{eventsSyncedAt ? " · " + ago(eventsSyncedAt) : ""}
            </button>
          </div>
        </div>
      </div>

      {sections.map(renderSection)}

      <div className="mt-4 px-0.5">
        <h2 className="text-[13.5px] uppercase tracking-wide text-slate-500 font-extrabold mb-2">Where the data comes from</h2>
        <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-500 shadow-sm space-y-2">
          <div className="flex gap-2">
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 shrink-0">QBO</span>
            <span>QuickBooks — estimates, invoices, payments and A/R aging from your synced jobs.</span>
          </div>
          <div className="flex gap-2">
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 shrink-0">CAL</span>
            <span>Google Calendar — appointments booked (site visits, installs, service calls).</span>
          </div>
          <div className="flex gap-2">
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 shrink-0">DISP</span>
            <span>{product} computes the aging buckets, pipeline and requisition totals on top.</span>
          </div>
        </div>
      </div>

      {/*
        Device settings, not a report — kept on this page because it is where
        the logo lives today, but moved below the reports so the top of Reports
        is reports. (Its natural home is Settings; moving it there touches a
        view another session may be in, so it is left for a follow-up.)
      */}
      <div className="mt-4">
        <CompanyInfoSettings showToast={showToast} />
      </div>
    </div>
  );
}