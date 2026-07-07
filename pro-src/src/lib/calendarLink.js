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

export function eventForJob(job, events) {
  const eid = job?.calEventId || "";
  if (!eid) return null;
  return (events || []).find((e) => String(e.id) === String(eid)) || null;
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
  if (prior && prior.id !== job.id) await patchAndSave(prior.id, { calEventId: "" });
  if (previousJobId && previousJobId !== job.id) await patchAndSave(previousJobId, { calEventId: "" });
  await patchAndSave(job.id, { calEventId: eid });
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
export async function unlinkAppointmentJob({ event, jobId, patchAndSave, enqueue, patchLocalEvent }) {
  if (jobId) await patchAndSave(jobId, { calEventId: "" });
  const eid = event?.id || "";
  const desc = displayEventNotes(event?.description);
  if (eid) {
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
      "calunlink:" + eid
    );
    if (patchLocalEvent) patchLocalEvent(eid, { description: desc });
  }
}