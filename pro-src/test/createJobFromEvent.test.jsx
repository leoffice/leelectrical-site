// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import CreateJobFromEventSheet from "../src/components/CreateJobFromEventSheet.jsx";

const setNewJob = vi.fn();

vi.mock("../src/state/store.jsx", () => ({
  useStore: () => ({
    jobs: [
      {
        id: "J-1",
        customer: "Bob Builder",
        qboCustomerId: "42",
        serviceAddress: "10 Main St",
        billingAddress: "50 Bill Blvd",
        invoiceNo: "251100",
        title: "Panel upgrade",
      },
      {
        id: "J-2",
        customer: "Bob Builder",
        qboCustomerId: "42",
        serviceAddress: "20 Pine Rd",
        title: "Rough-in",
      },
    ],
    setNewJob,
  }),
}));

afterEach(() => {
  cleanup();
  setNewJob.mockClear();
});

describe("CreateJobFromEventSheet — service address picker", () => {
  const event = {
    id: "ev-1",
    summary: "Service call — Bob",
    start: "2026-07-10T10:00",
    location: "99 Oak Ave",
    description: "customer Bob Builder phone: 718-555-0000",
  };

  it("lists customer service addresses instead of job link suggestions", async () => {
    const user = userEvent.setup();
    render(<CreateJobFromEventSheet event={event} onClose={() => {}} />);
    expect(screen.getByText(/Pick a service address for/)).toBeInTheDocument();
    expect(screen.getByText("Bob Builder")).toBeInTheDocument();
    expect(screen.getByText("Service addresses")).toBeInTheDocument();
    expect(screen.getByText("10 Main St")).toBeInTheDocument();
    expect(screen.getByText("20 Pine Rd")).toBeInTheDocument();
    expect(screen.queryByText(/link to this job/i)).toBeNull();
    expect(screen.queryByText(/Other matches/i)).toBeNull();
    await user.click(screen.getByText("10 Main St"));
    expect(setNewJob).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "form",
        prefill: expect.objectContaining({
          customer: "Bob Builder",
          serviceAddress: "10 Main St",
          title: "Service call — Bob",
          invoiceNo: "",
        }),
      })
    );
  });

  it("shows calendar location when it is a new address", async () => {
    const user = userEvent.setup();
    render(<CreateJobFromEventSheet event={event} onClose={() => {}} />);
    expect(screen.getByText("99 Oak Ave")).toBeInTheDocument();
    expect(screen.getByText("From this appointment")).toBeInTheDocument();
    await user.click(screen.getByText("New address"));
    expect(setNewJob).toHaveBeenCalledWith(
      expect.objectContaining({
        prefill: expect.objectContaining({ serviceAddress: "99 Oak Ave" }),
      })
    );
  });
});