// @vitest-environment jsdom
// Calendar appointment → job/customer autofill + address suggestions + partial save.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { CAL_WEEK_ANCHOR, J1, mockServer, pinCalWeek, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

const richEvent = {
  id: "ev-autofill",
  summary: "Service call — Brooklyn",
  start: `${CAL_WEEK_ANCHOR}T14:00`,
  location: "200 Service Ave, Brooklyn, NY 11201",
  description:
    "Metro Electric LLC\ncontact: Jane Smith\n718-555-9999\njane@metro.com\nBill to: 50 Billing Blvd, Newark, NJ 07102",
};

describe("appointment autofill e2e", () => {
  beforeEach(() => pinCalWeek());
  afterEach(() => vi.useRealTimers());

  it("calendar job picks up name, phone, email, and billing vs service split", async () => {
    const srv = mockServer({
      jobs: [JSON.parse(JSON.stringify(J1))],
      events: [richEvent],
      addressSuggestions: {
        "50 bill": ["50 Billing Blvd, Newark, NJ 07102"],
      },
    });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");

    await user.click(screen.getByTestId("fab-add"));
    await user.click(screen.getByText("Add a job"));
    await user.click(screen.getByText("Choose from calendar"));
    await user.click(await screen.findByText("Service call — Brooklyn"));

    expect(screen.getByLabelText("Business name")).toHaveValue("Metro Electric LLC");
    expect(screen.getByLabelText("Person name")).toHaveValue("Jane Smith");
    expect(screen.getByLabelText("Phone")).toHaveValue("718-555-9999");
    expect(screen.getByLabelText("Email")).toHaveValue("jane@metro.com");
    expect(screen.getByLabelText("Service address")).toHaveValue("200 Service Ave, Brooklyn, NY 11201");
    expect(screen.getByLabelText("Billing address")).toHaveValue("50 Billing Blvd, Newark, NJ 07102");

    const billing = screen.getByTestId("newjob-billing");
    await user.clear(billing);
    await user.type(billing, "50 Bill");
    const list = await screen.findByTestId("newjob-billing-suggestions");
    await user.click(within(list).getByText("50 Billing Blvd, Newark, NJ 07102"));
    expect(billing).toHaveValue("50 Billing Blvd, Newark, NJ 07102");

    await user.clear(screen.getByTestId("newjob-service"));
    await user.type(screen.getByTestId("newjob-service"), "200 Serv");
    expect(screen.getByTestId("newjob-service")).toHaveValue("200 Serv");

    await user.click(screen.getByText("Create job"));
    await waitFor(() => {
      const key = Object.keys(srv.state.ov).find((k) => k.startsWith("local-"));
      expect(key).toBeTruthy();
      const ov = srv.state.ov[key];
      expect(ov.customer).toBe("Metro Electric LLC");
      expect(ov.phone).toBe("718-555-9999");
      expect(ov.email).toBe("jane@metro.com");
      expect(ov.address).toBe("200 Serv");
      expect(ov.billingAddress).toBe("50 Billing Blvd, Newark, NJ 07102");
      expect(ov.calEventId).toBe("ev-autofill");
    });
  });

  it("create customer from appointment prefills the customer form", async () => {
    const srv = mockServer({ events: [richEvent] });
    const user = userEvent.setup();
    renderApp("#/today");
    await screen.findByTestId("week-calendar");
    await user.click(await screen.findByText("Service call — Brooklyn"));
    await user.click(screen.getByText("＋ Create customer from appointment"));

    await screen.findByTestId("newcustomer-search");
    expect(screen.getByLabelText("Customer name")).toHaveValue("Metro Electric LLC");
    expect(screen.getByLabelText("Person name")).toHaveValue("Jane Smith");
    expect(screen.getByLabelText("Phone")).toHaveValue("718-555-9999");
    expect(screen.getByLabelText("Email")).toHaveValue("jane@metro.com");
    expect(screen.getByLabelText("Service address")).toHaveValue("200 Service Ave, Brooklyn, NY 11201");
    expect(screen.getByLabelText("Billing address")).toHaveValue("50 Billing Blvd, Newark, NJ 07102");

    await user.click(screen.getByTestId("addcustomer-save-sync"));
    await waitFor(() => {
      const key = Object.keys(srv.state.ov).find((k) => k.startsWith("local-"));
      expect(key).toBeTruthy();
      const ov = srv.state.ov[key];
      expect(ov.customer).toBe("Metro Electric LLC");
      expect(ov.billingAddress).toBe("50 Billing Blvd, Newark, NJ 07102");
      expect(ov.serviceAddress).toBe("200 Service Ave, Brooklyn, NY 11201");
    });
  });
});