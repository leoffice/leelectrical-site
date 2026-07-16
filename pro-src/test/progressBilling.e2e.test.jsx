// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("Progress invoice editor", () => {
  it("edit invoice shows progress panel and QBO-style qty × rate for partial bill", async () => {
    const srv = mockServer({
      jobs: [
        {
          id: "qbo-251808",
          customer: "Chanan Sheleg",
          title: "Installation of wiring",
          email: "hanan@x.com",
          qboCustomerId: "49",
          serviceAddress: "503 Schenectady Ave",
          amount: "$25,000",
          invoiceNo: "251808",
          paid: false,
          status: {
            Lead: { s: "done" },
            Estimate: { s: "done" },
            Accepted: { s: "done" },
            Invoiced: { s: "done", d: "2026-03-17" },
          },
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/qbo-251808");
    const pane = await screen.findByTestId("detail-pane");
    const tabs = within(pane).getByTestId("job-doc-tabs");

    await user.click(within(tabs).getByTestId("tab-invoice"));
    await user.click(await screen.findByTestId("doc-edit"));
    expect(await screen.findByTestId("progress-billing-panel")).toBeInTheDocument();

    await user.clear(screen.getByTestId("progress-contract-amount"));
    await user.type(screen.getByTestId("progress-contract-amount"), "46000");
    await user.clear(screen.getByTestId("progress-amount-due"));
    await user.type(screen.getByTestId("progress-amount-due"), "25000");

    const rows = await screen.findAllByTestId("doc-line-row");
    const rateInput = within(rows[0]).getByLabelText("Rate line 1");
    const qtyInput = within(rows[0]).getByLabelText("Quantity line 1");
    expect(rateInput).toHaveValue("46000");
    expect(parseFloat(qtyInput.value)).toBeCloseTo(25000 / 46000, 4);

    await user.click(screen.getByTestId("progress-mode-pct"));
    const pctInput = screen.getByTestId("progress-pct-edit");
    await user.clear(pctInput);
    await user.type(pctInput, "50");
    expect(rateInput).toHaveValue("46000");
    expect(parseFloat(qtyInput.value)).toBeCloseTo(0.5, 4);

    await user.click(screen.getByTestId("doc-sync-email"));
    await user.click(screen.getByTestId("doc-save-sync-send"));
    await waitFor(() => expect(srv.enqueued("update_invoice")).toHaveLength(1));
    const cmd = srv.enqueued("update_invoice")[0];
    expect(cmd.payload.lines[0].unitPrice).toBe(46000);
    expect(cmd.payload.lines[0].qty).toBeCloseTo(0.5, 4);
    expect(cmd.payload.progressBilling).toBe(true);
  });
});