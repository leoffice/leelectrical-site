// @vitest-environment jsdom
// Integration (#49 + #55) — the reworked New Job form: separate Service /
// Apartment / Billing fields, and the customer smart-search that prefills a
// picked existing customer's details into the form.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
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
    // Billing defaults to "same as service" -> the separate input is hidden…
    expect(screen.getByLabelText("Billing same as service address")).toBeChecked();
    expect(screen.queryByLabelText("Billing address")).not.toBeInTheDocument();
    // …unchecking reveals a distinct Billing address field.
    await user.click(screen.getByLabelText("Billing same as service address"));
    expect(screen.getByLabelText("Billing address")).toBeInTheDocument();
  });

  it("persists service address (as address), apartment, and billing on create", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await openManual(user);

    await user.type(screen.getByLabelText("Customer name"), "Fresh Client");
    await user.type(screen.getByLabelText("Service address"), "12 Oak Ave");
    await user.type(screen.getByLabelText("Apartment #"), "3R");
    await user.click(screen.getByText("Create job"));

    await waitFor(() => {
      const key = Object.keys(srv.state.ov).find((k) => k.startsWith("local-"));
      expect(key).toBeTruthy();
      const ov = srv.state.ov[key];
      expect(ov.customer).toBe("Fresh Client");
      expect(ov.address).toBe("12 Oak Ave"); // canonical service address
      expect(ov.apartment).toBe("3R");
      expect(ov.billingAddress).toBe("12 Oak Ave"); // "same as service" default
    });
  });
});

describe("#55 picking an existing customer prefills their details", () => {
  it("search -> pick fills name, contact from existing jobs, and links qboCustomerId", async () => {
    const drizin = {
      ...JSON.parse(JSON.stringify(J1)),
      id: "J-DZ",
      customer: "Avraham Drizin",
      phone: "718-555-0100",
      email: "az@drizin.com",
      address: "9 Kingston Ave",
      invoiceNo: "",
    };
    const srv = mockServer({
      jobs: [JSON.parse(JSON.stringify(J1)), JSON.parse(JSON.stringify(J2)), drizin],
      customers: [{ name: "Avraham Drizin", id: "34" }],
    });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await openManual(user);

    await user.type(screen.getByLabelText("Customer name"), "Drizin");
    const match = await screen.findByTestId("customer-match");
    expect(match).toHaveTextContent("Avraham Drizin");
    await user.click(match);

    expect(screen.getByLabelText("Customer name")).toHaveValue("Avraham Drizin");
    expect(screen.getByLabelText("Phone")).toHaveValue("718-555-0100");
    expect(screen.getByLabelText("Email")).toHaveValue("az@drizin.com");
    expect(screen.getByLabelText("Service address")).toHaveValue("9 Kingston Ave");

    await user.click(screen.getByText("Create job"));
    await waitFor(() => {
      const key = Object.keys(srv.state.ov).find((k) => k.startsWith("local-"));
      expect(srv.state.ov[key].qboCustomerId).toBe("34");
      expect(srv.state.ov[key].phone).toBe("718-555-0100");
    });
  });
});
