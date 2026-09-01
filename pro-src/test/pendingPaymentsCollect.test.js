import { describe, it, expect } from "vitest";
import { collectPending } from "../src/lib/pendingPaymentsCollect.js";

describe("pending payment collect", () => {
  it("picks pending check on job and skips approved", () => {
    const jobs = [
      {
        id: "qbo-1",
        pendingCheckPayment: { id: "a", status: "pending", amount: "450" },
      },
      {
        id: "qbo-2",
        pendingCheckPayment: { id: "b", status: "approved", amount: "100" },
      },
    ];
    const list = collectPending(jobs, []);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("a");
    expect(list[0].jobId).toBe("qbo-1");
  });

  it("keeps auto_applied sticky until Got it", () => {
    const jobs = [
      {
        id: "qbo-251741",
        pendingZellePayment: {
          id: "pend-zelle-1",
          status: "auto_applied",
          autoApplied: true,
          confirmationNumber: "JPM99crx431u",
          amount: "1800",
        },
      },
    ];
    expect(collectPending(jobs, [])).toHaveLength(1);
  });

  it("does not re-show approved+autoApplied after reassignment (Sima bounce)", () => {
    // Live bug: job pending stayed status=approved autoApplied=true after Approve to Sima.
    const jobs = [
      {
        id: "qbo-251741",
        customer: "Yechiel marozov",
        pendingZellePayment: {
          id: "pend-zelle-1",
          status: "approved",
          autoApplied: true,
          confirmationNumber: "JPM99crx431u",
          amount: "1800",
          jobId: "qbo-251741",
        },
      },
    ];
    expect(collectPending(jobs, [])).toHaveLength(0);
  });

  it("suppresses system queue sticky when conf already lives on another job", () => {
    // Payment on Sima; system queue still points at Marozov auto_applied.
    const jobs = [
      {
        id: "qbo-251741",
        customer: "Yechiel marozov",
        payments: [],
      },
      {
        id: "local-sima",
        customer: "Sima Expediter",
        payments: [{ id: "pay-1", amount: "1800", ref: "JPM99crx431u" }],
      },
    ];
    const systemItems = [
      {
        id: "pend-zelle-1",
        status: "auto_applied",
        autoApplied: true,
        confirmationNumber: "JPM99crx431u",
        jobId: "qbo-251741",
        customer: "Yechiel marozov",
        amount: "1800",
      },
    ];
    expect(collectPending(jobs, systemItems)).toHaveLength(0);
  });

  it("still shows auto_applied when conf is on the same job (Got it needed)", () => {
    const jobs = [
      {
        id: "qbo-1",
        payments: [{ id: "pay-1", amount: "1800", ref: "JPM99aa" }],
        pendingZellePayment: {
          id: "pend-1",
          status: "auto_applied",
          autoApplied: true,
          confirmationNumber: "JPM99aa",
          jobId: "qbo-1",
        },
      },
    ];
    expect(collectPending(jobs, [])).toHaveLength(1);
  });

  it("hides acked tombstone in system queue", () => {
    const systemItems = [
      {
        id: "pend-zelle-1",
        status: "acked",
        ackedAt: Date.now(),
        confirmationNumber: "JPM99crx431u",
      },
    ];
    expect(collectPending([], systemItems)).toHaveLength(0);
  });

  it("stays O(jobs) when many jobs have payments (no N² freeze)", () => {
    const jobs = [];
    for (let i = 0; i < 800; i++) {
      jobs.push({
        id: "j-" + i,
        payments: [{ id: "p-" + i, amount: "10", ref: "REF" + i }],
      });
    }
    jobs[0].pendingZellePayment = {
      id: "pend-1",
      status: "pending",
      confirmationNumber: "UNIQUE-OPEN",
      amount: "50",
      jobId: "j-0",
    };
    const t0 = Date.now();
    const list = collectPending(jobs, []);
    const ms = Date.now() - t0;
    expect(list).toHaveLength(1);
    // Indexed path should be well under a second even in jsdom; N² used to hang phones.
    expect(ms).toBeLessThan(250);
  });
});
