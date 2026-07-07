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

describe("Estimate / invoice builder", () => {
  it("Estimate step shows Generate and enqueues create_estimate on Save & sync", async () => {
    const srv = mockServer({
      jobs: [
        {
          id: "J-EST",
          customer: "Mental Dressing",
          title: "Rewire",
          email: "m@x.com",
          serviceAddress: "10 Broadway",
          apartment: "2A",
          amount: "$500",
          paid: false,
          status: { Lead: { s: "done", d: "2026-07-01" }, "Site Visit": { s: "done", d: "2026-07-02" } },
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-EST");
    const pane = await screen.findByTestId("detail-pane");

    await user.click(within(pane).getByTestId("progress-step-Estimate"));
    await user.click(within(pane).getByTestId("generate-estimate"));

    const addr = await screen.findByTestId("doc-service-address");
    expect(addr).toHaveValue("10 Broadway");

    await user.click(screen.getByTestId("doc-save-sync"));

    await waitFor(() => expect(srv.enqueued("create_estimate")).toHaveLength(1));
    const cmd = srv.enqueued("create_estimate")[0];
    expect(cmd.lane).toBe("judgment");
    expect(cmd.payload.serviceAddress).toBe("10 Broadway");
    expect(cmd.payload.shipAddr.Line2).toBe("2A");
    expect(cmd.payload.lines.length).toBeGreaterThan(0);
    expect(srv.state.ov["J-EST"].status.Estimate.s).toBe("done");
  });

  it("Invoiced Create → from estimate prompts progress % then create_invoice", async () => {
    const srv = mockServer({
      jobs: [
        {
          id: "J-INV",
          customer: "AC Client",
          title: "Service upgrade",
          email: "a@x.com",
          serviceAddress: "55 Elm",
          estimateNo: "E-55",
          estimateLines: [{ itemName: "Service Upgrade:1 Meter", qty: 1, unitPrice: 2500, description: "Panel" }],
          paid: false,
          status: {
            Lead: { s: "done" },
            "Site Visit": { s: "done" },
            Estimate: { s: "done", d: "2026-07-01" },
            Accepted: { s: "done", d: "2026-07-02" },
          },
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-INV");
    const pane = await screen.findByTestId("detail-pane");

    await user.click(within(pane).getByTestId("progress-step-Invoiced"));
    await user.click(within(pane).getByTestId("create-invoice"));
    await user.click(await screen.findByText(/From estimate/));
    await user.click(screen.getByTestId("progress-pct-confirm"));

    expect(await screen.findByText(/Invoice from estimate \(50%\)/)).toBeInTheDocument();
    await user.click(screen.getByTestId("doc-save-sync"));

    await waitFor(() => expect(srv.enqueued("create_invoice")).toHaveLength(1));
    const cmd = srv.enqueued("create_invoice")[0];
    expect(cmd.payload.source).toBe("estimate");
    expect(cmd.payload.progressPct).toBe(50);
    expect(cmd.payload.lines[0].unitPrice).toBe(1250);
  });
});