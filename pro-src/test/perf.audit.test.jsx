// @vitest-environment jsdom
// PERF AUDIT HARNESS (temporary). Mounts the real App with N synthetic jobs,
// wraps it in a React Profiler, and measures render cost + commit counts for
// mount, background polls, and presses. Not a pass/fail test — it prints a
// timing report so we can compare before/after a fix.
import React, { Profiler } from "react";
import { render, act, waitFor, fireEvent, screen, cleanup } from "@testing-library/react";
import { HashRouter } from "react-router-dom";
import { afterEach, test, vi } from "vitest";
import App from "../src/App.jsx";
import { StoreProvider } from "../src/state/store.jsx";
import { TenantProvider } from "../src/state/tenant.jsx";
import { mockServer } from "./helpers.jsx";

const N = Number(process.env.PERF_JOBS || 4000);

const FIRST = ["Acme", "Blue", "Crown", "Delta", "Eagle", "Ford", "Green", "Hill", "Iron", "Jade", "King", "Lion", "Maple", "North", "Oak", "Peak", "Quartz", "River", "Stone", "Titan"];
const LAST = ["Electric", "Builders", "Realty", "Management", "Holdings", "Corp", "Group", "Partners", "Associates", "Services", "Construction", "Properties", "Development", "Contracting", "Industries"];
const PERSON = ["Chein", "Smith", "Gold", "Katz", "Weiss", "Green", "Klein", "Stern", "Adler", "Berg", "Cohen", "Diamond", "Roth", "Stein", "Wolf"];

function makeJobs(n) {
  const jobs = [];
  // ~40% of jobs share customers to build real groups; sprinkle qboCustomerId
  // and parent/sub relationships so the Jobs grouping code does real work.
  const custCount = Math.floor(n * 0.6);
  for (let i = 0; i < n; i++) {
    const c = i < custCount ? i : i % custCount; // reuse customers for the tail
    const biz = `${FIRST[c % FIRST.length]} ${LAST[(c * 7) % LAST.length]} ${c}`;
    const person = `${PERSON[c % PERSON.length]}`;
    const hasInv = i % 2 === 0;
    const paid = i % 3 === 0;
    const amt = ((i * 137) % 9000) + 100;
    jobs.push({
      id: "J-" + i,
      customer: biz,
      businessName: biz,
      personName: person,
      title: ["Panel upgrade", "Outlet swap", "Service call", "Rewire", "Inspection fix"][i % 5],
      amount: "$" + amt.toLocaleString(),
      openBalance: paid ? 0 : amt,
      invoiceNo: hasInv ? String(250000 + i) : "",
      estimateNo: i % 4 === 0 ? "E-" + i : "",
      qboCustomerId: i % 5 === 0 ? "QBO-" + c : "",
      phone: "718-555-" + String(1000 + (i % 9000)).padStart(4, "0"),
      email: `c${c}@x.com`,
      address: `${100 + (i % 900)} Main St, Brooklyn`,
      serviceAddress: `${100 + (i % 900)} Main St, Brooklyn`,
      billingAddress: `${200 + (i % 800)} Lefferts Ave`,
      paid,
      notes: "",
      invoiceHistory: [],
      status: {
        Lead: { s: "done", d: "2026-06-29" },
        ...(hasInv ? { Invoiced: { s: "done", d: "2026-07-01" } } : {}),
        ...(paid ? { Paid: { s: "done", d: "2026-07-05" } } : {}),
      },
      updatedAt: 1719000000000 + i * 1000,
    });
  }
  return jobs;
}

function makeProfiler() {
  const commits = [];
  let windowLabel = "mount";
  const onRender = (id, phase, actualDuration) => {
    commits.push({ label: windowLabel, phase, actualDuration });
  };
  const setLabel = (l) => { windowLabel = l; };
  const report = (label) => {
    const rows = commits.filter((c) => c.label === label);
    const total = rows.reduce((s, r) => s + r.actualDuration, 0);
    const max = rows.reduce((s, r) => Math.max(s, r.actualDuration), 0);
    return { label, commits: rows.length, totalMs: +total.toFixed(1), maxCommitMs: +max.toFixed(1) };
  };
  return { onRender, setLabel, report, commits };
}

afterEach(() => cleanup());

// Opt-in only: this harness mounts the full app over thousands of synthetic
// jobs and takes ~14s, so it must not run in the normal suite / CI. Enable with
//   PERF_AUDIT=1 PERF_JOBS=4000 npx vitest run test/perf.audit.test.jsx
const runPerf = process.env.PERF_AUDIT ? test : test.skip;

