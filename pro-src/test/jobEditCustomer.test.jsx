// @vitest-environment jsdom
// Job edit sheet: customer re-link picker + customerPickPatch preserves invoice fields.
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";
import { customerPickPatch } from "../src/lib/customers.js";

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.location.hash = "#/";
});

const JOB = {
  id: "J-edit",
  customer: "Wrong Co",
  businessName: "Wrong Co",
  title: "Panel upgrade",
  invoiceNo: "251900",
  amount: "$1,000",
  paid: false,
  openBalance: 1000,
  serviceAddress: "10 Oak St",
  qboCustomerId: "11",
  invoiceLines: [{ itemName: "Labor", qty: 1, unitPrice: 1000 }],
};

const OTHER = {
  id: "J-other",
  customer: "Right Co",
  businessName: "Right Co",
  phone: "718-555-9999",
  email: "right@x.com",
  billingAddress: "99 Bill St",
  qboCustomerId: "22",
  invoiceNo: "100",
  amount: "$50",
};

describe("JobEditSheet customer re-link", () => {
  it("renders customer picker with current customer name", async () => {
    mockServer({ jobs: [JOB] });
    const user = userEvent.setup();
    renderApp("#/job/J-edit");
    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByTestId("job-edit-btn"));

    const picker = await screen.findByTestId("job-edit-customer");
    expect(picker).toBeInTheDocument();
    expect(screen.getByTestId("job-edit-current-customer")).toHaveTextContent("Wrong Co");
    expect(screen.getByTestId("job-edit-customer-search")).toHaveValue("Wrong Co");
  });

  it("customerPickPatch re-links to a different customer while preserving invoiceNo/amount", () => {
    const jobs = [JOB, OTHER];
    const patch = customerPickPatch(
      { name: "Right Co", businessName: "Right Co", id: "22", phone: "718-555-9999" },
      jobs
    );
    expect(patch.customer).toBe("Right Co");
    expect(patch.businessName).toBe("Right Co");
    expect(patch.qboCustomerId).toBe("22");
    expect(patch.phone).toBe("718-555-9999");
    // Must NOT clobber doc identity / amounts
    expect(patch.invoiceNo).toBeUndefined();
    expect(patch.estimateNo).toBeUndefined();
    expect(patch.amount).toBeUndefined();
    expect(patch.invoiceLines).toBeUndefined();

    // Merged save shape used by JobEditSheet
    const merged = {
      title: JOB.title,
      serviceAddress: JOB.serviceAddress,
      address: JOB.serviceAddress,
      apartment: "",
      ...patch,
    };
    expect(merged.customer).toBe("Right Co");
    expect(merged.serviceAddress).toBe("10 Oak St");
    // Original job fields stay on the record when only patch keys are written
    expect(JOB.invoiceNo).toBe("251900");
    expect(JOB.amount).toBe("$1,000");
  });

  it("picking a customer stages a re-link note; save applies customer fields only", async () => {
    const srv = mockServer({
      jobs: [JOB, OTHER],
      customers: [
        { name: "Right Co", id: "22", phone: "718-555-9999", email: "right@x.com", billingAddress: "99 Bill St" },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-edit");
    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByTestId("job-edit-btn"));

    const search = await screen.findByTestId("job-edit-customer-search");
    await user.clear(search);
    await user.type(search, "Right");
    const match = await screen.findByTestId("customer-match");
    await user.click(match);

    expect(await screen.findByTestId("job-edit-relink-note")).toHaveTextContent(/Will re-link Invoice #251900/);
    expect(screen.getByTestId("job-edit-relink-note")).toHaveTextContent(/Right Co/);
    expect(screen.getByTestId("job-edit-relink-note")).toHaveTextContent(/Line items and amounts stay/);

    await user.click(screen.getByTestId("job-edit-save"));
    await waitFor(() => {
      const ov = srv.state.ov["J-edit"];
      expect(ov).toBeTruthy();
      expect(ov.customer).toBe("Right Co");
      expect(ov.businessName).toBe("Right Co");
      expect(String(ov.qboCustomerId)).toBe("22");
    });
    // Line items / invoice identity must remain on the underlying job
    // (patch only overwrites provided keys; mock merges onto job)
    const saved = { ...JOB, ...srv.state.ov["J-edit"] };
    expect(saved.invoiceNo).toBe("251900");
    expect(saved.amount).toBe("$1,000");
    expect(saved.invoiceLines).toEqual(JOB.invoiceLines);
  });
});
