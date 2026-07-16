// Verify-a-reminder — check email/send status against real data, clear false nags.
// Press Verify → brief hold (~10s) while checking → gone forever if stale, else back.
import { lastDocSend } from "./docSendStatus.js";
import {
  docNeverSent,
  dismissUnsentDoc,
  hasDoc,
} from "./followUpStatus.js";
import {
  cancelStaleUnsentReminders,
  dismissEventReminders,
  loadState,
  patchEventState,
} from "./followUpReminders.js";
import {
  beginVerifyHold,
  clearVerifyHold,
  reminderItemKey,
  VERIFY_HOLD_MS,
} from "./reminderVerifyHold.js";

export {
  VERIFY_HOLD_MS,
  beginVerifyHold,
  clearVerifyHold,
  reminderItemKey,
  isVerifyHeld,
  filterVerifyHeld,
  __resetVerifyHoldsForTests,
} from "./reminderVerifyHold.js";

/**
 * Resolve the job for a reminder item from the latest jobs array.
 */
export function jobForReminderItem(item, jobs) {
  if (!item) return null;
  const id = item.job?.id;
  if (id && jobs?.length) {
    const found = jobs.find((j) => String(j.id) === String(id));
    if (found) return found;
  }
  return item.job || null;
}

/**
 * Assess whether this reminder still needs action against real send/email data.
 * Pure — does not mutate storage.
 */
export function assessReminderAgainstData(item, { jobs, commands = [], events = [] } = {}) {
  if (!item) return { stillNeeded: false, reason: "missing" };
  const job = jobForReminderItem(item, jobs);
  const cmds = commands || [];

  if (job?.paid || job?._archived || job?._deleted) {
    return { stillNeeded: false, reason: "job_closed", detail: "Job is paid or closed" };
  }

  if (item.kind === "unsent_doc") {
    const kind = item.docKind || "invoice";
    if (!job || !hasDoc(job, kind)) {
      return { stillNeeded: false, reason: "no_doc", detail: "No document on file", docKind: kind };
    }
    if (!docNeverSent(job, kind, cmds)) {
      const last = lastDocSend(job, kind);
      const when = last?.date ? " on " + String(last.date).slice(0, 10) : "";
      const to = last?.to ? " to " + last.to : "";
      return {
        stillNeeded: false,
        reason: "already_sent",
        detail: (kind === "invoice" ? "Invoice" : "Estimate") + " already emailed" + when + to,
        docKind: kind,
      };
    }
    return {
      stillNeeded: true,
      reason: "still_unsent",
      detail: (kind === "invoice" ? "Invoice" : "Estimate") + " still not emailed",
      docKind: kind,
    };
  }

  if (item.event?.id || item.state) {
    const note = String(
      item.state?.note || item.state?.nudge || item.detail || item.assessment?.nudge || ""
    ).toLowerCase();
    const unsentish =
      /never (email|sent)|not (been )?email|hasn'?t been email|created but never|ready but hasn'?t|open.*send|unsent|email (invoice|estimate)/.test(
        note
      ) || item.state?.autoPostponed === true;

    if (job && unsentish) {
      const invSent = hasDoc(job, "invoice") && !docNeverSent(job, "invoice", cmds);
      const estSent = hasDoc(job, "estimate") && !docNeverSent(job, "estimate", cmds);
      if (invSent || estSent) {
        if (/payment follow-up|check back in a week|worth a friendly payment/.test(note) && invSent) {
          return { stillNeeded: true, reason: "payment_followup", detail: "Payment follow-up still open" };
        }
        return {
          stillNeeded: false,
          reason: "already_sent",
          detail: invSent ? "Invoice already emailed" : "Estimate already emailed",
        };
      }
      if (hasDoc(job, "invoice") && docNeverSent(job, "invoice", cmds)) {
        return { stillNeeded: true, reason: "still_unsent", detail: "Invoice still not emailed", docKind: "invoice" };
      }
      if (hasDoc(job, "estimate") && docNeverSent(job, "estimate", cmds)) {
        return { stillNeeded: true, reason: "still_unsent", detail: "Estimate still not emailed", docKind: "estimate" };
      }
    }

    if (item.kind === "inspection") {
      return { stillNeeded: true, reason: "inspection_open", detail: "Inspection still on the calendar" };
    }

    if (job?.paid) {
      return { stillNeeded: false, reason: "job_closed", detail: "Job is paid" };
    }
    return { stillNeeded: true, reason: "still_open", detail: "Still needs your attention" };
  }

  if (job) {
    for (const kind of ["invoice", "estimate"]) {
      if (hasDoc(job, kind) && !docNeverSent(job, kind, cmds)) {
        if (item.docKind === kind || item.kind === "unsent_doc") {
          return { stillNeeded: false, reason: "already_sent", detail: kind + " already emailed", docKind: kind };
        }
      }
    }
  }

  return { stillNeeded: true, reason: "still_open", detail: "Still needs your attention" };
}

