// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assessReminderAgainstData,
  beginVerifyHold,
  clearReminderAfterVerify,
  isVerifyHeld,
  reminderItemKey,
  verifyReminderItem,
  verifyResultToast,
  __resetVerifyHoldsForTests,
} from "../src/lib/reminderVerify.js";
import { buildReminderList, loadState, STATE_KEY } from "../src/lib/followUpReminders.js";
import { isUnsentDismissed, UNSENT_DISMISS_KEY } from "../src/lib/followUpStatus.js";

afterEach(() => {
  __resetVerifyHoldsForTests();
  localStorage.removeItem(STATE_KEY);
  localStorage.removeItem(UNSENT_DISMISS_KEY);
});

describe("reminderVerify", () => {
  const unsentItem = (job, docKind = "invoice") => ({
    id: "unsent:" + job.id + ":" + docKind,
    kind: "unsent_doc",
    job,
    docKind,
    docNo: job.invoiceNo || job.estimateNo,
  });

  it("reminderItemKey prefers id then unsent shape", () => {
    expect(reminderItemKey({ id: "a" })).toBe("a");
    expect(
      reminderItemKey({ kind: "unsent_doc", job: { id: "J-1" }, docKind: "invoice" })
    ).toBe("unsent:J-1:invoice");
  });

  it("assess clears unsent when QuickBooks already emailed", () => {
    const job = {
      id: "J-1",
      customer: "Bob",
      invoiceNo: "251839",
      invoiceEmailStatus: "EmailSent",
      invoiceEmailedAt: "2026-07-15",
      invoiceHistory: [],
    };
    const r = assessReminderAgainstData(unsentItem(job), { jobs: [job] });
    expect(r.stillNeeded).toBe(false);
    expect(r.reason).toBe("already_sent");
  });

  it("assess keeps unsent when never emailed", () => {
    const job = { id: "J-1", customer: "Bob", invoiceNo: "88", invoiceHistory: [] };
    const r = assessReminderAgainstData(unsentItem(job), { jobs: [job] });
    expect(r.stillNeeded).toBe(true);
    expect(r.reason).toBe("still_unsent");
  });

  it("assess clears paid jobs", () => {
    const job = { id: "J-1", paid: true, invoiceNo: "1", invoiceHistory: [] };
    const r = assessReminderAgainstData(unsentItem(job), { jobs: [job] });
    expect(r.stillNeeded).toBe(false);
    expect(r.reason).toBe("job_closed");
  });

  it("beginVerifyHold hides item from reminder list", () => {
    const job = { id: "J-9", customer: "Bob", invoiceNo: "88", invoiceHistory: [], paid: false };
    const listBefore = buildReminderList([], [job], "2026-07-16");
    expect(listBefore.some((x) => x.kind === "unsent_doc")).toBe(true);
    beginVerifyHold("unsent:J-9:invoice");
    expect(isVerifyHeld("unsent:J-9:invoice")).toBe(true);
    const listAfter = buildReminderList([], [job], "2026-07-16");
    expect(listAfter.some((x) => x.id === "unsent:J-9:invoice")).toBe(false);
  });

  it("verifyReminderItem clears false unsent and dismisses permanently", async () => {
    const job = {
      id: "J-1",
      customer: "Bob",
      invoiceNo: "251839",
      invoiceEmailStatus: "EmailSent",
      invoiceEmailedAt: "2026-07-15",
      invoiceHistory: [],
      paid: false,
    };
    const item = unsentItem(job);
    const result = await verifyReminderItem(item, { jobs: [job], releaseHold: true });
    expect(result.cleared).toBe(true);
    expect(result.reason).toBe("already_sent");
    expect(isUnsentDismissed("J-1", "invoice")).toBe(true);
    expect(buildReminderList([], [job], "2026-07-16")).toHaveLength(0);
  });

  it("verifyReminderItem keeps still-unsent after refresh confirms", async () => {
    const job = { id: "J-2", customer: "Ann", invoiceNo: "99", invoiceHistory: [], paid: false };
    const refreshJobs = vi.fn(async () => ({ jobs: [job] }));
    const result = await verifyReminderItem(unsentItem(job), {
      jobs: [job],
      refreshJobs,
      releaseHold: true,
    });
    expect(result.stillNeeded).toBe(true);
    expect(result.cleared).toBe(false);
    expect(refreshJobs).toHaveBeenCalled();
    expect(isUnsentDismissed("J-2", "invoice")).toBe(false);
  });

  it("clearReminderAfterVerify marks event noReminders", () => {
    const item = {
      id: "sched:ev1",
      kind: "scheduled_reminder",
      event: { id: "ev1", summary: "Follow up" },
      state: { note: "Invoice was created but never emailed" },
      job: { id: "J-1", invoiceNo: "1", invoiceEmailStatus: "EmailSent" },
    };
    clearReminderAfterVerify(item, { reason: "already_sent" });
    const st = loadState().ev1;
    expect(st.noReminders).toBe(true);
    expect(st.verifiedClear).toBe(true);
  });

  it("verifyResultToast uses plain language", () => {
    expect(verifyResultToast({ cleared: true, reason: "already_sent" })).toMatch(/Already sent/i);
    expect(verifyResultToast({ stillNeeded: true, reason: "still_unsent" })).toMatch(/still needs/i);
  });
});
