// @vitest-environment jsdom
// Job-detail / invoice-viewing area fixes:
//   #54 calendar opens under office@leelectrical.us
//   #44 jobs-list Invoice offers View (full-screen PDF) as well as Send
//   #45 document-fetch stage wording (Requesting -> Fetching from QuickBooks -> Ready)
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { HashRouter } from "react-router-dom";
import { StoreProvider } from "../src/state/store.jsx";
import { CalSheet, QuickSendSheet, PDF_STAGES, CAL_ACCOUNT } from "../src/components/JobSheets.jsx";
import { mockServer } from "./helpers.jsx";

// This harness runs without vitest globals:true, so RTL's afterEach auto-cleanup
// isn't registered — unmount explicitly to avoid DOM leaking between tests.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

const JOB = {
  id: "J-1",
  customer: "Peretz Chein",
  amount: "$2,300",
  invoiceNo: "251841",
  email: "p@x.com",
  status: {},
};

const renderNode = (node) =>
  render(
    <HashRouter>
      <StoreProvider>{node}</StoreProvider>
    </HashRouter>
  );

describe("#54 calendar opens the office account", () => {
  it("Open Google Calendar targets office@leelectrical.us via ?authuser and jumps to the date", async () => {
    mockServer();
    const openSpy = vi.fn();
    vi.stubGlobal("open", openSpy);
    const user = userEvent.setup();

    renderNode(
      <CalSheet job={{ ...JOB, status: { Scheduled: { s: "done", d: "2026-07-10" } } }} onClose={() => {}} />
    );
    await user.click(await screen.findByText("Open Google Calendar"));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const url = String(openSpy.mock.calls[0][0]);
    expect(CAL_ACCOUNT).toBe("office@leelectrical.us");
    expect(url).toContain("calendar.google.com");
    expect(url).toContain("authuser=" + encodeURIComponent("office@leelectrical.us")); // office%40leelectrical.us
    expect(url).toContain("2026/07/10"); // date deep-link preserved
  });
});

describe("#44 jobs-list Invoice offers View as well as Send", () => {
  it("QuickSendSheet shows both a View PDF option and a Send option", async () => {
    mockServer();
    renderNode(<QuickSendSheet job={JOB} onClose={() => {}} />);

    expect(await screen.findByText("View PDF")).toBeInTheDocument(); // NEW: view path
    expect(screen.getByText("Send to p@x.com")).toBeInTheDocument(); // existing: send path
  });
});

describe("#44/#45 PDF viewing: stage wording + auto full screen", () => {
  it("surfaces the Requesting -> Fetching from QuickBooks -> Ready stages, then auto-opens full screen (no separate Full screen button)", async () => {
    URL.createObjectURL = vi.fn(() => "blob:pdf");
    URL.revokeObjectURL = vi.fn();
    const srv = mockServer(); // docs empty -> a miss, so it enqueues + polls
    const user = userEvent.setup();

    renderNode(<QuickSendSheet job={JOB} onClose={() => {}} />);
    await user.click(await screen.findByText("View PDF"));

    // #45 — plain-wording status line + the three-stage indicator.
    expect(await screen.findByText("Fetching from QuickBooks — a few seconds…")).toBeInTheDocument();
    const bar = document.querySelector('[aria-label="Document status"]');
    expect(bar).not.toBeNull();
    PDF_STAGES.forEach((s) => expect(bar.textContent).toContain(s));

    // #44 — no manual "go full screen" step exists anymore.
    expect(screen.queryByText("⛶ Full screen")).toBeNull();

    // Host uploads the PDF -> the poll picks it up and auto-renders full screen.
    srv.state.docs["inv-251841"] = "%PDF-1.4 fetched";
    const frame = await screen.findByTitle("PDF inv-251841", {}, { timeout: 7000 });
    expect(frame.tagName).toBe("IFRAME");
    expect(document.querySelector("[data-fullscreen-pdf]")).not.toBeNull();
  }, 12000);
});
