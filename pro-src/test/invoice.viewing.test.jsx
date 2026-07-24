// @vitest-environment jsdom
// Job-detail / invoice-viewing area fixes:
//   #54 calendar opens under office@leelectrical.us
//   #44 jobs-list Invoice offers View (full-screen PDF) as well as Send
//   #45 document-fetch stage wording (Requesting -> Fetching from QuickBooks -> Ready)
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { HashRouter } from "react-router-dom";
import { StoreProvider } from "../src/state/store.jsx";
import { CalSheet, QuickSendSheet, PDF_STAGES, calAccount } from "../src/components/JobSheets.jsx";
import { mockServer, stubPdfOpen } from "./helpers.jsx";

// This harness runs without vitest globals:true, so RTL's afterEach auto-cleanup
// isn't registered — unmount explicitly to avoid DOM leaking between tests.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

const JOB = {
  id: "J-cal-test",
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
  it("Open in G-Calendar targets office@leelectrical.us via ?authuser and jumps to the date", async () => {
    mockServer();
    const openSpy = vi.fn(() => ({ focus() {} }));
    vi.stubGlobal("open", openSpy);
    const user = userEvent.setup();

    renderNode(
      <CalSheet job={{ ...JOB, status: { Scheduled: { s: "done", d: "2026-07-10" } } }} onClose={() => {}} />
    );
    await user.click(await screen.findByTestId("open-gcal"));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const url = String(openSpy.mock.calls[0][0]);
    // The calendar account is now read from tenant_config rather than a
    // module const; for the LE tenant it resolves to the same mailbox.
    expect(calAccount()).toBe("office@leelectrical.us");
    expect(url).toContain("calendar.google.com");
    expect(url).toContain("authuser=" + encodeURIComponent("office@leelectrical.us")); // office%40leelectrical.us
    expect(url).toContain("2026/07/10"); // date deep-link preserved
  });

  it("Open in calendar deep-links the in-app schedule", async () => {
    mockServer();
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderNode(
      <CalSheet job={{ ...JOB, status: { Scheduled: { s: "done", d: "2026-07-10" } } }} onClose={onClose} />
    );
    await user.click(await screen.findByTestId("open-in-calendar"));
    expect(onClose).toHaveBeenCalled();
    const raw = sessionStorage.getItem("lepro_calendar_pick");
    expect(raw).toBeTruthy();
    const pick = JSON.parse(raw);
    expect(pick.focusDate).toBe("2026-07-10");
    // Deferred nav (rAF + setTimeout) — wait for Calendar hash.
    await waitFor(() => {
      expect(String(window.location.hash || "")).toMatch(/today/);
    });
  });
});

describe("#44 jobs-list Invoice offers View as well as Send", () => {
  it("QuickSendSheet shows both a View PDF option and a Send option", async () => {
    mockServer();
    renderNode(<QuickSendSheet job={JOB} onClose={() => {}} />);

    expect(await screen.findByText("View Local Invoice")).toBeInTheDocument();
    expect(screen.getByText("View QuickBooks Invoice")).toBeInTheDocument();
    expect(screen.getByText(/Send invoice with payment link/)).toBeInTheDocument();
  });
});

describe("#44/#45 PDF viewing: local open + background QBO fetch", () => {
  it("generates invoice PDF CLIENT-SIDE (no server fetch) when job has invoice data", async () => {
    const click = stubPdfOpen();
    const srv = mockServer(); // docs empty -> local gen path
    const user = userEvent.setup();

    renderNode(<QuickSendSheet job={JOB} onClose={() => {}} />);
    await user.click(await screen.findByText("View Local Invoice"));

    // Built in the browser — open + optional download (1–2 clicks); generate-doc never hit.
    await waitFor(() => expect(click.mock.calls.length).toBeGreaterThanOrEqual(1));
    expect(screen.queryByText("Generating your PDF — a few seconds…")).toBeNull();
    expect(srv.calls.some((c) => c.path === "generate-doc")).toBe(false);
    expect(document.querySelector("[data-fullscreen-pdf]")).toBeNull();
  });

  it("falls back to QBO fetch stages when job has no billable lines", async () => {
    const click = stubPdfOpen();
    const bare = { ...JOB, amount: "", invoiceLines: [] };
    const srv = mockServer();
    const user = userEvent.setup();

    renderNode(<QuickSendSheet job={bare} onClose={() => {}} />);
    await user.click(await screen.findByText("View QuickBooks Invoice"));

    expect(await screen.findByText("Fetching from QuickBooks — a few seconds…")).toBeInTheDocument();
    const bar = document.querySelector('[aria-label="Document status"]');
    expect(bar).not.toBeNull();
    PDF_STAGES.forEach((s) => expect(bar.textContent).toContain(s));

    srv.state.docs["inv-251841"] = "%PDF-1.4 fetched";
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1), { timeout: 7000 });
  }, 12000);
});
