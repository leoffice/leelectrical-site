// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("customer QuickBooks link", () => {
  it("new job with new customer enqueues create_customer", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await user.click(screen.getByTestId("fab-add"));
    await user.click(screen.getByText("Add a job"));
    await user.click(screen.getByText("Enter manually"));
    await screen.findByText("New job — details");
    await user.type(screen.getByLabelText("Business name"), "Brand New Co");
    await user.type(screen.getByLabelText("Job title / scope"), "Service call");
    await user.click(screen.getByText("Create job"));
    await waitFor(() => expect(srv.enqueued("create_customer")).toHaveLength(1));
    expect(srv.enqueued("create_customer")[0].payload.name).toBe("Brand New Co");
  });

  it("customer edit without QB id enqueues create_customer not customer_sync", async () => {
    const srv = mockServer({
      jobs: [
        {
          id: "J-NEW",
          customer: "levi tester",
          businessName: "levi tester",
          title: "Test",
          phone: "2196140913",
          email: "levikumer@gmail.com",
          billingAddress: "189 Windsor Way",
          serviceAddress: "1150 Eastern Pkwy",
          paid: false,
          status: { Lead: { s: "done" } },
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-NEW");
    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByTestId("customer-edit-btn"));
    await user.click(screen.getByTestId("cust-save-sync"));
    await waitFor(() => expect(srv.enqueued("create_customer")).toHaveLength(1));
    expect(srv.enqueued("customer_sync")).toHaveLength(0);
  });

  it("create_customer done patches qboCustomerId onto the job", async () => {
    const srv = mockServer({
      jobs: [
        {
          id: "local-99",
          customer: "levi tester",
          businessName: "levi tester",
          title: "Test",
          paid: false,
          status: { Lead: { s: "done" } },
        },
      ],
      commands: [
        {
          id: "c1",
          type: "create_customer",
          jobId: "local-99",
          status: "done",
          result: '{"action":"created","customerId":"1602","name":"levi tester"}',
          idempotencyKey: "create_customer|local-99|1",
        },
      ],
    });
    renderApp("#/job/local-99");
    await waitFor(() => expect(srv.state.ov["local-99"]?.qboCustomerId).toBe("1602"));
  });
});