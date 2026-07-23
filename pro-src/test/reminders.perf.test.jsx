// @vitest-environment jsdom
// Perf probe for the Reminders route (opt-in: PERF_AUDIT=1). Measures the
// main-thread commit cost of (a) a background store poll while on Reminders and
// (b) a snooze, at N jobs — to see what blocks the slider/snooze.
import React, { Profiler } from "react";
import { render, act, waitFor, fireEvent, screen, cleanup, within } from "@testing-library/react";
import { HashRouter } from "react-router-dom";
import { afterEach, test } from "vitest";
import App from "../src/App.jsx";
import { StoreProvider } from "../src/state/store.jsx";
import { TenantProvider } from "../src/state/tenant.jsx";
import { mockServer } from "./helpers.jsx";

const N = Number(process.env.PERF_JOBS || 4000);
const runPerf = process.env.PERF_AUDIT ? test : test.skip;

function makeJobs(n) {
  const a = [];
  for (let i = 0; i < n; i++) a.push({
    id: "J-" + i, customer: "Cust " + (i % 800), businessName: "Cust " + (i % 800),
    personName: "Person " + (i % 700), title: "Panel upgrade",
    invoiceNo: i % 2 ? String(250000 + i) : "", estimateNo: i % 4 ? "E-" + i : "",
    amount: "$" + (i % 9000), openBalance: i % 3 ? i % 9000 : 0,
    serviceAddress: (i % 900) + " Main St", address: (i % 900) + " Main St",
    phone: "718555" + String(1000 + (i % 9000)), email: "c" + (i % 800) + "@x.com",
    paid: i % 3 === 0, status: { Lead: { s: "done", d: "2026-06-29" } }, updatedAt: 1719000000000 + i,
  });
  return a;
}
function makeEvents(m) {
  const a = [];
  for (let i = 0; i < m; i++) a.push({ id: "ev" + i, summary: "Estimate — Cust " + (i % 800), start: "2026-07-10T10:00", location: (i % 900) + " Main St", description: "c" + i + "@x.com" });
  return a;
}

afterEach(() => cleanup());

runPerf(`PERF reminders: ${N} jobs`, async () => {
  const commits = [];
  let label = "mount";
  const onRender = (id, phase, actual) => commits.push({ label, actual });
  const report = (l) => { const r = commits.filter((c) => c.label === l); return { commits: r.length, totalMs: +r.reduce((s, x) => s + x.actual, 0).toFixed(1), maxMs: +r.reduce((s, x) => Math.max(s, x.actual), 0).toFixed(1) }; };

  const srv = mockServer({ jobs: makeJobs(N), events: makeEvents(120) });
  window.location.hash = "#/reminders";
  await act(async () => {
    render(<Profiler id="app" onRender={onRender}><HashRouter><StoreProvider><TenantProvider><App /></TenantProvider></StoreProvider></HashRouter></Profiler>);
  });
  await waitFor(() => { if (!document.querySelector('[data-testid="reminders-view"]')) throw new Error("no reminders"); }, { timeout: 8000 });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

  const results = [];
  results.push({ what: "MOUNT reminders", ...report("mount") });

  // A background command poll (setCommands) — the every-3-8s hitch.
  label = "poll";
  await act(async () => { srv.state.commands = [{ id: "cX", type: "noop", status: "queued", jobId: "J-1", ts: Date.now() }]; await new Promise((r) => setTimeout(r, 20)); });
  // force a refresh by dispatching visibility (calls refreshCommands)
  label = "poll";
  await act(async () => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); await new Promise((r) => setTimeout(r, 120)); });
  results.push({ what: "background poll commit", ...report("poll") });

  // Open pause sheet + drag the slider.
  const pauseBtn = document.querySelector('[data-testid="pause-reminders-btn"]');
  if (pauseBtn) {
    await act(async () => { fireEvent.click(pauseBtn); });
    const slider = document.querySelector('[data-testid="pause-slider"]');
    label = "slider";
    const s = performance.now();
    await act(async () => { for (const v of [30, 45, 60, 75, 90]) fireEvent.change(slider, { target: { value: String(v) } }); });
    results.push({ what: "slider drag (5 steps)", wallMs: +(performance.now() - s).toFixed(1), ...report("slider") });
  } else results.push({ what: "pause btn not found" });

  // Snooze the first reminder row.
  const head = document.querySelector('[data-testid^="reminder-headline-"]');
  if (head) {
    await act(async () => { fireEvent.click(head); }); // expand
    const snoozeBtn = Array.from(document.querySelectorAll("button")).find((b) => /snooze/i.test(b.textContent || ""));
    if (snoozeBtn) {
      label = "snooze";
      const s = performance.now();
      await act(async () => { fireEvent.click(snoozeBtn); });
      await act(async () => { await Promise.resolve(); });
      results.push({ what: "snooze click", wallMs: +(performance.now() - s).toFixed(1), ...report("snooze") });
    } else results.push({ what: "snooze btn not found (expanded row)" });
  } else results.push({ what: "no reminder rows" });

  let out = `\n===== REMINDERS PERF (N=${N}) =====\n`;
  for (const r of results) out += JSON.stringify(r) + "\n";
  // eslint-disable-next-line no-console
  console.log(out);
}, 60000);
