// @vitest-environment jsdom
// Calls tab — SAS answering-service lead tickets: nav tab + unhandled badge,
// ticket cards, Dismiss, Convert-to-job (existing new-job path, prefilled),
// handled state under the reserved ov._sasTickets key, and the mergeJobs
// guard that keeps "_" keys out of the jobs list.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { J1 } from "./helpers.jsx";
import { mergeJobs } from "../src/data/merge.js";
import {
  callMessage,
  callName,
  callPhone,
  callRecording,
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
    expect(callRecording({ data: { recording_url: "https://sas.example/rec/1.mp3" } })).toBe(
      "https://sas.example/rec/1.mp3"
    );
    expect(callRecording({ data: { message: "hi" } })).toBe("");
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


