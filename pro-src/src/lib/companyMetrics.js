// Company dashboard metrics — computed from live jobs (QBO sync) + calendar events.
import { parseAmount } from "./format.js";
import { normalizePayments } from "./payments.js";
import { openBalance, invoiceTotal } from "./customers.js";
import { stageOf, stepState } from "./stages.js";
import { productName } from "./tenantBranding.js";

const NET_TERMS_DAYS = 7;

function parseYmd(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

function daysBetween(a, b) {
  const da = parseYmd(a);
  const db = parseYmd(b);
  if (!da || !db) return null;
  return Math.round((db - da) / 86400000);
}

function startOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function inRange(ymd, start, end) {
  const d = parseYmd(ymd);
  if (!d) return false;
  return d >= start && d < end;
}

function weekRanges(now = new Date()) {
  const thisStart = startOfWeek(now);
  const thisEnd = new Date(thisStart);
  thisEnd.setDate(thisEnd.getDate() + 7);
  const lastStart = new Date(thisStart);
  lastStart.setDate(lastStart.getDate() - 7);
  return { thisStart, thisEnd, lastStart, lastEnd: thisStart };
}

function monthRanges(now = new Date()) {
  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd = mtdStart;
  return { mtdStart, now, prevStart, prevEnd };
}

function stageDate(job, stage) {
  return (job.status || {})[stage]?.d || "";
}

function jobAmt(job) {
  return invoiceTotal(job) || parseAmount(job.amount);
}

function allPayments(jobs) {
  const out = [];
  for (const j of jobs || []) {
    for (const p of normalizePayments(j)) {
      const amt = parseAmount(p.amount);
      if (amt <= 0) continue;
      out.push({
        cust: j.customer || j.businessName || "—",
        inv: j.invoiceNo ? "INV-" + j.invoiceNo : "—",
        amt,
        date: p.date || stageDate(j, "Paid") || "",
        method: p.method || "—",
        jobId: j.id,
      });
    }
  }
  return out;
}

function estimateRows(jobs, start, end) {
  return (jobs || [])
    .filter((j) => j.estimateNo && inRange(stageDate(j, "Estimate") || stageDate(j, "Site Visit"), start, end))
    .map((j) => ({
      cust: j.customer || "—",
      n: "EST-" + j.estimateNo,
      amt: jobAmt(j),
      date: stageDate(j, "Estimate") || stageDate(j, "Site Visit"),
      scope: j.title || "—",
      jobId: j.id,
      doc: "estimate",
    }));
}

function invoiceRows(jobs, start, end) {
  return (jobs || [])
    .filter((j) => j.invoiceNo && inRange(stageDate(j, "Invoiced") || stageDate(j, "Accepted"), start, end))
    .map((j) => ({
      cust: j.customer || "—",
      n: "INV-" + j.invoiceNo,
      amt: jobAmt(j),
      date: stageDate(j, "Invoiced") || stageDate(j, "Accepted"),
      from: j.estimateNo ? "EST-" + j.estimateNo : "—",
      jobId: j.id,
      doc: "invoice",
    }));
}

function apptRows(events, start, end) {
  return (events || [])
    .filter((e) => {
      const booked = (e.created || e.start || "").slice(0, 10);
      return inRange(booked, start, end);
    })
    .map((e) => ({
      type: (e.summary || "").split("—")[0].trim() || "Appointment",
      cust: (e.summary || "").split("—").pop()?.trim() || e.summary || "—",
      when: e.start ? new Date(e.start).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—",
      booked: (e.start || "").slice(5, 10).replace("-", "/"),
    }));
}

function collectedRows(payments, start, end) {
  return payments.filter((p) => inRange(p.date, start, end));
}

function openInvoices(jobs, today) {
  const open = [];
  for (const j of jobs || []) {
    if (j.paid) continue;
    const bal = openBalance(j);
    if (bal <= 0 && !j.invoiceNo) continue;
    const invDate = stageDate(j, "Invoiced") || stageDate(j, "Accepted");
    const due = invDate ? addDays(invDate, NET_TERMS_DAYS) : "";
    const od = due ? Math.max(0, daysBetween(due, today) || 0) : 0;
    let bucket = "current";
    if (od > 90) bucket = "b4";
    else if (od > 60) bucket = "b3";
    else if (od > 30) bucket = "b2";
    else if (od > 0) bucket = "b1";
    open.push({
      inv: j.invoiceNo ? "INV-" + j.invoiceNo : "—",
      cust: j.customer || "—",
      amt: bal > 0 ? bal : jobAmt(j),
      due: due || "—",
      od,
      bucket,
      jobId: j.id,
    });
  }
  return open;
}

function addDays(ymd, n) {
  const d = parseYmd(ymd);
  if (!d) return "";
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function sumAmt(arr, key = "amt") {
  return arr.reduce((s, x) => s + (key ? x[key] : x), 0);
}

function monthKey(ymd) {
  const d = parseYmd(ymd);
  if (!d) return "";
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
}

/** Build the full company dashboard dataset from jobs + calendar. */
export function buildCompanyMetrics(jobs, events, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const { thisStart, thisEnd, lastStart, lastEnd } = weekRanges(now);
  const { mtdStart, prevStart, prevEnd } = monthRanges(now);
  const payments = allPayments(jobs);

  const estThis = estimateRows(jobs, thisStart, thisEnd);
  const estLast = estimateRows(jobs, lastStart, lastEnd);
  const invThis = invoiceRows(jobs, thisStart, thisEnd);
  const invLast = invoiceRows(jobs, lastStart, lastEnd);
  const apptThis = apptRows(events, thisStart, thisEnd);
  const apptLast = apptRows(events, lastStart, lastEnd);
  const collThis = collectedRows(payments, thisStart, thisEnd);
  const collLast = collectedRows(payments, lastStart, lastEnd);
  const collMtd = collectedRows(payments, mtdStart, now);
  const collPrevMonth = collectedRows(payments, prevStart, prevEnd);

  const open = openInvoices(jobs, today);
  const bl = (b) => open.filter((x) => x.bucket === b);
  const overdue = open.filter((x) => x.od > 0);

  // Conversion: estimates with invoice in trailing 90d
  const since90 = new Date(now);
  since90.setDate(since90.getDate() - 90);
  const est90 = (jobs || []).filter((j) => j.estimateNo && parseYmd(stageDate(j, "Estimate")) >= since90);
  const convWon = est90.filter((j) => j.invoiceNo).length;
  const convSent = est90.length;
  const convPending = est90.filter((j) => !j.invoiceNo && !j.paid && stageOf(j) !== "Paid").length;
  const convDeclined = Math.max(0, convSent - convWon - convPending);

  // Payment speed
  const paidRows = [];
  for (const j of jobs || []) {
    if (!j.invoiceNo) continue;
    const invD = stageDate(j, "Invoiced");
    const pays = normalizePayments(j);
    const lastPay = pays.find((p) => parseAmount(p.amount) > 0);
    if (!lastPay?.date || !invD) continue;
    const days = daysBetween(invD, lastPay.date);
    if (days == null || days < 0) continue;
    paidRows.push({ inv: "INV-" + j.invoiceNo, cust: j.customer || "—", days, jobId: j.id, doc: "invoice" });
  }
  paidRows.sort((a, b) => a.days - b.days);
  const avgPay = paidRows.length ? paidRows.reduce((s, x) => s + x.days, 0) / paidRows.length : 0;

  // Fastest payers by customer
  const byCust = {};
  for (const r of paidRows) {
    if (!byCust[r.cust]) byCust[r.cust] = { days: [], jobs: 0 };
    byCust[r.cust].days.push(r.days);
    byCust[r.cust].jobs++;
  }
  const fast = Object.entries(byCust)
    .map(([cust, v]) => ({ cust, days: v.days.reduce((a, b) => a + b, 0) / v.days.length, jobs: v.jobs }))
    .sort((a, b) => a.days - b.days)
    .slice(0, 10);

  // Top customers YTD
  const ytdStart = new Date(now.getFullYear(), 0, 1);
  const byRev = {};
  for (const p of payments) {
    if (!inRange(p.date, ytdStart, now)) continue;
    byRev[p.cust] = (byRev[p.cust] || 0) + p.amt;
  }
  const topCust = Object.entries(byRev)
    .map(([cust, ytd]) => ({
      cust,
      ytd,
      mtd: collMtd.filter((x) => x.cust === cust).reduce((s, x) => s + x.amt, 0),
    }))
    .sort((a, b) => b.ytd - a.ytd)
    .slice(0, 8);

  // Win rate by month (6 mo)
  const winTrend = [];
  for (let i = 5; i >= 0; i--) {
    const ms = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const me = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const sent = (jobs || []).filter((j) => j.estimateNo && inRange(stageDate(j, "Estimate"), ms, me)).length;
    const won = (jobs || []).filter(
      (j) => j.estimateNo && j.invoiceNo && inRange(stageDate(j, "Estimate"), ms, me)
    ).length;
    winTrend.push({ mo: monthKey(ms.toISOString()), won, sent: sent || 1 });
  }

  // Chase list
  const chaseMap = {};
  for (const x of overdue) {
    if (!chaseMap[x.cust]) chaseMap[x.cust] = { amt: 0, oldest: 0, invs: 0 };
    chaseMap[x.cust].amt += x.amt;
    chaseMap[x.cust].oldest = Math.max(chaseMap[x.cust].oldest, x.od);
    chaseMap[x.cust].invs++;
  }
  const chase = Object.entries(chaseMap)
    .map(([cust, v]) => ({ cust, ...v }))
    .sort((a, b) => b.amt - a.amt)
    .slice(0, 10);

  // Leads this week
  const leadsWeek = (jobs || [])
    .filter((j) => inRange(stageDate(j, "Lead"), thisStart, thisEnd) || (stepState(j, "Lead") && !j.estimateNo && inRange(j.id?.slice(0, 10), thisStart, thisEnd)))
    .filter((j) => stepState(j, "Lead") === "done" || stepState(j, "Lead") === "current")
    .map((j) => ({
      cust: j.customer || "—",
      // Display fallback only — a lead with no recorded source is shown as
      // having come from the app itself. Not persisted.
      src: j.leadSource || productName(),
      est: j.estimateNo ? "Yes" : "No",
    }));
  const leadsLast = (jobs || []).filter((j) => inRange(stageDate(j, "Lead"), lastStart, lastEnd)).length;

  const scheduledJobs = (jobs || []).filter((j) => stepState(j, "Scheduled") === "done" || stepState(j, "Scheduled") === "current");
  const forecast = [
    { label: "Overdue A/R likely to land (est. 70%)", amt: Math.round(sumAmt(overdue) * 0.7), note: "Chase-list follow-ups", color: "#e8940c" },
    { label: "Current invoices due within 30 days", amt: sumAmt(bl("current")), note: "Already invoiced in QBO", color: "#2f7de1" },
    { label: "Scheduled jobs to invoice on completion", amt: sumAmt(scheduledJobs.map((j) => ({ amt: jobAmt(j) }))), note: "Booked on Calendar", color: "#1DB954" },
  ];

  const avgEst90 =
    est90.length > 0 ? est90.reduce((s, j) => s + jobAmt(j), 0) / est90.length : estThis.length ? sumAmt(estThis) / estThis.length : 0;
  const avgPaid90 = paidRows.length ? paidRows.reduce((s, x) => s + jobAmt(jobs.find((j) => j.customer === x.cust) || {}), 0) / paidRows.length : 0;

  const weekLabel = `${thisStart.toLocaleDateString([], { month: "short", day: "numeric" })} – ${new Date(thisEnd.getTime() - 86400000).toLocaleDateString([], { month: "short", day: "numeric" })}`;

  return {
    generatedAt: now.toISOString(),
    weekLabel,
    sources: { jobs: (jobs || []).length, events: (events || []).length },
    week: {
      estimates: { rows: estThis, count: estThis.length, prev: estLast.length, amt: sumAmt(estThis) },
      invoices: { rows: invThis, count: invThis.length, prev: invLast.length, amt: sumAmt(invThis) },
      appointments: { rows: apptThis, count: apptThis.length, prev: apptLast.length },
      collected: { rows: collThis, total: sumAmt(collThis), prev: sumAmt(collLast) },
    },
    month: {
      collected: { rows: collMtd, total: sumAmt(collMtd), prev: sumAmt(collPrevMonth) },
    },
    ar: {
      open,
      openTotal: sumAmt(open),
      overdueTotal: sumAmt(overdue),
      overdueCount: overdue.length,
      buckets: { current: bl("current"), b1: bl("b1"), b2: bl("b2"), b3: bl("b3"), b4: bl("b4") },
    },
    performance: {
      conversion: { sent: convSent, won: convWon, pending: convPending, declined: convDeclined },
      avgPayDays: avgPay,
      paidRows: paidRows.slice(0, 10),
      fast,
    },
    extras: {
      topCust,
      winTrend,
      chase,
      forecast,
      leadsWeek,
      leadsPrev: leadsLast,
      avgEst90,
      avgPaid90: avgPaid90 || (paidRows.length ? sumAmt(paidRows.map((r) => ({ amt: r.days }))) / paidRows.length : 0),
      jobTypes: [], // no job-type taxonomy in QBO sync yet
    },
    stubs: ["jobTypes", leadsWeek.length === 0 ? "leadsWeek" : null].filter(Boolean),
  };
}

export function fmtMoney(n) {
  const v = Math.round(Number(n) || 0);
  return "$" + v.toLocaleString("en-US");
}

export function fmtMoneyK(n) {
  n = Number(n) || 0;
  if (Math.abs(n) >= 1000) {
    const v = n / 1000;
    return "$" + (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)) + "k";
  }
  return fmtMoney(n);
}