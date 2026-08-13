// permitInquiry — the Needs-Attention Con Ed inquiry lifecycle (Levi 2026-08-13).
//
// Flow: Levi writes the inquiry on the card → Send queues a task for Israel to
// submit it at Energy Services (bus cmd coned_submit_inquiry) → we wait to be
// NOTIFIED it was actually submitted (agent flips the command done, or Levi
// taps agent-confirmed) → then up to 48h for the emailed answer → the reply is
// matched back to the case by case number in the subject/body (LEVI-DEFAULT #4)
// and posts on the card.
//
// State lives at job.paperwork.coned.inquiry + the universal confirmation
// record (permitConfirm) so the 24h flag / re-nudge model applies unchanged.

import {
  buildActionConfirmedPatch,
  buildActionFiredPatch,
  permitConfirmConfig,
} from "./permitConfirm.js";

export const INQUIRY_CMD = "coned_submit_inquiry";
export const INQUIRY_SKILL = "coned-submit-inquiry";

export function inquiryActionKey(jobId) {
  return `inquiry:${jobId}`;
}

export function getInquiry(job) {
  const inq = job?.paperwork?.coned?.inquiry;
  return inq && typeof inq === "object" ? inq : null;
}

function nowIso(now) {
  return new Date(now ?? Date.now()).toISOString();
}
const HOUR_MS = 3600_000;

/** Bus payload for Israel: submit this inquiry at Energy Services. */
export function buildInquiryPayload(job, { text = "", caseNumber = "" } = {}) {
  return {
    skill: INQUIRY_SKILL,
    kind: "submit_inquiry",
    jobId: job?.id || "",
    caseNumber:
      String(caseNumber || job?.paperwork?.coned?.caseNumber || "").trim(),
    text: String(text || "").trim().slice(0, 2000),
    customer: job?.customer || job?.personName || "",
    address: job?.serviceAddress || job?.address || "",
    stopAt: "submit",
    autoSubmit: false,
  };
}

/** Idempotency key for the bus command (prefix-searchable per job). */
export function inquiryIdempotencyKey(jobId, now = Date.now()) {
  return `inquiry:${jobId}:${new Date(now).toISOString().slice(0, 10)}`;
}

/** Send: stamp the inquiry blob + fire the universal confirmation record. */
export function buildInquirySendPatch(job, { text = "", caseNumber = "", now } = {}) {
  const cn = String(caseNumber || job?.paperwork?.coned?.caseNumber || "").trim();
  const fired = buildActionFiredPatch(job, inquiryActionKey(job?.id), {
    kind: "submit_inquiry",
    via: `bus:${INQUIRY_CMD}`,
    meta: { caseNumber: cn, text: String(text || "").slice(0, 200) },
    now,
  });
  return {
    ...fired,
    paperwork: {
      coned: {
        inquiry: {
          ...(getInquiry(job) || {}),
          text: String(text || "").trim(),
          caseNumber: cn,
          status: "sent",
          sentAt: nowIso(now),
          submittedAt: "",
          submitConfirmedBy: "",
          answeredAt: "",
          answer: "",
          responseReceived: false,
        },
      },
    },
  };
}

/** Confirmed actually submitted at Energy Services (agent notification). */
export function buildInquirySubmittedPatch(job, { by = "agent", source = "", now } = {}) {
  const confirmed = buildActionConfirmedPatch(job, inquiryActionKey(job?.id), {
    by,
    source,
    now,
  });
  return {
    ...confirmed,
    paperwork: {
      coned: {
        inquiry: {
          ...(getInquiry(job) || {}),
          status: "submitted",
          submittedAt: nowIso(now),
          submitConfirmedBy: by,
          submitConfirmSource: source,
        },
      },
    },
  };
}

/** The emailed answer landed — post it on the card and resolve the inquiry. */
export function buildInquiryAnswerPatch(job, { answer = "", source = "", now } = {}) {
  return {
    paperwork: {
      coned: {
        inquiry: {
          ...(getInquiry(job) || {}),
          status: "answered",
          answer: String(answer || "").trim().slice(0, 2000),
          answerSource: source,
          answeredAt: nowIso(now),
          responseReceived: true,
        },
      },
    },
  };
}

/**
 * Lifecycle phase for the card chip:
 *   none | sent | flagged_submit | submitted | flagged_reply | answered
 * sent → flagged_submit after flagAfterHours (24h) without submit confirmation.
 * submitted → flagged_reply after inquiryReplyWindowHours (48h) without answer.
 */
