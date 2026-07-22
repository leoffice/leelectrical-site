// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";
import { changeOrderJobPatch } from "../src/lib/changeOrder.js";

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.location.hash = "#/";
});

const BASE = {
  id: "J-1",
  customer: "Acme LLC",
  qboCustomerId: "55",
  serviceAddress: "10 Oak St",
  apartment: "2A",
  invoiceNo: "251100",
  title: "Panel upgrade",
};

describe("changeOrderJobPatch", () => {
  it("clones address + customer and tags change order kind", () => {
    const inv = changeOrderJobPatch(BASE, "invoice", [BASE]);
    expect(inv.changeOrder).toBe(true);
    expect(inv.changeOrderKind).toBe("invoice");
    expect(inv.changeOrderLabel).toBe("251100-CO-01");
    expect(inv.invoiceNo).toBe("");
    expect(inv.estimateNo).toBe("");
    expect(inv.serviceAddress).toBe("10 Oak St");
    expect(inv.title).toMatch(/Change [Oo]rder/);

    const est = changeOrderJobPatch(BASE, "estimate", [BASE]);
    expect(est.changeOrderKind).toBe("estimate");
    expect(est.changeOrderLabel).toBe("251100-CO-01");
    expect(est.estimateNo).toBe("");
  });
});

describe("change order + delete UX", () => {
  it("job detail shows single add change order button + picker + confirm", async () => {
    mockServer({ jobs: [BASE] });
    const user = userEvent.setup();
    renderApp("#/job/J-1");
    await screen.findByTestId("detail-pane");
    await user.click(screen.getByTestId("add-change-order-btn"));
    expect(await screen.findByTestId("co-pick-invoice")).toBeInTheDocument();
    expect(screen.getByTestId("co-pick-estimate")).toBeInTheDocument();
    await user.click(screen.getByTestId("co-pick-invoice"));
    expect(await screen.findByTestId("co-confirm-create")).toBeInTheDocument();
  });

  it("add job at address opens sheet with change order toggle", async () => {
    mockServer({ jobs: [BASE] });
    const user = userEvent.setup();
    renderApp("#/job/J-1");
    await screen.findByTestId("detail-pane");
    await user.click(screen.getByTestId("job-add-btn"));
    expect(await screen.findByTestId("add-job-co-toggle-row")).toBeInTheDocument();
    expect(screen.getByTestId("add-job-at-address-confirm")).toBeInTheDocument();
    // Toggle CO on → shows preview / kind picker
    const toggle = within(screen.getByTestId("add-job-co-toggle-row")).getByRole("switch");
    await user.click(toggle);
    expect(await screen.findByTestId("add-job-co-kind")).toBeInTheDocument();
    expect(screen.getByText(/251100-CO-01/)).toBeInTheDocument();
  });

  it("customer view menu removes customer from app", async () => {
    const srv = mockServer({
      jobs: [
        BASE,
        { id: "J-2", customer: "Acme LLC", qboCustomerId: "55", estimateNo: "E-9", title: "Rough-in" },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/customer/q:55");
    await screen.findByTestId("customer-view");
    await user.click(screen.getByTestId("customer-menu-btn"));
    await user.click(screen.getByTestId("customer-delete-opt"));
    await user.click(screen.getByTestId("delete-confirm-btn"));
    await waitFor(() => {
      const ov = srv.state.ov || {};
      expect(Object.values(ov).filter((p) => p._deleted).length).toBeGreaterThan(0);
    });
  });

  it("job edit delete requires typing DELETE then removes one invoice job", async () => {
    const srv = mockServer({
      jobs: [
        BASE,
        { id: "J-2", customer: "Acme LLC", qboCustomerId: "55", invoiceNo: "251101", paid: true, title: "Extra" },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-1");
    await screen.findByTestId("detail-pane");
    await user.click(screen.getByTestId("job-edit-btn"));
    await user.click(screen.getByTestId("job-edit-delete"));
    // Type-to-confirm — button disabled until DELETE is typed
    expect(screen.getByTestId("delete-confirm-btn")).toBeDisabled();
    await user.type(screen.getByTestId("delete-type-input"), "DELETE");
    await user.click(screen.getByTestId("delete-confirm-btn"));
    await waitFor(() => expect(srv.state.ov["J-1"]?._deleted).toBe(true));
  });
});