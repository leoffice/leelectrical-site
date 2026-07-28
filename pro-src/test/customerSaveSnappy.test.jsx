// @vitest-environment jsdom
// Customer Save & sync must close the sheet immediately — network is background.
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

describe("customer Save & sync is snappy", () => {
  it("closes the edit sheet immediately and still queues QuickBooks in the background", async () => {
    const srv = mockServer({
      jobs: [
        {
          id: "J-SNAP",
          customer: "Snappy Co",
          businessName: "Snappy Co",
          title: "Panel",
          phone: "718-555-0001",
          email: "s@x.com",
          billingAddress: "1 Main St",
          serviceAddress: "1 Main St",
          paid: false,
          status: { Lead: { s: "done" } },
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-SNAP");
    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByTestId("customer-edit-btn"));
    await screen.findByTestId("cust-save-sync");
    await user.click(screen.getByTestId("cust-save-sync"));

    // Sheet must be gone without waiting for network — this is the snappy contract.
    await waitFor(() => {
      expect(screen.queryByTestId("cust-save-sync")).not.toBeInTheDocument();
    });
    expect(await within(pane).findByText("Snappy Co")).toBeInTheDocument();

    // Background: create_customer still lands (no QB id on this job).
    await waitFor(() => expect(srv.enqueued("create_customer")).toHaveLength(1));
    await waitFor(() =>
      expect(srv.posts("state", (b) => !!b.ov && !!b.ov["J-SNAP"])).toHaveLength(1)
    );
  });

  it("keeps the new phone on screen after instant save", async () => {
    const srv = mockServer({
      jobs: [
        {
          id: "J-SNAP2",
          customer: "Phone Co",
          businessName: "Phone Co",
          title: "Outlet",
          phone: "718-555-1111",
          email: "p@x.com",
          billingAddress: "2 Main St",
          serviceAddress: "2 Main St",
          paid: false,
          status: { Lead: { s: "done" } },
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-SNAP2");
    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByTestId("customer-edit-btn"));
    const phone = await screen.findByLabelText("Phone");
    await user.clear(phone);
    await user.type(phone, "718-555-9999");
    await user.click(screen.getByTestId("cust-save-sync"));
    await waitFor(() => {
      expect(screen.queryByTestId("cust-save-sync")).not.toBeInTheDocument();
    });
    expect(await within(pane).findByText("718-555-9999")).toBeInTheDocument();
    await waitFor(() => expect(srv.state.ov["J-SNAP2"]?.phone).toBe("718-555-9999"));
  });
});
