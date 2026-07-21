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
  it("edit invoice shows compact line progress (before rate) with % / $ toggle", async () => {
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
          contractAmount: 46000,
          invoiceProgressBilling: true,
          paid: false,
          status: {
            Lead: { s: "done" },
            Estimate: { s: "done" },
            Accepted: { s: "done" },
            Invoiced: { s: "done", d: "2026-03-17" },
          },
          invoiceLines: [
            {
              itemName: "Installation of wiring",
              description: "Installation of wiring",
              qty: 25000 / 46000,
              unitPrice: 46000,
              progressBilling: true,
            },
          ],
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/qbo-251808");
    const pane = await screen.findByTestId("detail-pane");
    const tabs = within(pane).getByTestId("job-doc-tabs");

    await user.click(within(tabs).getByTestId("tab-invoice"));
    await user.click(await screen.findByTestId("doc-edit"));

    // Yellow contract box is gone — progress lives on the line item.
    expect(screen.queryByTestId("progress-billing-panel")).not.toBeInTheDocument();

    const rows = await screen.findAllByTestId("doc-line-row");
    const rateInput = within(rows[0]).getByLabelText("Rate line 1");
    const qtyInput = within(rows[0]).getByLabelText("Quantity line 1");
    expect(rateInput).toHaveValue("46000");
    expect(parseFloat(qtyInput.value)).toBeCloseTo(25000 / 46000, 4);

    // Compact progress field sits before rate; toggle between $ and %.
    const progressInput = screen.getByTestId("progress-line-edit-1");
    const modeToggle = screen.getByTestId("progress-mode-toggle-1");
    expect(progressInput).toBeInTheDocument();
    expect(modeToggle).toBeInTheDocument();

    // Switch to % and set 50% → qty 0.5, full rate kept.
    if (modeToggle.textContent?.trim() === "$") {
      await user.click(modeToggle);
    }
    expect(modeToggle).toHaveTextContent("%");
    await user.clear(progressInput);
    await user.type(progressInput, "50");
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
