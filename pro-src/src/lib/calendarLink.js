// Job ↔ calendar appointment linking (calEventId on job + leJobId: tag in description).

import { evStart } from "./format.js";
import { clientKey } from "./customers.js";
import { sortJobs } from "./stages.js";

const JOB_TAG = /(?:^|\n)leJobId:([^\s\n]+)/;

export function jobIdFromEventDescription(desc) {
  const m = String(desc || "").match(JOB_TAG);
  return m ? m[1].trim() : "";
}

export function withJobLink(description, jobId) {
  const base = String(description || "")
    .replace(JOB_TAG, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!jobId) return base;
  const tag = "leJobId:" + jobId;
  return base ? base + "\n" + tag : tag;
}

export function displayEventNotes(desc) {
  return String(desc || "")
    .replace(JOB_TAG, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Find a job linked to this calendar event (primary calEventId or leJobId tag). */
export function linkedJobForEvent(event, jobs) {
  if (!event) return null;
  const eid = event.id || "";
  const tagId = jobIdFromEventDescription(event.description);
  const list = (jobs || []).filter((j) => !j._archived && !j._deleted);
  if (eid) {
    const byCal = list.find((j) => String(j.calEventId || "") === String(eid));
    if (byCal) return byCal;
  }
  if (tagId) return list.find((j) => String(j.id) === String(tagId)) || null;
  return null;
}

/** Active jobs grouped by customer (same keys as the Jobs list). */
export function customerJobGroups(jobs, sortKey = "customer") {
  const active = (jobs || []).filter((j) => !j._archived && !j._deleted);
  const map = new Map();
  for (const j of active) {
    const k = clientKey(j);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(j);
  }
  const nameToGroup = new Map();
  for (const [k, list] of map) {
    if (!k.startsWith("g:")) continue;
    for (const j of list) {
      const n = (j.customer || "").trim().toLowerCase();
      if (n && !nameToGroup.has(n)) nameToGroup.set(n, k);
    }
  }
  for (const [k, list] of [...map]) {
    if (!k.startsWith("c:")) continue;
    const target = nameToGroup.get(k.slice(2));
    if (target) {
      map.set(target, sortJobs(map.get(target).concat(list), sortKey));
      map.delete(k);
    }
  }
  return [...map.entries()]
    .map(([key, list]) => [key, sortJobs(list, sortKey)])
    .sort((a, b) => (a[1][0].customer || "").localeCompare(b[1][0].customer || ""));
}

export function isPendingCalEventId(id) {
  return String(id || "").startsWith("pending-");
}

/** Parse calendar_upsert command result for the Google event id. */
export function parseCalendarUpsertResult(result) {
  if (!result) return null;
  if (typeof result === "object") return result.eventId ? result : null;
  try {
    const o = JSON.parse(String(result));
    return o?.eventId ? o : null;
  } catch {
    return null;
  }
}

function dismissedEventIds(job) {
  return new Set((job?.calDismissedEventIds || []).map((id) => String(id)));
}

export function eventForJob(job, events) {
  const dismissed = dismissedEventIds(job);
  const eid = job?.calEventId || "";
  if (eid && !dismissed.has(String(eid))) {
    const hit = (events || []).find((e) => String(e.id) === String(eid));
    if (hit) return hit;
  }
  if (job?._calUnlinked) return null;
  const jid = String(job?.id || "");
  if (!jid) return null;
  return (
    (events || []).find((e) => {
      if (dismissed.has(String(e.id))) return false;
      return jobIdFromEventDescription(e.description) === jid;
    }) || null
  );
}

export function isCalendarUnlinkCommand(cmd) {
  return String(cmd?.idempotencyKey || "").startsWith("calunlink:");
}

export function calendarUpsertLinksJob(cmd, jobId) {
  if (isCalendarUnlinkCommand(cmd)) return false;
  const desc = cmd?.payload?.description || "";
  return jobIdFromEventDescription(desc) === String(jobId || "");
}

function pendingCalendarUpsert(commands, jobId) {
  return (
    (commands || []).find(
      (c) =>
        c.type === "calendar_upsert" &&
        String(c.jobId) === String(jobId) &&
        (c.status === "queued" || c.status === "working")
    ) || null
  );
}

function latestDoneCalendarUpsert(commands, jobId) {
  const done = (commands || [])
    .filter((c) => c.type === "calendar_upsert" && String(c.jobId) === String(jobId) && c.status === "done")
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  for (const c of done) {
    const parsed = parseCalendarUpsertResult(c.result);
    if (parsed?.eventId) return { cmd: c, eventId: parsed.eventId };
  }
  return null;
}

/** Calendar link state for UI coloring — red / orange (pending) / green (confirmed on Google). */
export function jobCalendarLinkState(job, events, commands) {
  if (job?._calUnlinked) {
    return { confirmed: false, pending: false, event: null, eventId: "" };
  }
  const eid = job?.calEventId || "";
  const event = eventForJob(job, events);
  const pendingCmd = pendingCalendarUpsert(commands, job?.id);
  const doneUpsert = latestDoneCalendarUpsert(commands, job?.id);
  const pendingId = isPendingCalEventId(eid);

  let confirmed = false;
  let pending = false;

  if (doneUpsert?.eventId) {
    confirmed = true;
  } else if (pendingCmd || pendingId) {
    pending = true;
  } else if (eid && event && !pendingId) {
    confirmed = true;
  } else if (
    !job?._calUnlinked &&
    event &&
    job?.id &&
    jobIdFromEventDescription(event.description) === String(job.id)
  ) {
    pending = true;
  }

  return {
    confirmed,
    pending,
    event,
    eventId: doneUpsert?.eventId || (pendingId ? "" : eid),
  };
}

/** ISO date for Jan 1 of the current year (calendar link picker range). */
export function yearStartIso(year = new Date().getFullYear()) {
  return `${year}-01-01`;
}

/** Calendar events from the start of the year onward, newest first. */
export function eventsSinceYearStart(events, year = new Date().getFullYear()) {
  const cut = yearStartIso(year);
  return (events || [])
    .filter((e) => {
      const s = evStart(e);
      return s && s.slice(0, 10) >= cut;
    })
    .sort((a, b) => evStart(b).localeCompare(evStart(a)));
}

/** Search YTD calendar events by summary, location, notes, or date. */
export function searchCalendarEvents(events, query, year = new Date().getFullYear()) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  const base = eventsSinceYearStart(events, year);
  if (!q) return base;
  return base.filter((e) => {
    const hay = [e.summary, e.location, displayEventNotes(e.description), evStart(e)].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  });
}

/** Link appointment ↔ job (clears any prior link on this event or previous job). */
export async function applyAppointmentJobLink({
  event,
  job,
  jobs,
  previousJobId,
  patchAndSave,
  enqueue,
  patchLocalEvent,
}) {
  const eid = event?.id || "";
  const desc = withJobLink(displayEventNotes(event?.description), job.id);
  const prior = linkedJobForEvent(event, jobs);
  if (prior && prior.id !== job.id) {
    const d = [...(prior.calDismissedEventIds || [])];
    if (eid && !d.includes(eid)) d.push(eid);
    await patchAndSave(prior.id, { calEventId: "", _calUnlinked: true, calDismissedEventIds: d });
  }
  if (previousJobId && previousJobId !== job.id) {
    await patchAndSave(previousJobId, { calEventId: "", _calUnlinked: true });
  }
  await patchAndSave(job.id, {
    calEventId: eid,
    _calUnlinked: false,
    calDismissedEventIds: (job.calDismissedEventIds || []).filter((id) => String(id) !== String(eid)),
  });
  if (eid) {
    await enqueue(
      "calendar_upsert",
      job.id,
      {
        calEventId: eid,
        summary: event.summary || "Appointment",
        start: evStart(event),
        location: event.location || "",
        description: desc || "Linked from LE Pro",
      },
      "judgment",
      "callink:" + eid + ":" + job.id
    );
  }
  if (patchLocalEvent && eid) patchLocalEvent(eid, { description: desc });
}

/** Remove job ↔ appointment link (keeps the calendar event). */
export async function unlinkAppointmentJob({
  event,
  job,
  jobId,
  patchJob,
  patchAndSave,
  enqueue,
  patchLocalEvent,
}) {
  const eid = event?.id || "";
  const dismissed = [...(job?.calDismissedEventIds || [])];
  if (eid && !dismissed.includes(eid)) dismissed.push(eid);
  const clearPatch = { calEventId: "", _calUnlinked: true, calDismissedEventIds: dismissed };
  if (jobId && patchJob) patchJob(jobId, clearPatch);
  if (jobId) await patchAndSave(jobId, clearPatch);
  const desc = displayEventNotes(event?.description);
  if (eid) {
    if (patchLocalEvent) patchLocalEvent(eid, { description: desc });
    await enqueue(
      "calendar_upsert",
      jobId || "today",
      {
        calEventId: eid,
        summary: event.summary || "Appointment",
        start: evStart(event),
        location: event.location || "",
        description: desc || "Unlinked in LE Pro",
      },
      "judgment",
      "calunlink:" + eid + ":" + Date.now()
    );
  }
}