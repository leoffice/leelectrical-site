// @vitest-environment jsdom
// Calls tab — SAS answering-service lead tickets: nav tab + unhandled badge,
// ticket cards, Dismiss, Convert-to-job (existing new-job path, prefilled),
// handled state under the reserved ov._sasTickets key, and the mergeJobs
// guard that keeps "_" keys out of the jobs list.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { J1, mockServer, renderApp } from "./helpers.jsx";
import { mergeJobs } from "../src/data/merge.js";
import {
  callMessage,
  callName,
  callPhone,
  isoDate,
  prefillFromCall,
  unhandledCount,
} from "../src/lib/sas.js";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

const CALL = {
  id: "call-abc",
  receivedAt: new Date(Date.now() - 5 * 60000).toISOString(), // 5m ago
  data: {
    source: "sas-flex",
    caller_name: "Jane Lead",
    caller_id: "9175550001",
    main_phone: "9175550001",
    email: "jane@lead.com",
    address: "77 Ocean Pkwy, Brooklyn",
    message: "No power in the kitchen, needs someone today",
    call_outcome: "Message taken",
    appointment_date: "07/06/2026",
    appointment_time: "10:00 AM",
  },
};

const CALL2 = {
  id: "call-def",
  receivedAt: new Date(Date.now() - 60 * 60000).toISOString(),
  data: { caller_first: "Bob", caller_last: "Second", phone: "7185550002", ticket_message: "Panel buzzing" },
};

describe("sas helpers (pure)", () => {
  it("extracts name/phone/message tolerantly + converts SAS dates", () => {
    expect(callName(CALL)).toBe("Jane Lead");
    expect(callName(CALL2)).toBe("Bob Second");
    expect(callName({ id: "x", data: { probe: "hi" } })).toBe("Unknown caller");
    expect(callPhone(CALL)).toBe("9175550001");
    expect(callMessage(CALL2)).toBe("Panel buzzing"); // ticket_message wins
    expect(isoDate("07/06/2026")).toBe("2026-07-06");
    expect(isoDate("garbage")).toBe("");
    const p = prefillFromCall(CALL);
    expect(p).toMatchObject({
      customer: "Jane Lead",
      phone: "9175550001",
      email: "jane@lead.com",
      address: "77 Ocean Pkwy, Brooklyn",
      date: "2026-07-06",
    });
    expect(unhandledCount([CALL, CALL2], { "call-abc": { handled: true } })).toBe(1);
  });

  it("mergeJobs ignores reserved '_' overlay keys — _sasTickets never becomes a job", () => {
    const jobs = mergeJobs([J1], {
      _sasTickets: { "call-abc": { handled: true, _new: true } }, // even _new-looking data
      "local-9": { _new: true, customer: "Real Overlay Job" },
    });
    expect(jobs.map((j) => j.id)).toEqual(["J-1", "local-9"]);
    expect(jobs.find((j) => j.id === "_sasTickets")).toBeUndefined();
  });
});

describe("Calls tab", () => {
  it("shows the 📞 Calls tab in bottom nav + sidebar with unhandled-count badge", async () => {
    mockServer({ sasCalls: [CALL, CALL2], ov: { _sasTickets: { "call-def": { handled: true } } } });
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    const nav = screen.getByTestId("bottom-nav");
    expect(within(nav).getByText("Calls")).toBeInTheDocument();
    expect(within(screen.getByTestId("sidebar")).getByText("Calls")).toBeInTheDocument();
    // 2 calls, 1 already handled -> badge "1"
    await waitFor(() => expect(within(nav).getByText("1")).toBeInTheDocument());
  });

  it("renders lead ticket cards: name, tel: link, relative time, message, type badge, NEW", async () => {
    mockServer({ sasCalls: [CALL] });
    renderApp("#/calls");
    expect(await screen.findByText("Jane Lead")).toBeInTheDocument();
    const tel = screen.getByRole("link", { name: /9175550001/ });
    expect(tel).toHaveAttribute("href", "tel:9175550001");
    expect(screen.getByText("5m ago")).toBeInTheDocument();
    expect(screen.getByText(/No power in the kitchen/)).toBeInTheDocument();
    expect(screen.getByText("Message taken")).toBeInTheDocument(); // call type badge
    expect(screen.getByTestId("call-new")).toBeInTheDocument();
    expect(screen.getByText(/Lead · not in QuickBooks/)).toBeInTheDocument();
  });

  it("Dismiss marks the ticket handled under ov._sasTickets (reserved key) — no QBO commands", async () => {
    const srv = mockServer({ sasCalls: [CALL] });
    const user = userEvent.setup();
    renderApp("#/calls");
    await screen.findByText("Jane Lead");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => {
      const posts = srv.posts("state", (b) => b.ov && b.ov._sasTickets && b.ov._sasTickets["call-abc"]?.handled === true);
      expect(posts).toHaveLength(1);
    });
    expect(screen.queryByTestId("call-new")).not.toBeInTheDocument();
    expect(screen.getByText("Handled ✓")).toBeInTheDocument();
    expect(srv.enqueued()).toHaveLength(0); // leads: nothing on the command bus
  });

  it("Convert to job opens the existing new-job form prefilled, creates a Lead overlay job, marks ticket handled with jobId", async () => {
    const srv = mockServer({ sasCalls: [CALL] });
    const user = userEvent.setup();
    renderApp("#/calls");
    await screen.findByText("Jane Lead");
    await user.click(screen.getByRole("button", { name: /Convert to job/ }));
    // Existing NewJobFlow form, prefilled from the call
    expect(await screen.findByText("New job — details")).toBeInTheDocument();
    expect(screen.getByLabelText("Customer name")).toHaveValue("Jane Lead");
    expect(screen.getByLabelText("Phone")).toHaveValue("9175550001");
    expect(screen.getByLabelText("Email")).toHaveValue("jane@lead.com");
    expect(screen.getByLabelText("Service address")).toHaveValue("77 Ocean Pkwy, Brooklyn");
    expect(screen.getByLabelText("Scheduled date")).toHaveValue("2026-07-06");
    await user.click(screen.getByRole("button", { name: "Create job" }));
    // Overlay job saved via state ov with _new + Lead done
    await waitFor(() => {
      const jobPosts = srv.posts("state", (b) => Object.keys(b.ov || {}).some((k) => k.startsWith("local-")));
      expect(jobPosts.length).toBeGreaterThan(0);
    });
    const ov = srv.state.ov;
    const jobId = Object.keys(ov).find((k) => k.startsWith("local-"));
    expect(ov[jobId]).toMatchObject({ _new: true, customer: "Jane Lead", phone: "9175550001" });
    expect(ov[jobId].status.Lead.s).toBe("done");
    // Ticket handled + linked to the created job
    await waitFor(() => expect(ov._sasTickets?.["call-abc"]).toMatchObject({ handled: true, jobId }));
    // Landed on the new job's detail page
    await waitFor(() => expect(window.location.hash).toBe("#/job/" + encodeURIComponent(jobId)));
  });
});
