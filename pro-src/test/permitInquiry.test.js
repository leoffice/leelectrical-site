// permitInquiry — composer lifecycle: send → confirmed-submitted → 48h reply window → answer.
import { describe, expect, it } from "vitest";
import {
  buildInquiryAnswerPatch,
  buildInquiryPayload,
  buildInquirySendPatch,
  buildInquirySubmittedPatch,
  findInquiryCommand,
  inquiryPhase,
  matchInquiryReplyInsight,
} from "../src/lib/permitInquiry.js";
import { getPermitAction } from "../src/lib/permitConfirm.js";

const T0 = Date.parse("2026-08-13T12:00:00Z");
const HOUR = 3600_000;
const iso = (t) => new Date(t).toISOString();

const baseJob = () => ({
  id: "J9",
  customer: "Devon Pierce",
  serviceAddress: "456 Grand Concourse",
  paperwork: { coned: { caseNumber: "MC-76880" } },
});

function apply(job, patch) {
  return {
    ...job,
    ...patch,
    paperwork: {
      ...(job.paperwork || {}),
      coned: { ...(job.paperwork?.coned || {}), ...(patch.paperwork?.coned || {}) },
    },
  };
}

describe("inquiry lifecycle", () => {
  it("send stamps the blob + universal fired record; phase walks send→flag→submitted→reply-flag→answered", () => {
    let job = baseJob();
    expect(inquiryPhase(job, { now: T0 })).toBe("none");

    job = apply(job, buildInquirySendPatch(job, { text: "What docs are outstanding?", now: T0 }));
    expect(job.paperwork.coned.inquiry.status).toBe("sent");
    expect(job.paperwork.coned.inquiry.caseNumber).toBe("MC-76880");
    expect(getPermitAction(job, "inquiry:J9").firedAt).toBeTruthy();
    expect(inquiryPhase(job, { now: T0 + HOUR })).toBe("sent");
    // >24h without submit confirmation → flagged
    expect(inquiryPhase(job, { now: T0 + 26 * HOUR })).toBe("flagged_submit");

    job = apply(job, buildInquirySubmittedPatch(job, { by: "agent", source: "cmd:c1", now: T0 + 2 * HOUR }));
    expect(inquiryPhase(job, { now: T0 + 3 * HOUR })).toBe("submitted");
    expect(getPermitAction(job, "inquiry:J9").confirmedBy).toBe("agent");
    // >48h without reply → flagged
    expect(inquiryPhase(job, { now: T0 + 2 * HOUR + 49 * HOUR })).toBe("flagged_reply");

    job = apply(job, buildInquiryAnswerPatch(job, { answer: "Load letter + $340 deposit", source: "insight:i1", now: T0 + 20 * HOUR }));
    expect(inquiryPhase(job, { now: T0 + 21 * HOUR })).toBe("answered");
    expect(job.paperwork.coned.inquiry.answer).toContain("deposit");
  });

  it("payload carries skill + case number + text for Israel", () => {
    const p = buildInquiryPayload(baseJob(), { text: "hello" });
    expect(p.skill).toBe("coned-submit-inquiry");
    expect(p.caseNumber).toBe("MC-76880");
    expect(p.text).toBe("hello");
    expect(p.autoSubmit).toBe(false);
  });

  it("finds the latest inquiry command by idempotency-key prefix", () => {
    const cmds = [
      { id: "a", idempotencyKey: "inquiry:J9:2026-08-12", status: "done", createdAt: iso(T0 - 30 * HOUR) },
      { id: "b", idempotencyKey: "inquiry:J9:2026-08-13", status: "queued", createdAt: iso(T0) },
      { id: "c", idempotencyKey: "inquiry:OTHER:2026-08-13", status: "done", createdAt: iso(T0) },
    ];
    expect(findInquiryCommand(cmds, "J9").id).toBe("b");
    expect(findInquiryCommand(cmds, "NOPE")).toBeNull();
  });

  it("matches the emailed reply by case number after sentAt (LEVI-DEFAULT #4)", () => {
    let job = baseJob();
    job = apply(job, buildInquirySendPatch(job, { text: "docs?", now: T0 }));
    const insights = [
      // wrong case number → ignored
      { id: "i0", status: "auto_applied", jobId: "J9", source: { subject: "Case MC-99999 response", receivedAt: iso(T0 + HOUR) } },
      // before send → ignored
      { id: "i1", status: "auto_applied", jobId: "J9", source: { subject: "MC-76880 inquiry response", receivedAt: iso(T0 - HOUR) } },
      // the real reply
      { id: "i2", status: "auto_applied", jobId: "J9", summary: "Two items outstanding — load letter and deposit.", source: { subject: "Re: Inquiry MC-76880", receivedAt: iso(T0 + 5 * HOUR) } },
    ];
    const m = matchInquiryReplyInsight(job, insights, { now: T0 + 6 * HOUR });
    expect(m).toBeTruthy();
    expect(m.answer).toContain("outstanding");
    expect(m.source).toBe("insight:i2");
    // unapplied insights never match
    const none = matchInquiryReplyInsight(job, [{ id: "x", status: "pending", jobId: "J9", source: { subject: "MC-76880", receivedAt: iso(T0 + HOUR) } }]);
    expect(none).toBeNull();
  });
});
