// @vitest-environment jsdom
// Multi-invoice payment apply: one check split across two open invoices.
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

describe("multi-invoice payment apply", () => {
  it("auto-splits $9600 across two open invoices and records both", async () => {
    const srv = mockServer({
      jobs: [
        {
          id: "J-a",
          customer: "Amos Cohen",
          serviceAddress: "220 Albany Ave",
          amount: "$30,000",
          invoiceNo: "231504",
          openBalance: 5000,
          paid: false,
          email: "amos@x.com",
          payments: [
            { id: "p1", amount: 25000, method: "Check", date: "2026-07-01" },
          ],
        },
        {
          id: "J-b",
          customer: "Amos Cohen",
          serviceAddress: "220 Albany Ave",
          amount: "$4,600",
          invoiceNo: "251757",
          openBalance: 4600,
          paid: false,
          email: "amos@x.com",
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-a?fold=0");
    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByTestId("tab-payment"));
    await user.click(screen.getByText("Record a payment"));
    await user.click(screen.getByText("Zelle"));

    // Multi UI appears for 2+ open invoices.
    const multi = await screen.findByTestId("payment-multi-apply");
    expect(multi).toBeInTheDocument();

    const amt = screen.getByTestId("payment-amount");
    await user.clear(amt);
    await user.type(amt, "9600");
    // Blur so amount formats; auto-split should fill both lines.
    amt.blur();

    await waitFor(() => {
      expect(screen.getByTestId("payment-alloc-amt-231504")).toHaveValue("$5,000");
      expect(screen.getByTestId("payment-alloc-amt-251757")).toHaveValue("$4,600");
    });
    expect(screen.getByTestId("payment-alloc-summary").textContent).toMatch(/balanced/i);

    await user.click(screen.getByTestId("record-payment"));

    await waitFor(() => expect(srv.enqueued("record_payment").length).toBe(2));
    const cmds = srv.enqueued("record_payment");
    const byInv = Object.fromEntries(cmds.map((c) => [c.payload.invoiceNo, c.payload.amount]));
    expect(byInv["231504"]).toBe(5000);
    expect(byInv["251757"]).toBe(4600);

    const ovA = srv.state.ov["J-a"];
    const ovB = srv.state.ov["J-b"];
    expect(ovA.paid).toBe(true);
    expect(ovB.paid).toBe(true);
    expect(Number(ovA.openBalance) || 0).toBe(0);
    expect(Number(ovB.openBalance) || 0).toBe(0);
  });
});
