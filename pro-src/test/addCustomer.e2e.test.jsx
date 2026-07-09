// @vitest-environment jsdom
// E2E — unified Add customer flow: one form, live QBO match, Save & sync paths.
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

const customers = [
  {
    name: "Drizin Properties",
    id: "34",
    businessName: "Drizin Properties",
    personName: "Avraham Drizin",
    phone: "718-555-0100",
    email: "az@drizin.com",
    billingAddress: "500 Lefferts Ave",
    serviceAddress: "502 Lefferts Ave, Brooklyn, NY",
  },
  {
    name: "Chanan Sheleg",
    id: "49",
    businessName: "Chanan Sheleg",
    personName: "",
    phone: "3474448520",
    email: "hanan770@gmail.com",
    billingAddress: "499 schenectedy ave",
    serviceAddress: "499 Schenectady Ave, Brooklyn, NY",
  },
];

const openAddCustomer = async (user) => {
  await user.click(screen.getByTestId("fab-add"));
  await user.click(screen.getByText("Add a customer"));
  await screen.findByTestId("newcustomer-search");
};

describe("Add customer — unified flow", () => {
  it("opens single form directly (no import/create chooser)", async () => {
    mockServer({ customers });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await openAddCustomer(user);
    expect(screen.getByText("Add customer")).toBeInTheDocument();
    expect(screen.getByLabelText("Billing address")).toBeInTheDocument();
    expect(screen.getByLabelText("Service address")).toBeInTheDocument();
    expect(screen.queryByText("Import from QuickBooks")).not.toBeInTheDocument();
    expect(screen.queryByText("Create new customer")).not.toBeInTheDocument();
  });

  it("brand-new customer enqueues create_customer on Save & sync", async () => {
    const srv = mockServer({ customers });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await openAddCustomer(user);
    const dialog = screen.getByRole("dialog");

    await user.type(within(dialog).getByTestId("newcustomer-search"), "Totally New LLC");
    await user.type(within(dialog).getByLabelText("Phone"), "917-555-9999");
    await user.click(within(dialog).getByTestId("addcustomer-save-sync"));

    await waitFor(() => expect(srv.enqueued("create_customer")).toHaveLength(1));
    const cmd = srv.enqueued("create_customer")[0];
    expect(cmd.payload.name).toBe("Totally New LLC");
    expect(cmd.payload.phone).toBe("917-555-9999");
    expect(srv.enqueued("import_customer")).toHaveLength(0);
    expect(srv.enqueued("update_customer")).toHaveLength(0);
  });

  it("matched + unchanged links existing customer (import_customer, no create/update)", async () => {
    const srv = mockServer({ customers });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await openAddCustomer(user);
    const dialog = screen.getByRole("dialog");

    await user.type(within(dialog).getByTestId("newcustomer-search"), "Drizin");
    await user.click(await within(dialog).findByTestId("customer-match"));
    await waitFor(() => expect(within(dialog).getByLabelText("Phone")).toHaveValue("718-555-0100"));
    expect(within(dialog).queryByTestId("addcustomer-sync-choice")).not.toBeInTheDocument();

    await user.click(within(dialog).getByTestId("addcustomer-save-sync"));

    await waitFor(() => expect(srv.enqueued("import_customer")).toHaveLength(1));
    const imp = srv.enqueued("import_customer")[0];
    expect(imp.payload.qboId).toBe("34");
    expect(srv.enqueued("create_customer")).toHaveLength(0);
    expect(srv.enqueued("update_customer")).toHaveLength(0);

    const key = Object.keys(srv.state.ov).find((k) => k.startsWith("local-"));
    expect(srv.state.ov[key].qboCustomerId).toBe("34");
  });

  it("matched + edited -> Update in QB enqueues update_customer", async () => {
    const srv = mockServer({ customers });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await openAddCustomer(user);
    const dialog = screen.getByRole("dialog");

    await user.type(within(dialog).getByTestId("newcustomer-search"), "Drizin");
    await user.click(await within(dialog).findByTestId("customer-match"));
    await waitFor(() => expect(within(dialog).getByLabelText("Phone")).toHaveValue("718-555-0100"));

    await user.clear(within(dialog).getByLabelText("Phone"));
    await user.type(within(dialog).getByLabelText("Phone"), "718-555-0199");
    expect(within(dialog).getByTestId("addcustomer-sync-choice")).toBeInTheDocument();
    await user.click(within(dialog).getByTestId("addcustomer-action-update"));
    await user.click(within(dialog).getByTestId("addcustomer-save-sync"));

    await waitFor(() => expect(srv.enqueued("update_customer")).toHaveLength(1));
    const upd = srv.enqueued("update_customer")[0];
    expect(upd.payload.id).toBe("34");
    expect(upd.payload.phone).toBe("718-555-0199");
    expect(srv.enqueued("create_customer")).toHaveLength(0);
  });

  it("matched + edited with different business name -> Create new enqueues create_customer", async () => {
    const srv = mockServer({ customers });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await openAddCustomer(user);
    const dialog = screen.getByRole("dialog");

    await user.type(within(dialog).getByTestId("newcustomer-search"), "Drizin");
    await user.click(await within(dialog).findByTestId("customer-match"));
    await waitFor(() => expect(within(dialog).getByLabelText("Customer name")).toHaveValue("Drizin Properties"));

    await user.clear(within(dialog).getByLabelText("Customer name"));
    await user.type(within(dialog).getByLabelText("Customer name"), "New Corp Holdings");
    await user.click(within(dialog).getByTestId("addcustomer-action-create"));
    await user.click(within(dialog).getByTestId("addcustomer-save-sync"));

    await waitFor(() => expect(srv.enqueued("create_customer")).toHaveLength(1));
    expect(srv.enqueued("create_customer")[0].payload.name).toBe("New Corp Holdings");
    expect(srv.enqueued("update_customer")).toHaveLength(0);
  });

  it("same business name -> Create new is grayed out / disabled", async () => {
    mockServer({ customers });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await openAddCustomer(user);
    const dialog = screen.getByRole("dialog");

    await user.type(within(dialog).getByTestId("newcustomer-search"), "Drizin");
    await user.click(await within(dialog).findByTestId("customer-match"));
    await waitFor(() => expect(within(dialog).getByLabelText("Email")).toHaveValue("az@drizin.com"));

    await user.clear(within(dialog).getByLabelText("Email"));
    await user.type(within(dialog).getByLabelText("Email"), "newemail@x.com");

    const createRadio = within(dialog).getByTestId("addcustomer-action-create");
    expect(createRadio).toBeDisabled();
    expect(within(dialog).getByText(/business name already in QB/i)).toBeInTheDocument();
  });

  it("match popup shows search + new-customer on top and full customer details per row", async () => {
    mockServer({ customers });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await openAddCustomer(user);
    const dialog = screen.getByRole("dialog");

    await user.type(within(dialog).getByTestId("newcustomer-search"), "Drizin");
    const results = await within(dialog).findByTestId("customer-search-results");
    expect(within(results).getByTestId("customer-match-search")).toBeInTheDocument();
    expect(within(results).getByTestId("customer-add-new")).toHaveTextContent(/this is a new customer/i);

    const match = await within(results).findByTestId("customer-match");
    expect(within(match).getByTestId("customer-match-business")).toHaveTextContent("Drizin Properties");
    expect(within(match).getByTestId("customer-match-person")).toHaveTextContent("Avraham Drizin");
    expect(within(match).getByTestId("customer-match-phone")).toHaveTextContent("718-555-0100");
    expect(within(match).getByTestId("customer-match-email")).toHaveTextContent("az@drizin.com");
    expect(within(match).getByTestId("customer-match-billing")).toHaveTextContent("500 Lefferts Ave");
    expect(within(match).getByTestId("customer-match-service")).toHaveTextContent("502 Lefferts Ave");
  });

  it("billing address live match finds QBO customer", async () => {
    mockServer({ customers });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await openAddCustomer(user);
    const dialog = screen.getByRole("dialog");

    await user.type(within(dialog).getByTestId("newcustomer-billing"), "499 schenect");
    const match = await within(dialog).findByTestId("customer-match");
    expect(match).toHaveTextContent("Chanan Sheleg");
    await user.click(match);
    await waitFor(() => expect(within(dialog).getByLabelText("Customer name")).toHaveValue("Chanan Sheleg"));
  });

  it("sub company toggle reveals parent company picker", async () => {
    mockServer({ customers });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await openAddCustomer(user);
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).queryByTestId("newcustomer-parent")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("switch", { name: "Sub company" }));
    expect(within(dialog).getByTestId("newcustomer-parent")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("switch", { name: "Sub company" }));
    expect(within(dialog).queryByTestId("newcustomer-parent")).not.toBeInTheDocument();
  });
});