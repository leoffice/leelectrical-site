// @vitest-environment jsdom
// Jobs keep-alive: leaving and returning to the home list must not remount
// the board (the multi-second regroup was the main "app feels laggy" complaint).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HashRouter } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import App from "../src/App.jsx";
import { StoreProvider } from "../src/state/store.jsx";
import { TenantProvider } from "../src/state/tenant.jsx";
import { mockServer } from "./helpers.jsx";

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.location.hash = "#/";
});

function mount() {
  mockServer({
    jobs: Array.from({ length: 30 }, (_, i) => ({
      id: "J-" + i,
      customer: "Cust " + (i % 10),
      businessName: "Cust " + (i % 10),
      title: "Job " + i,
      amount: "$" + (100 + i),
      openBalance: i % 2 ? 50 : 0,
      invoiceNo: i % 2 ? String(250000 + i) : "",
      paid: i % 2 === 0,
      status: { Lead: { s: "done", d: "2026-07-01" } },
      updatedAt: 1719000000000 + i,
    })),
  });
  return render(
    <HashRouter>
      <StoreProvider>
        <TenantProvider>
          <App />
        </TenantProvider>
      </StoreProvider>
    </HashRouter>
  );
}

describe("Jobs keep-alive", () => {
  it("keeps the Jobs tree mounted when navigating away and back", async () => {
    window.location.hash = "#/";
    mount();
    await waitFor(() => {
      expect(screen.getByTestId("jobs-keepalive")).toBeInTheDocument();
    });
    const host = screen.getByTestId("jobs-keepalive");
    expect(host).not.toHaveAttribute("hidden");

    // Go to Time (or any non-jobs tab).
    const timeLink =
      document.querySelector('a[href="#/time"]') ||
      document.querySelector('nav a[href="#/time"]') ||
      screen.queryByText(/^Time$/i);
    expect(timeLink).toBeTruthy();
    await act(async () => {
      fireEvent.click(timeLink);
      window.location.hash = "#/time";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await waitFor(() => {
      const again = screen.getByTestId("jobs-keepalive");
      expect(again).toHaveAttribute("hidden");
    });
    // Same keep-alive host still in the document (not remounted away).
    expect(screen.getByTestId("jobs-keepalive")).toBe(host);

    await act(async () => {
      window.location.hash = "#/";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("jobs-keepalive")).not.toHaveAttribute("hidden");
    });
    expect(screen.getByTestId("jobs-keepalive")).toBe(host);
  });
});
