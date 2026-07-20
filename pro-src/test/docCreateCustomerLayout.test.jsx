// @vitest-environment jsdom
// Item 6: Estimate & Invoice creation share customer picker + service-address layout.
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.location.hash = "#/";
});

const CUST_A = {
  id: "J-a1",
  customer: "Alpha Co",
  businessName: "Alpha Co",
  qboCustomerId: "101",
  email: "alpha@x.com",
  phone: "718-555-0001",
  serviceAddress: "10 Oak St",
  apartment: "2A",
  billingAddress: "10 Oak St",
  invoiceNo: "9001",
  amount: "$100",
  paid: false,
  title: "Panel A",
};

const CUST_A2 = {
  id: "J-a2",
  customer: "Alpha Co",
  businessName: "Alpha Co",
  qboCustomerId: "101",
  serviceAddress: "22 Pine Rd",
  apartment: "3B",
  estimateNo: "E-900",
  title: "Rough-in",
};

const CUST_B = {
  id: "J-b1",
  customer: "Beta LLC",
  businessName: "Beta LLC",
  qboCustomerId: "202",
  email: "beta@x.com",
  phone: "718-555-0002",
  serviceAddress: "99 Maple Ave",
  apartment: "1C",
  billingAddress: "99 Maple Ave",
  invoiceNo: "9002",
  amount: "$50",
  paid: false,
  title: "Outlet",
};

const BETA_QBO = {
  name: "Beta LLC",
  id: "202",
  businessName: "Beta LLC",
  phone: "718-555-0002",
  email: "beta@x.com",
  billingAddress: "99 Maple Ave",
};

async function openCreateFromCustomer(user, kind) {
  renderApp("#/customer/c:alpha%20co");
  const view = await screen.findByTestId("customer-view");
  if (kind === "estimate") {
    await user.click(within(view).getByTestId("cust-tab-estimates"));
    await user.click(within(view).getByTestId("cust-create-estimate"));
  } else {
    await user.click(within(view).getByTestId("cust-tab-invoices"));
    await user.click(within(view).getByTestId("cust-create-invoice"));
  }
  await waitFor(() => expect(window.location.hash).toMatch(/create=1/));
  await screen.findByTestId("doc-customer-header");
}

async function fillFirstLineItem(user) {
  const name = await screen.findByLabelText("Product service line 1");
  await user.clear(name);
  await user.type(name, "Labor");
}

