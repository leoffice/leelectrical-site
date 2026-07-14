// @vitest-environment jsdom
// The ov overlay lives in Netlify Blobs (eventually consistent): a GET right
// after our own POST can return the PREVIOUS snapshot. A refresh must never
// render that stale snapshot over freshly saved edits (the "phone reverted
// after Save & sync" bug).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mergeJobsStaleGuard } from "../src/data/merge.js";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("stale overlay snapshots never clobber saved edits", () => {
  it("refresh with an OLDER state.ts keeps the just-saved phone on screen", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    renderApp("#/job/J-1");
    await screen.findByText("718-555-1111"); // J1's phone renders

    // Edit -> new phone -> Save & sync in sheet
    await user.click(screen.getByTestId("customer-edit-btn"));
    const phone = await screen.findByLabelText("Phone");
    await user.clear(phone);
    await user.type(phone, "718-555-0199");
    await user.click(screen.getByTestId("cust-save-sync"));
    await waitFor(() =>
      expect(srv.posts("state", (b) => !!b.ov)).toHaveLength(1)
    );
    await screen.findByText("718-555-0199");

    // Simulate blob replication lag: the server now answers state GETs with
    // the PRE-SAVE snapshot (older ts, no overlay for J-1).
    srv.state.ov = {};
    srv.state.stateTs = 5;

    // visibilitychange triggers refreshJobs(true) + refreshCommands
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() =>
      expect(srv.calls.filter((c) => c.path === "jobsdata").length).toBeGreaterThan(1)
    );

    // the stale snapshot must NOT revert the phone
    await waitFor(() => expect(screen.getByText("718-555-0199")).toBeInTheDocument());
    expect(screen.queryByText("718-555-1111")).not.toBeInTheDocument();
  });

  it("mergeJobsStaleGuard keeps saved edits and admits new QBO jobs", () => {
    const prev = [
      { id: "J-1", customer: "Jane", phone: "718-555-0199" },
      { id: "local-1", customer: "Draft", _new: true },
    ];
    const incoming = [
      { id: "J-1", customer: "Jane", phone: "718-555-1111" },
      { id: "qbo-999999", customer: "Fresh Invoice Customer", invoiceNo: "251999" },
    ];
    const merged = mergeJobsStaleGuard(prev, incoming);
    expect(merged.find((j) => j.id === "J-1").phone).toBe("718-555-0199");
    expect(merged.find((j) => j.id === "qbo-999999").customer).toBe("Fresh Invoice Customer");
    expect(merged.find((j) => j.id === "local-1").customer).toBe("Draft");
  });
});
