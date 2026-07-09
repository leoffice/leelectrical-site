// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";
import {
  invoiceJobs,
  estimateJobs,
  paymentRows,
  invoiceButtonTone,
} from "../src/lib/customerDocLists.js";

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.location.hash = "#/";
});

const J_OPEN = {
  id: "J-open",
  customer: "Test Co",
  invoiceNo: "251900",
  amount: "$500",
  paid: false,
  openBalance: 500,
};

const J_PAID = {
  id: "J-paid",
  customer: "Test Co",
  invoiceNo: "251901",
  amount: "$300",
  paid: true,
  payments: [{ amount: "300", method: "Zelle", date: "2026-07-01" }],
};

const J_EST = {
  id: "J-est",
  customer: "Test Co",
  estimateNo: "E-55",
  title: "Rough-in",
};

describe("customerDocLists helpers", () => {
  it("filters invoice jobs and tones paid vs open", () => {
    const jobs = [J_OPEN, J_PAID, J_EST];
    expect(invoiceJobs(jobs)).toHaveLength(2);
    expect(invoiceJobs(jobs, { openOnly: true })).toHaveLength(1);
    expect(invoiceButtonTone(J_PAID)).toBe("paid");
    expect(invoiceButtonTone(J_OPEN)).toBe("open");
    expect(estimateJobs(jobs)).toHaveLength(1);
    expect(paymentRows(jobs).length).toBeGreaterThan(0);
  });
});

describe("QB sync menu on header chip", () => {
  it("opens scoped menu from sync chip on job detail; confirm enqueues import_customer", async () => {
    const srv = mockServer({
      jobs: [
        {
          ...J_OPEN,
          qboCustomerId: "99",
          businessName: "Test Co",
          email: "t@x.com",
          phone: "718-555-0000",
          billingAddress: "1 Main",
          serviceAddress: "2 Service",
          title: "Panel",
        },
        J_PAID,
        J_EST,
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-open");
    await screen.findByTestId("detail-pane");

    await user.click(screen.getAllByTestId("sync-chip")[0]);
    expect(await screen.findByTestId("qbo-sync-context")).toHaveTextContent("Test Co");
    await user.click(screen.getByTestId("qbo-sync-invoices"));
    await user.click(screen.getByText("Open only"));
    await user.click(screen.getByTestId("qbo-sync-confirm"));

    await waitFor(() => expect(srv.enqueued("import_customer")).toHaveLength(1));
    const cmd = srv.enqueued("import_customer")[0];
    expect(cmd.payload.qboId).toBe("99");
    expect(cmd.payload.scope).toBe("open");
  });

  it("customer doc tabs list invoices green/red and navigate on tap", async () => {
    mockServer({ jobs: [J_OPEN, J_PAID, J_EST] });
    const user = userEvent.setup();
    renderApp("#/job/J-open");
    const pane = await screen.findByTestId("detail-pane");

    await user.click(within(pane).getByTestId("cust-tab-invoices"));
    const panel = await within(pane).findByTestId("cust-tab-panel-invoices");
    expect(within(panel).getByText("Invoice #251900")).toBeInTheDocument();
    expect(within(panel).getByText("Invoice #251901")).toBeInTheDocument();

    await user.click(within(panel).getByText("Invoice #251901"));
    await waitFor(() => expect(window.location.hash).toContain("#/job/J-paid"));
  });

  it("job edit sheet shows same-address invoices and saves title", async () => {
    const srv = mockServer({
      jobs: [
        {
          id: "J-a",
          customer: "Addr Co",
          invoiceNo: "100",
          serviceAddress: "55 Elm St",
          title: "Job A",
          paid: false,
          amount: "$100",
        },
        {
          id: "J-b",
          customer: "Addr Co",
          invoiceNo: "101",
          serviceAddress: "55 Elm St",
          title: "Job B",
          paid: true,
          amount: "$200",
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-a");
    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByTestId("job-edit-btn"));
    expect(await screen.findByTestId("job-edit-same-addr")).toBeInTheDocument();
    expect(screen.getByText("Inv #101")).toBeInTheDocument();
    const title = screen.getByLabelText("Job title");
    await user.clear(title);
    await user.type(title, "Updated title");
    await user.click(screen.getByTestId("job-edit-save"));
    await waitFor(() => expect(srv.state.ov["J-a"].title).toBe("Updated title"));
  });
});

describe("QB sync on customer view", () => {
  it("gray invoice tab opens builder and stays open on customer page", async () => {
    mockServer({
      jobs: [{ ...J_OPEN, customer: "View Co", invoiceNo: "", estimateNo: "" }],
    });
    const user = userEvent.setup();
    renderApp("#/customer/c:view%20co");
    const view = await screen.findByTestId("customer-view");
    const tabs = within(view).getAllByTestId("job-doc-tabs")[0];

    await user.click(within(tabs).getByTestId("tab-invoice"));
    expect(await screen.findByText(/Create invoice — View Co/)).toBeInTheDocument();
    expect(screen.getByTestId("doc-save-sync")).toBeInTheDocument();
  });

  it("shows doc tabs on customer page; sync chip has customer context", async () => {
    mockServer({
      jobs: [
        { ...J_OPEN, customer: "View Co", qboCustomerId: "12" },
        { ...J_EST, customer: "View Co" },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/customer/c:view%20co");
    const view = await screen.findByTestId("customer-view");
    expect(within(view).getByTestId("customer-doc-tabs")).toBeInTheDocument();
    await user.click(screen.getAllByTestId("sync-chip")[0]);
    expect(await screen.findByTestId("qbo-sync-context")).toHaveTextContent("View Co");
  });
});