describe("doc create layout — customer picker + service address (estimate & invoice)", () => {
  it("Create estimate from customer shows prefilled customer picker + service-address control", async () => {
    mockServer({ jobs: [CUST_A, CUST_A2, CUST_B] });
    const user = userEvent.setup();
    await openCreateFromCustomer(user, "estimate");

    expect(screen.getByTestId("doc-customer-header")).toBeInTheDocument();
    expect(screen.getByTestId("doc-customer-search")).toHaveValue("Alpha Co");
    expect(screen.getByTestId("doc-service-address")).toBeInTheDocument();
    expect(screen.getByTestId("doc-service-address-choices")).toBeInTheDocument();
    // Scope address-chip queries to the choices container — the street strings
    // also appear in the background job card and the customer transaction ledger.
    const choices1 = screen.getByTestId("doc-service-address-choices");
    expect(within(choices1).getByRole("button", { name: /10 Oak St/ })).toBeInTheDocument();
    expect(within(choices1).getByRole("button", { name: /22 Pine Rd/ })).toBeInTheDocument();
    // Exactly one apartment field (consolidated into ServiceAddressField)
    expect(screen.getAllByLabelText("Apartment")).toHaveLength(1);
    expect(screen.getByTestId("doc-service-address-apartment")).toBeInTheDocument();
  });

  it("Create invoice from customer shows the SAME controls as estimate", async () => {
    mockServer({ jobs: [CUST_A, CUST_A2, CUST_B] });
    const user = userEvent.setup();
    await openCreateFromCustomer(user, "invoice");

    expect(screen.getByTestId("doc-customer-header")).toBeInTheDocument();
    expect(screen.getByTestId("doc-customer-search")).toHaveValue("Alpha Co");
    expect(screen.getByTestId("doc-service-address")).toBeInTheDocument();
    expect(screen.getByTestId("doc-service-address-choices")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Apartment")).toHaveLength(1);
  });

  it("changing customer in create header updates service-address choices", async () => {
    mockServer({
      jobs: [CUST_A, CUST_A2, CUST_B],
      customers: [BETA_QBO],
    });
    const user = userEvent.setup();
    await openCreateFromCustomer(user, "estimate");

    const choicesBefore = screen.getByTestId("doc-service-address-choices");
    expect(within(choicesBefore).getByRole("button", { name: /10 Oak St/ })).toBeInTheDocument();
    expect(within(choicesBefore).queryByRole("button", { name: /99 Maple Ave/ })).toBeNull();

    const search = screen.getByTestId("doc-customer-search");
    await user.clear(search);
    await user.type(search, "Beta");
    await user.click(await screen.findByTestId("customer-match"));

    await waitFor(() => {
      expect(screen.getByTestId("doc-customer-search")).toHaveValue("Beta LLC");
    });
    // Choices now reflect Beta's addresses; Alpha's are gone from the chip list.
    await waitFor(() =>
      expect(
        within(screen.getByTestId("doc-service-address-choices")).getByRole("button", { name: /99 Maple Ave/ })
      ).toBeInTheDocument()
    );
    const choicesAfter = screen.getByTestId("doc-service-address-choices");
    expect(within(choicesAfter).queryByRole("button", { name: /10 Oak St/ })).toBeNull();
    expect(within(choicesAfter).queryByRole("button", { name: /22 Pine Rd/ })).toBeNull();
  });

  it("picking an existing address fills street+apartment; ＋ New clears them", async () => {
    mockServer({ jobs: [CUST_A, CUST_A2] });
    const user = userEvent.setup();
    await openCreateFromCustomer(user, "invoice");

    await user.click(
      within(screen.getByTestId("doc-service-address-choices")).getByRole("button", { name: /22 Pine Rd/ })
    );
    expect(screen.getByTestId("doc-service-address")).toHaveValue("22 Pine Rd");
    expect(screen.getByTestId("doc-service-address-apartment")).toHaveValue("3B");

    await user.click(screen.getByTestId("doc-service-address-new"));
    expect(screen.getByTestId("doc-service-address")).toHaveValue("");
    expect(screen.getByTestId("doc-service-address-apartment")).toHaveValue("");
  });

  it("save persists picked customer + service address + apartment on estimate", async () => {
    const srv = mockServer({
      jobs: [CUST_A, CUST_A2, CUST_B],
      customers: [BETA_QBO],
    });
    const user = userEvent.setup();
    await openCreateFromCustomer(user, "estimate");

    const jobId = decodeURIComponent(
      window.location.hash.replace(/^#\/job\//, "").split("?")[0]
    );
    expect(jobId).toMatch(/^local-/);

    // Switch customer to Beta
    const search = screen.getByTestId("doc-customer-search");
    await user.clear(search);
    await user.type(search, "Beta");
    await user.click(await screen.findByTestId("customer-match"));
    await waitFor(() => expect(screen.getByTestId("doc-customer-search")).toHaveValue("Beta LLC"));

    // Pick Beta's address (fills street + apt)
    await user.click(await screen.findByRole("button", { name: /99 Maple Ave/ }));
    expect(screen.getByTestId("doc-service-address")).toHaveValue("99 Maple Ave");
    expect(screen.getByTestId("doc-service-address-apartment")).toHaveValue("1C");

    await fillFirstLineItem(user);
    await user.click(screen.getByTestId("doc-save"));

    await waitFor(() => {
      const ov = srv.state.ov[jobId];
      expect(ov).toBeTruthy();
      expect(ov.customer).toBe("Beta LLC");
      expect(ov.businessName).toBe("Beta LLC");
      expect(String(ov.qboCustomerId)).toBe("202");
      expect(ov.serviceAddress || ov.address).toBe("99 Maple Ave");
      expect(ov.apartment).toBe("1C");
      expect(ov.estimateLines?.length).toBeGreaterThan(0);
    });
  });

  it("save persists customer + service address on invoice create", async () => {
    const srv = mockServer({ jobs: [CUST_A, CUST_A2] });
    const user = userEvent.setup();
    await openCreateFromCustomer(user, "invoice");

    const jobId = decodeURIComponent(
      window.location.hash.replace(/^#\/job\//, "").split("?")[0]
    );

    await user.click(
      within(screen.getByTestId("doc-service-address-choices")).getByRole("button", { name: /22 Pine Rd/ })
    );
    await user.clear(screen.getByTestId("doc-service-address-apartment"));
    await user.type(screen.getByTestId("doc-service-address-apartment"), "4D");

    await fillFirstLineItem(user);
    await user.click(screen.getByTestId("doc-save"));

    await waitFor(() => {
      const ov = srv.state.ov[jobId];
      expect(ov).toBeTruthy();
      expect(ov.customer).toBe("Alpha Co");
      expect(ov.serviceAddress || ov.address).toBe("22 Pine Rd");
      expect(ov.apartment).toBe("4D");
      expect(ov.invoiceLines?.length).toBeGreaterThan(0);
    });
  });

  it("edit mode does NOT show the changeable customer header", async () => {
    mockServer({
      jobs: [
        {
          ...CUST_A,
          invoiceNo: "9001",
          invoiceLines: [{ itemName: "Labor", qty: 1, unitPrice: 100 }],
        },
      ],
    });
    renderApp("#/job/J-a1?doc=invoice&edit=1");
    await screen.findByTestId("doc-service-address");
    expect(screen.queryByTestId("doc-customer-header")).toBeNull();
    expect(screen.queryByTestId("doc-customer-search")).toBeNull();
  });
});
