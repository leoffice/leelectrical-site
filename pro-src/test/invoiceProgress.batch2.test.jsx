// @vitest-environment jsdom
// Batch 2 D3 — items 3 & 4: Invoices → Progress button (progress=1) and
// invoice jobs show permit Paperwork branches (Con Ed + City) with inspection date.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { J1, mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

const invoiceJobs = [
  {
    id: "INV-1",
    customer: "Progress Co",
    invoiceNo: "8801",
    invoiceDate: "2026-07-01",
    amount: "1500",
    paid: false,
    serviceAddress: "10 Progress Way",
    // Invoice-first shape: Paperwork often skipped on import — still must show branches
    status: {
      Lead: { s: "done" },
      "Site Visit": { s: "skipped" },
      Estimate: { s: "skipped" },
      Accepted: { s: "skipped" },
      Invoiced: { s: "done", d: "2026-07-01" },
      "Deposit Receipt": { s: "skipped" },
      Paperwork: { s: "skipped" },
    },
    paperwork: {
      coned: {
        enabled: true,
        steps: {},
        dates: { "Inspection appointment": "2026-07-15T10:00" },
      },
      dob: { enabled: true, steps: {}, dates: {} },
    },
  },
  {
    id: "INV-2",
    customer: "Progress Co",
    invoiceNo: "8802",
    amount: "200",
    paid: true,
    serviceAddress: "10 Progress Way",
  },
];

/** Permit-style job (no invoice) — Paperwork not skipped; existing permit UX. */
const permitJob = {
  id: "PERMIT-1",
  customer: "Permit Co",
  title: "Service upgrade",
  amount: "3000",
  invoiceNo: "",
  paid: false,
  status: { Lead: { s: "done", d: "2026-06-01" } },
  paperwork: {
    coned: { enabled: true, steps: {}, dates: { "Inspection appointment": "2026-08-01T09:30" } },
    dob: { enabled: false, steps: {}, dates: {} },
  },
};

describe("Item 3 — Invoices tab opens job Progress via progress=1", () => {
  it("invoice-open-progress navigates to /job/<id>?from=…&progress=1", async () => {
    mockServer({ jobs: invoiceJobs });
    const user = userEvent.setup();
    renderApp("#/customer/" + encodeURIComponent("c:progress co"));
    const view = await screen.findByTestId("customer-view");
    await user.click(within(view).getByTestId("cust-tab-invoices"));
    const panel = await within(view).findByTestId("cust-tab-panel-invoices");
    const btn = within(panel).getByTestId("invoice-open-progress");
    expect(btn).toBeInTheDocument();
    await user.click(btn);
    await waitFor(() => {
      expect(window.location.hash).toMatch(/#\/job\/INV-1\?/);
      expect(window.location.hash).toMatch(/progress=1/);
      expect(window.location.hash).toMatch(/from=/);
    });
  });

  it("JobDetail with progress=1 expands sections and shows job-progress", async () => {
    mockServer({ jobs: invoiceJobs });
    renderApp(
      "#/job/INV-1?from=" + encodeURIComponent("c:progress co") + "&progress=1"
    );
    const pane = await screen.findByTestId("detail-pane");
    // Progress accordion container is mounted (sections un-folded)
    const progress = await within(pane).findByTestId("job-progress");
    expect(progress).toBeInTheDocument();
    expect(progress).toHaveTextContent(/Progress/);
    // progress=1 opens Paperwork phase — branches visible for invoice job
    expect(within(pane).getByTestId("job-paperwork-branches")).toBeInTheDocument();
    // Folded chrome (sibling-only list without sections) is not the only view
    expect(within(pane).queryByTestId("customer-sibling-jobs")).not.toBeInTheDocument();
  });

  it("progress=1 wins over fold=1 — sections still expand", async () => {
    mockServer({ jobs: invoiceJobs });
    renderApp(
      "#/job/INV-1?from=" +
        encodeURIComponent("c:progress co") +
        "&fold=1&progress=1"
    );
    const pane = await screen.findByTestId("detail-pane");
    expect(await within(pane).findByTestId("job-progress")).toBeInTheDocument();
  });
});

describe("Item 4 — invoice Progress shows permit Paperwork (Con Ed + City)", () => {
  it("invoice job with paperwork data shows Con Ed + City and preserves inspection date", async () => {
    mockServer({ jobs: invoiceJobs });
    const user = userEvent.setup();
    // Open without progress=1 so we also exercise manual phase open path
    renderApp("#/job/INV-1");
    const pane = await screen.findByTestId("detail-pane");
    // Even though status.Paperwork is skipped, invoice jobs still show branches
    await user.click(within(pane).getByRole("button", { name: /📑/ }));
    const branches = within(pane).getByTestId("job-paperwork-branches");
    expect(within(branches).getByText("🔌 Con Ed paperwork")).toBeInTheDocument();
    expect(within(branches).getByText("🏙️ DOB / City permit")).toBeInTheDocument();
    // Enable toggles present
    expect(within(branches).getByRole("switch", { name: "🔌 Con Ed paperwork" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(within(branches).getByRole("switch", { name: "🏙️ DOB / City permit" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    // Inspection appointment date preserved from job.paperwork.coned.dates
    const appt = within(branches).getByLabelText("Inspection appointment date");
    expect(appt).toHaveValue("2026-07-15T10:00");
  });

  it("permit-job Paperwork behavior is unchanged (branches + inspection date)", async () => {
    mockServer({ jobs: [permitJob] });
    const user = userEvent.setup();
    renderApp("#/job/PERMIT-1");
    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByRole("button", { name: /📑/ }));
    const branches = within(pane).getByTestId("job-paperwork-branches");
    expect(within(branches).getByText("🔌 Con Ed paperwork")).toBeInTheDocument();
    expect(within(branches).getByText("🏙️ DOB / City permit")).toBeInTheDocument();
    const appt = within(branches).getByLabelText("Inspection appointment date");
    expect(appt).toHaveValue("2026-08-01T09:30");
    // DOB off — steps not listed until enabled
    expect(within(branches).queryByText("Permit issued")).toBeNull();
    // Con Ed enabled — inspection step present
    expect(within(branches).getByText("Inspection appointment")).toBeInTheDocument();
  });

  it("default invoice job (J1) still exposes Paperwork branches after phase open", async () => {
    // Existing permit-adjacent fixture with invoiceNo — regression guard
    mockServer();
    const user = userEvent.setup();
    renderApp("#/job/" + encodeURIComponent(J1.id));
    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByRole("button", { name: /📑/ }));
    expect(within(pane).getByTestId("job-paperwork-branches")).toBeInTheDocument();
    expect(within(pane).getByRole("switch", { name: "🔌 Con Ed paperwork" })).toBeInTheDocument();
    expect(within(pane).getByRole("switch", { name: "🏙️ DOB / City permit" })).toBeInTheDocument();
  });
});