runPerf(`PERF: ${N} jobs — mount + press timings`, async () => {
  const prof = makeProfiler();
  const jobs = makeJobs(N);
  mockServer({ jobs });
  window.location.hash = "#/";

  const genStart = performance.now();
  // ---- MOUNT ----
  const t0 = performance.now();
  await act(async () => {
    render(
      <Profiler id="app" onRender={prof.onRender}>
        <HashRouter>
          <StoreProvider>
            <TenantProvider>
              <App />
            </TenantProvider>
          </StoreProvider>
        </HashRouter>
      </Profiler>
    );
  });
  // wait for jobs to load into the list
  await waitFor(() => {
    if (!document.querySelector('[data-testid="bottom-nav"], [data-testid="sidebar"]')) throw new Error("no shell");
  }, { timeout: 8000 });
  // let the initial refresh() settle (jobs painted)
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  const mountMs = performance.now() - t0;

  const results = [];
  results.push({ what: "MOUNT+load (wall)", ms: +mountMs.toFixed(1), ...prof.report("mount") });

  // ---- Measure a PRESS: helper that times a synchronous user event ----
  async function press(label, fn) {
    prof.setLabel(label);
    const s = performance.now();
    await act(async () => { fn(); });
    const wall = performance.now() - s;
    // allow follow-up microtask commits within the same press to flush
    await act(async () => { await Promise.resolve(); });
    const rep = prof.report(label);
    results.push({ what: label, ms: +wall.toFixed(1), ...rep });
  }

  // Find nav tabs by hash href (HashRouter → href="#/today" etc.).
  const linkByHref = (h) =>
    document.querySelector(`nav a[href="${h}"], [data-testid="sidebar"] a[href="${h}"]`);
  const nav = async (label, href) => {
    const a = linkByHref(href);
    if (a) { await press(label, () => fireEvent.click(a)); await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); }
    else results.push({ what: label + " (link not found)", ms: 0, commits: 0, totalMs: 0, maxCommitMs: 0 });
  };

  // Leave Jobs and come back — the real "navigate to the big list" cost.
  await nav("PRESS nav→Time", "#/time");
  await nav("PRESS nav→Jobs (remount)", "#/");
  await nav("PRESS nav→Today", "#/today");
  await nav("PRESS nav→Jobs (remount#2)", "#/");

  // Tap a job row → JobDetail.
  const jobLink = document.querySelector('a[href^="#/job/"], a[href^="#/customer/"]');
  if (jobLink) {
    await press("PRESS open job/customer", () => fireEvent.click(jobLink));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  } else {
    results.push({ what: "PRESS open job (no row link)", ms: 0, commits: 0, totalMs: 0, maxCommitMs: 0 });
  }
  await nav("PRESS nav→Jobs (remount#3)", "#/");

  // Search typing (deferred) — measure the keystroke cost on the big list.
  const search = document.querySelector('input[type="search"], input[placeholder*="earch"], input[placeholder*="Search"]');
  if (search) {
    await press("PRESS type 'a' in search", () => fireEvent.change(search, { target: { value: "a" } }));
    await press("PRESS type 'ac' in search", () => fireEvent.change(search, { target: { value: "ac" } }));
    await press("PRESS type 'acme' in search", () => fireEvent.change(search, { target: { value: "Acme" } }));
  } else {
    results.push({ what: "search input not found", ms: 0, commits: 0, totalMs: 0, maxCommitMs: 0 });
  }

  // Tab refocus: visibilitychange fires refreshJobs + events + commands + sas +
  // email at once. With the poll guard, an unchanged jobs blob must NOT re-group.
  prof.setLabel("refocus (visibility)");
  const rf = performance.now();
  await act(async () => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((r) => setTimeout(r, 80)); // let the refresh burst settle
  });
  results.push({ what: "PRESS tab refocus", ms: +(performance.now() - rf).toFixed(1), ...prof.report("refocus (visibility)") });

  // Background poll window — 9s catches the 8s command poll (setCommands → new
  // array → DataCtx recompute → all useStore() consumers + prompt scanners).
  prof.setLabel("BG 9s window (polls)");
  await act(async () => { await new Promise((r) => setTimeout(r, 9000)); });
  results.push({ what: "BG 9s (idle, 8s poll fires)", ms: 9000, ...prof.report("BG 9s window (polls)") });

  // ---- PRINT REPORT ----
  const pad = (s, n) => String(s).padEnd(n);
  const padL = (s, n) => String(s).padStart(n);
  let out = `\n===== PERF AUDIT (N=${N} jobs) =====\n`;
  out += pad("interaction", 30) + padL("wall ms", 9) + padL("commits", 9) + padL("render ms", 11) + padL("maxCommit", 11) + "\n";
  for (const r of results) {
    out += pad(r.what, 30) + padL(r.ms ?? "-", 9) + padL(r.commits, 9) + padL(r.totalMs, 11) + padL(r.maxCommitMs, 11) + "\n";
  }
  out += "=====================================\n";
  // eslint-disable-next-line no-console
  console.log(out);
}, 60000);
