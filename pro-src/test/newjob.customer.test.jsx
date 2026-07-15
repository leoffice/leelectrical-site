// @vitest-environment jsdom
// Integration (#49 + #55) — the reworked New Job form: separate Service /
// Apartment / Billing fields, and the customer smart-search that prefills a
// picked existing customer's details into the form.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { J1, J2, mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

const openManual = async (user) => {
  await user.click(screen.getByTestId("fab-add"));
  await user.click(screen.getByText("Add a job"));
  await user.click(screen.getByText("Enter manually"));
  await screen.findByText("New job — details");
};

describe("#49 New Job form — split addresses + apartment", () => {
  it("shows separate Service address, Apartment #, and Billing address fields", async () => {
    mockServer();
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await openManual(user);

    expect(screen.getByLabelText("Service address")).toBeInTheDocument();
    expect(screen.getByLabelText("Apartment #")).toBeInTheDocument();
    expect(screen.getByLabelText("Billing address")).toBeInTheDocument();
    expect(screen.getByLabelText("Person name")).toBeInTheDocument();
    expect(screen.getByLabelText("Business name")).toBeInTheDocument();
  });

  it("persists service address (as address), apartment, and billing on create", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await openManual(user);

    await user.type(screen.getByLabelText("Business name"), "Fresh Client");
    await user.type(screen.getByLabelText("Service address"), "12 Oak Ave");
    await user.tab();
    await user.clear(screen.getByLabelText("Billing address"));
    await user.type(screen.getByLabelText("Billing address"), "99 Bill St");
    await user.type(screen.getByLabelText("Apartment #"), "3R");
    await user.click(screen.getByText("Create job"));

    await waitFor(() => {
      const key = Object.keys(srv.state.ov).find((k) => k.startsWith("local-"));
      expect(key).toBeTruthy();
      const ov = srv.state.ov[key];
      expect(ov.customer).toBe("Fresh Client");
      expect(ov.address).toBe("12 Oak Ave"); // canonical service address
      expect(ov.apartment).toBe("3R");
      expect(ov.billingAddress).toBe("99 Bill St");
    });
  });
});

describe("#55 job title picker — open invoices/estimates", () => {
  it("shows open docs for the picked customer in the title dropdown", async () => {
    mockServer({
      jobs: [
        {
          ...JSON.parse(JSON.stringify(J1)),
          id: "J-OPEN",
          customer: "Meir Kabakov",
          businessName: "Meir Kabakov",
          invoiceNo: "251900",
          title: "Basement lights",
          paid: false,
          qboCustomerId: "246",
        },
      ],
      customers: [{ name: "Meir Kabakov", id: "246", phone: "718-1", email: "m@x.com", billingAddress: "10 Main" }],
    });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Basement lights");
    await openManual(user);
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByTestId("newjob-business-name"), "Meir");
    await user.click(await within(dialog).findByTestId("customer-match"));
    const picker = await within(dialog).findByTestId("newjob-title-picker");
    expect(picker).toHaveTextContent("Invoice #251900");
    await user.selectOptions(picker, "invoice:251900");
    expect(within(dialog).getByLabelText("Job title / scope")).toHaveValue("Basement lights");
  });
});

describe("#55 picking an existing customer prefills their details", () => {
  it("search -> pick fills name, contact from existing jobs, and links qboCustomerId", async () => {
    const drizin = {
      ...JSON.parse(JSON.stringify(J1)),
      id: "J-DZ",
      customer: "Avraham Drizin",
      businessName: "Avraham Drizin",
      phone: "718-555-0100",
      email: "az@drizin.com",
      address: "9 Kingston Ave",
      serviceAddress: "9 Kingston Ave",
      invoiceNo: "",
    };
    const srv = mockServer({
      jobs: [JSON.parse(JSON.stringify(J1)), JSON.parse(JSON.stringify(J2)), drizin],
      customers: [
        {
          name: "Avraham Drizin",
          id: "34",
          businessName: "Avraham Drizin",
          phone: "718-555-0100",
          email: "az@drizin.com",
          billingAddress: "500 Lefferts Ave",
          personName: "Avraham",
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await openManual(user);

    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByTestId("newjob-business-name"), "Drizin");
    const match = await within(dialog).findByTestId("customer-match");
    expect(match).toHaveTextContent("Avraham Drizin");
    await user.click(match);

    await waitFor(() => expect(within(dialog).getByLabelText("Phone")).toHaveValue("718-555-0100"));
    expect(within(dialog).getByLabelText("Email")).toHaveValue("az@drizin.com");
    expect(within(dialog).getByLabelText("Billing address")).toHaveValue("500 Lefferts Ave");
    expect(within(dialog).getByLabelText("Person name")).toHaveValue("Avraham");
    expect(within(dialog).getByLabelText("Service address")).toHaveValue("");

    await user.click(screen.getByText("Create job"));
    await waitFor(() => {
      const key = Object.keys(srv.state.ov).find((k) => k.startsWith("local-"));
      expect(srv.state.ov[key].customer).toBe("Avraham Drizin");
      expect(srv.state.ov[key].businessName).toBe("Avraham Drizin");
      expect(srv.state.ov[key].qboCustomerId).toBe("34");
      expect(srv.state.ov[key].phone).toBe("718-555-0100");
    });
  });
});

describe("#49 four-field customer search — business, person, phone, email", () => {
  const customers = [
    {
      name: "Drizin Properties",
      id: "34",
      businessName: "Drizin Properties",
      personName: "Avraham Drizin",
      phone: "718-555-0100",
      email: "az@drizin.com",
      billingAddress: "500 Lefferts Ave",
    },
    {
      name: "Chanan Sheleg",
      id: "49",
      businessName: "Chanan Sheleg",
      personName: "",
      phone: "3474448520",
      email: "hanan770@gmail.com",
      billingAddress: "499 schenectedy ave",
    },
  ];

  const openNewCustomer = async (user) => {
    await user.click(screen.getByTestId("fab-add"));
    await user.click(screen.getByText("Add a customer"));
    await screen.findByTestId("newcustomer-search");
  };

  it.each([
    ["business name", "Drizin", "Drizin Properties", "718-555-0100", "az@drizin.com"],
    ["person name", "Avraham", "Drizin Properties", "718-555-0100", "az@drizin.com"],
    ["phone", "3474448520", "Chanan Sheleg", "3474448520", "hanan770@gmail.com"],
    ["email", "hanan770", "Chanan Sheleg", "3474448520", "hanan770@gmail.com"],
  ])("search by %s yields results and sub-populates on pick", async (_label, query, expectBiz, expectPhone, expectEmail) => {
    mockServer({ customers });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await openNewCustomer(user);
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByTestId("newcustomer-search"), query);
    const match = await within(dialog).findByTestId("customer-match");
    expect(match).toHaveTextContent(expectBiz);
    await user.click(match);
    await waitFor(() => expect(within(dialog).getByLabelText("Phone")).toHaveValue(expectPhone));
    expect(within(dialog).getByLabelText("Email")).toHaveValue(expectEmail);
  });
});
