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
          qboCustomerId: "1601",
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

    await user.click(screen.getByTestId("doc-sync-email"));
    await user.click(screen.getByTestId("doc-save-sync-send"));

    await waitFor(() => expect(srv.enqueued("create_estimate")).toHaveLength(1));
    const cmd = srv.enqueued("create_estimate")[0];
    expect(cmd.lane).toBe("judgment");
    expect(cmd.payload.serviceAddress).toBe("10 Broadway");
    expect(cmd.payload.shipAddr.Line2).toBe("2A");
    expect(cmd.payload.lines.length).toBeGreaterThan(0);
    expect(cmd.payload.send).toBe(true);
    expect(srv.state.ov["J-EST"].status?.Estimate?.s).not.toBe("done");
    expect(srv.state.ov["J-EST"].estimateLines?.length).toBeGreaterThan(0);
  });

  it("Save on job shows draft on estimate tab and opens saved view", async () => {
    const srv = mockServer({
      jobs: [
        {
          id: "J-DRAFT",
          customer: "Draft Co",
          title: "Rough-in",
          email: "d@x.com",
          serviceAddress: "22 Court",
          amount: "$800",
          paid: false,
          status: { Lead: { s: "done" }, "Site Visit": { s: "done" } },
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-DRAFT");
    const pane = await screen.findByTestId("detail-pane");

    await user.click(within(pane).getByTestId("progress-step-Estimate"));
    await user.click(within(pane).getByTestId("generate-estimate"));
    await user.click(await screen.findByTestId("doc-save"));

    await waitFor(() => expect(srv.state.ov["J-DRAFT"].estimateLines?.length).toBeGreaterThan(0));
    const tabs = within(pane).getByTestId("job-doc-tabs");
    expect(within(tabs).getByTestId("tab-estimate")).toHaveTextContent(/Est draft/);

    await user.click(within(tabs).getByTestId("tab-estimate"));
    expect(await screen.findByTestId("doc-draft-banner")).toBeInTheDocument();
    expect(screen.getByTestId("doc-draft-lines")).toBeInTheDocument();
    expect(screen.getByTestId("doc-sync-qbo")).toBeInTheDocument();
  });

  it("Save on job saves locally without enqueueing QuickBooks commands", async () => {
    const srv = mockServer({
      jobs: [
        {
          id: "J-LOCAL",
          customer: "Draft Co",
          title: "Rough-in",
          email: "d@x.com",
          serviceAddress: "22 Court",
          amount: "$800",
          paid: false,
          status: { Lead: { s: "done" }, "Site Visit": { s: "done" } },
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-LOCAL");
    const pane = await screen.findByTestId("detail-pane");

    await user.click(within(pane).getByTestId("progress-step-Estimate"));
    await user.click(within(pane).getByTestId("generate-estimate"));
    await user.click(await screen.findByTestId("doc-save"));

    await waitFor(() => expect(srv.state.ov["J-LOCAL"].status.Estimate.s).toBe("done"));
    expect(srv.enqueued("create_estimate")).toHaveLength(0);
    expect(srv.state.ov["J-LOCAL"].estimateLines?.length).toBeGreaterThan(0);
  });

  it("Save & sync enqueues create_customer when job has no QuickBooks link", async () => {
    const srv = mockServer({
      jobs: [
        {
          id: "J-NOQBO",
          customer: "Fresh Client",
          title: "Panel",
          email: "fresh@x.com",
          serviceAddress: "1 Main",
          amount: "$900",
          paid: false,
          status: { Lead: { s: "done" }, "Site Visit": { s: "done" } },
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-NOQBO");
    const pane = await screen.findByTestId("detail-pane");

    await user.click(within(pane).getByTestId("progress-step-Estimate"));
    await user.click(within(pane).getByTestId("generate-estimate"));
    await user.click(screen.getByTestId("doc-sync-email"));
    await user.click(screen.getByTestId("doc-save-sync-send"));

    await waitFor(() => expect(srv.enqueued("create_customer")).toHaveLength(1));
    expect(srv.enqueued("create_estimate")).toHaveLength(0);
    const stash = JSON.parse(localStorage.getItem("le-pro-pending-doc-sync") || "{}");
    expect(stash["J-NOQBO"]?.commands?.[0]?.type).toBe("create_estimate");
  });

  it("Save & sync & send flags create_estimate to email the customer", async () => {
    const srv = mockServer({
      jobs: [
        {
          id: "J-SEND",
          customer: "Send Co",
          title: "Panel",
          email: "send@x.com",
          qboCustomerId: "1602",
          serviceAddress: "9 Park",
          amount: "$1200",
          paid: false,
          status: { Lead: { s: "done" }, "Site Visit": { s: "done" } },
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-SEND");
    const pane = await screen.findByTestId("detail-pane");

    await user.click(within(pane).getByTestId("progress-step-Estimate"));
    await user.click(within(pane).getByTestId("generate-estimate"));
    await user.click(screen.getByTestId("doc-sync-email"));
    expect(screen.getByTestId("doc-send-emails")).toHaveValue("send@x.com");
    await user.click(screen.getByTestId("doc-save-sync-send"));

    await waitFor(() => expect(srv.enqueued("create_estimate")).toHaveLength(1));
    expect(srv.enqueued("create_estimate")[0].payload.send).toBe(true);
    expect(srv.enqueued("create_estimate")[0].payload.email).toBe("send@x.com");
  });

  it("Invoiced Create → from estimate prompts progress % then create_invoice", async () => {
    const srv = mockServer({
      jobs: [
        {
          id: "J-INV",
          customer: "AC Client",
          title: "Service upgrade",
          email: "a@x.com",
          qboCustomerId: "1603",
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
    await user.click(screen.getByTestId("doc-sync-email"));
    await user.click(screen.getByTestId("doc-save-sync-send"));

    await waitFor(() => expect(srv.enqueued("create_invoice")).toHaveLength(1));
    const cmd = srv.enqueued("create_invoice")[0];
    expect(cmd.payload.source).toBe("estimate");
    expect(cmd.payload.progressPct).toBe(50);
    expect(cmd.payload.lines[0].unitPrice).toBe(2500);
    expect(cmd.payload.lines[0].qty).toBe(0.5);
  });
});