export function inquiryPhase(job, { now = Date.now(), config } = {}) {
  const inq = getInquiry(job);
  if (!inq || !inq.status || inq.status === "removed") return "none";
  const cfg = permitConfirmConfig(config);
  if (inq.status === "answered" || inq.responseReceived) return "answered";
  if (inq.status === "submitted") {
    const t = Date.parse(inq.submittedAt || "");
    if (Number.isFinite(t) && now - t > cfg.inquiryReplyWindowHours * HOUR_MS) {
      return "flagged_reply";
    }
    return "submitted";
  }
  if (inq.status === "sent") {
    const t = Date.parse(inq.sentAt || "");
    if (Number.isFinite(t) && now - t > cfg.flagAfterHours * HOUR_MS) {
      return "flagged_submit";
    }
    return "sent";
  }
  // customer_notified / response_received legacy blobs → treat as answered
  if (inq.status === "response_received") return "answered";
  return "none";
}

/** Find this job's in-flight inquiry bus command (by idempotency-key prefix). */
export function findInquiryCommand(commands, jobId) {
  const prefix = `inquiry:${jobId}:`;
  const list = (commands || []).filter((c) =>
    String(c?.idempotencyKey || "").startsWith(prefix)
  );
  if (!list.length) return null;
  return list.sort(
    (a, b) => (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0)
  )[0];
}

/**
 * Match an inbound Con Ed email insight back to this inquiry (LEVI-DEFAULT #4:
 * by case number in the subject/body, received after the inquiry was sent).
 * Returns { answer, source } or null.
 */
export function matchInquiryReplyInsight(job, insights, { now = Date.now() } = {}) {
  const inq = getInquiry(job);
  if (!inq || !["sent", "submitted"].includes(inq.status)) return null;
  const cn = String(inq.caseNumber || job?.paperwork?.coned?.caseNumber || "").trim();
  if (!cn) return null;
  const sentTs = Date.parse(inq.sentAt || "") || 0;
  const hits = (insights || []).filter((ins) => {
    if (!ins) return false;
    const st = String(ins.status || "").toLowerCase();
    if (!["approved", "auto_applied", "applied"].includes(st)) return false;
    if (ins.jobId && job?.id && ins.jobId !== job.id) return false;
    const subject = String(ins.source?.subject || ins.subject || "");
    const body = String(ins.source?.snippet || ins.summary || ins.body || "");
    if (!subject.toLowerCase().includes(cn.toLowerCase()) && !body.toLowerCase().includes(cn.toLowerCase())) {
      return false;
    }
    // reply-ish only: mentions inquiry/response, or arrived after we sent
    const recv = Date.parse(ins.source?.receivedAt || ins.receivedAt || "") || 0;
    const inquiryish = /inquir|response|reply|answer/i.test(subject + " " + body);
    return recv > sentTs && (inquiryish || recv > sentTs);
  });
  if (!hits.length) return null;
  const best = hits.sort(
    (a, b) =>
      (Date.parse(b.source?.receivedAt || b.receivedAt || "") || 0) -
      (Date.parse(a.source?.receivedAt || a.receivedAt || "") || 0)
  )[0];
  const answer =
    String(best.summary || best.source?.snippet || best.source?.subject || "").trim() ||
    "Con Ed replied — open the email for details.";
  return { answer, source: `insight:${best.id || best.source?.messageId || ""}` };
}

/** Friendly copy for the lifecycle chip (single source for UI text). */
export function describeInquiryPhase(phase, inq, { now = Date.now() } = {}) {
  const hrsSince = (iso) => {
    const t = Date.parse(iso || "");
    return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / HOUR_MS)) : 0;
  };
  switch (phase) {
    case "sent":
      return {
        tone: "sent",
        ico: "📤",
        label: "Inquiry sent to Israel — awaiting confirmation it was submitted at Energy Services.",
        sub: inq?.text ? `“${inq.text.slice(0, 140)}”` : "",
      };
    case "flagged_submit":
      return {
        tone: "flag",
        ico: "🚩",
        label: `Sent ${hrsSince(inq?.sentAt)}h ago — still no confirmation it was submitted.`,
        sub: "Flagged. Re-nudge Israel or re-send.",
      };
    case "submitted":
      return {
        tone: "confirmed",
        ico: "✅",
        label: "Confirmed submitted at Energy Services. Waiting for the reply (up to 48h) — it arrives by email and posts here.",
        sub: "",
      };
    case "flagged_reply":
      return {
        tone: "flag",
        ico: "🚩",
        label: `Submitted ${hrsSince(inq?.submittedAt)}h ago — no reply from Con Ed yet.`,
        sub: "Past the reply window — flagged. Re-nudge for a response.",
      };
    case "answered":
      return {
        tone: "answered",
        ico: "💬",
        label: inq?.answer || "Con Ed replied — see the email.",
        sub: inq?.answeredAt
          ? `Posted from email · ${new Date(inq.answeredAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · inquiry resolved.`
          : "Inquiry resolved.",
      };
    default:
      return null;
  }
}
