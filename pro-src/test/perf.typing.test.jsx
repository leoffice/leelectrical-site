// @vitest-environment jsdom
// PERF: JobDetail typing + toast cost (opt-in, like perf.audit.test.jsx).
// Measures the two Batch-A scenarios the main harness does not cover:
//   1. typing in JobDetail Notes with the 120ms debounce flushing between
//      keystrokes (each flush used to rerun two O(4k) scans + full regroup)
//   2. a toast landing while a job detail page is open (used to re-render
//      every full-store consumer twice)
//   PERF_AUDIT=1 PERF_JOBS=4000 npx vitest run test/perf.typing.test.jsx
import React, { Profiler, useEffect } from "react";
import { render, act, waitFor, fireEvent, cleanup, screen } from "@testing-library/react";
import { HashRouter } from "react-router-dom";
import { afterEach, test } from "vitest";
import App from "../src/App.jsx";
import { StoreProvider, useStoreData } from "../src/state/store.jsx";
import { TenantProvider } from "../src/state/tenant.jsx";
import { mockServer } from "./helpers.jsx";

const N = Number(process.env.PERF_JOBS || 4000);
const runPerf = process.env.PERF_AUDIT ? test : test.skip;

const FIRST = ["Acme", "Blue", "Crown", "Delta", "Eagle", "Ford", "Green", "Hill", "Iron", "Jade"];
const LAST = ["Electric", "Builders", "Realty", "Management", "Holdings", "Corp", "Group"];

function makeJobs(n) {
  const jobs = [];
  const custCount = Math.floor(n * 0.6);
  for (let i = 0; i < n; i++) {
    const c = i < custCount ? i : i % custCount;
    const biz = `${FIRST[c % FIRST.length]} ${LAST[(c * 7) % LAST.length]} ${c}`;
    jobs.push({
      id: "J-" + i,
      customer: biz,
      businessName: biz,
      personName: "Chein",
      title: "Panel upgrade",
      amount: "$1,000",
      openBalance: i % 3 ? 1000 : 0,
      invoiceNo: i % 2 === 0 ? String(250000 + i) : "",
      address: `${100 + (i % 900)} Main St, Brooklyn`,
      serviceAddress: `${100 + (i % 900)} Main St, Brooklyn`,
      notes: "",
      invoiceHistory: [],
      updatedAt: 1719000000000 + i * 1000,
    });
  }
  return jobs;
}

let fireToast = null;
function ToastTap() {
  const { showToast } = useStoreData();
  useEffect(() => {
    fireToast = showToast;
  }, [showToast]);
  return null;
}

afterEach(() => cleanup());

runPerf(`PERF: JobDetail typing + toast (N=${N})`, async () => {
  const commits = [];
  let label = "mount";
  const onRender = (id, phase, actualDuration) => commits.push({ label, actualDuration });
  const rep = (l) => {
    const rows = commits.filter((c) => c.label === l);
    return {
      commits: rows.length,
      totalMs: +rows.reduce((s, r) => s + r.actualDuration, 0).toFixed(1),
      maxMs: +rows.reduce((s, r) => Math.max(s, r.actualDuration), 0).toFixed(1),
    };
  };

  mockServer({ jobs: makeJobs(N) });
  // fold=0 → full notes/progress layout (production default is collapsed).
  window.location.hash = "#/job/J-5?fold=0";
  await act(async () => {
    render(
      <Profiler id="app" onRender={onRender}>
        <HashRouter>
          <StoreProvider>
            <TenantProvider>
              <ToastTap />
              <App />
            </TenantProvider>
          </StoreProvider>
        </HashRouter>
      </Profiler>
    );
  });
  await waitFor(() => screen.getByLabelText("Notes"), { timeout: 15000 });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 100));
  });

  const notes = screen.getByLabelText("Notes");

  // ---- typing: 8 keystrokes, 140ms apart so every debounce flush fires ----
  label = "typing";
  const text = "Called cu";
  const t0 = performance.now();
  for (let i = 1; i <= 8; i++) {
    await act(async () => {
      fireEvent.change(notes, { target: { value: text.slice(0, i) } });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 140));
    });
  }
  const typingWall = performance.now() - t0 - 8 * 140;
  const typing = rep("typing");

  // ---- toast while detail open ----
  label = "toast";
  await act(async () => {
    fireToast && fireToast("Saved ✓ syncing…");
    await new Promise((r) => setTimeout(r, 120));
  });
  const toast = rep("toast");

  console.log("\n===== PERF TYPING/TOAST (N=" + N + ") =====");
  console.log(
    `typing 8 keys+flushes: render ${typing.totalMs}ms across ${typing.commits} commits ` +
      `(max ${typing.maxMs}ms, ~${(typing.totalMs / 8).toFixed(1)}ms/key, active wall ${typingWall.toFixed(0)}ms)`
  );
  console.log(`toast while detail open: render ${toast.totalMs}ms across ${toast.commits} commits (max ${toast.maxMs}ms)`);
  console.log("=========================================\n");
}, 180000);