/** Permanently clear a reminder that verify confirmed is not needed. */
export function clearReminderAfterVerify(item, assessment = {}) {
  if (!item) return;
  clearVerifyHold(reminderItemKey(item));

  if (item.kind === "unsent_doc" && item.job?.id && item.docKind) {
    dismissUnsentDoc(item.job.id, item.docKind);
  }

  if (item.event?.id) {
    dismissEventReminders(item.event.id, { noReminders: true });
    patchEventState(item.event.id, {
      staleCancelAt: Date.now(),
      staleCancelReason: assessment.reason || "verified_clear",
      verifiedClear: true,
    });
  }
}

/** Release hold so a still-needed reminder can show again. */
export function releaseReminderAfterVerify(item) {
  clearVerifyHold(reminderItemKey(item));
}

/**
 * Full verify pass for one reminder.
 * Optionally refreshes jobs from the store first, then re-assesses.
 */
export async function verifyReminderItem(item, opts = {}) {
  const key = reminderItemKey(item);
  // Hold may already be set by the button (hide UI immediately).
  const heldUntil = beginVerifyHold(key);
  let jobs = opts.jobs || [];
  const events = opts.events || [];
  let commands = opts.commands || [];

  let assessment = assessReminderAgainstData(item, { jobs, commands, events });
  if (!assessment.stillNeeded) {
    clearReminderAfterVerify(item, assessment);
    cancelStaleUnsentReminders(events, jobs, commands);
    return {
      stillNeeded: false,
      cleared: true,
      reason: assessment.reason,
      detail: assessment.detail || "Cleared — already handled",
      heldUntil,
    };
  }

  if (typeof opts.refreshJobs === "function") {
    try {
      const meta = await opts.refreshJobs(true);
      // Prefer the just-fetched list so we don't race React setState.
      if (meta?.jobs?.length) jobs = meta.jobs;
    } catch {
      /* offline */
    }
    if (typeof opts.refreshCommands === "function") {
      try {
        const cmds = await opts.refreshCommands();
        if (Array.isArray(cmds)) commands = cmds;
      } catch {
        /* keep */
      }
    } else if (typeof opts.getCommands === "function") {
      try {
        commands = opts.getCommands() || commands;
      } catch {
        /* keep */
      }
    }
  }

  cancelStaleUnsentReminders(events, jobs, commands);
  assessment = assessReminderAgainstData(item, { jobs, commands, events });

  if (!assessment.stillNeeded) {
    clearReminderAfterVerify(item, assessment);
    return {
      stillNeeded: false,
      cleared: true,
      reason: assessment.reason,
      detail: assessment.detail || "Cleared after check",
      heldUntil,
    };
  }

  // Still needed: leave the hold in place so UI stays hidden ~10s, then caller releases.
  // Pure tests pass { releaseHold: true } to unstick immediately.
  if (opts.releaseHold) releaseReminderAfterVerify(item);
  return {
    stillNeeded: true,
    cleared: false,
    reason: assessment.reason,
    detail: assessment.detail || "Still needs attention",
    heldUntil,
  };
}

/** Human toast after verify. */
export function verifyResultToast(result) {
  if (!result) return "Checked";
  if (result.cleared) {
    if (result.reason === "already_sent") return "Already sent — reminder cleared";
    if (result.reason === "job_closed") return "Job closed — reminder cleared";
    return "Checked out — reminder cleared";
  }
  if (result.reason === "still_unsent") return "Confirmed — still needs to be emailed";
  return "Confirmed — still on your list";
}

export { loadState };
