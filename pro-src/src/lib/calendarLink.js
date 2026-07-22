// Job ↔ calendar appointment linking — primary link is calEventId on the job.
// Legacy leJobId: tags in descriptions are still stripped for display / reverse lookup,
// but we never write them into Google Calendar notes (Levi 2026-07-22).

import { evStart } from "./format.js";
import { clientKey } from "./customers.js";
import { sortJobs } from "./stages.js";
import { productName, tenantCalendarAccount } from "./tenantBranding.js";

const JOB_TAG = /(?:^|\n)leJobId:([^\s\n]+)/;

export function jobIdFromEventDescription(desc) {
  const m = String(desc || "").match(JOB_TAG);
  return m ? m[1].trim() : "";
}

/** Clean notes for Google Calendar — strips any legacy leJobId tag; does not re-add one. */
export function withJobLink(description, _jobId) {
  return displayEventNotes(description);
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

function eventStartKey(e) {
  return String(evStart(e) || e?.start || "").slice(0, 16);
}

/** Same title + start slot — used to drop optimistic pendings once Google returns the real row. */
export function eventsMatchApptSlot(a, b) {
  if (!a || !b) return false;
  return (a.summary || "") === (b.summary || "") && eventStartKey(a) === eventStartKey(b);
}

/**
 * Merge pulled Google events with local optimistic "pending-*" rows.
 * Drop a pending when a real event already occupies the same title+start (prevents
 * triple copies after duplicate: original + pending + pulled real).
 */
export function mergePendingCalendarEvents(prev, pulled) {
  const pulledList = Array.isArray(pulled) ? pulled : [];
  const pending = (prev || []).filter((e) => isPendingCalEventId(e.id));
  const merged = [...pulledList];
  for (const p of pending) {
    const covered = pulledList.some((e) => !isPendingCalEventId(e.id) && eventsMatchApptSlot(e, p));
    if (covered) continue;
    if (!merged.some((e) => String(e.id) === String(p.id))) merged.push(p);
  }
  return merged;
}

/**
 * When calendar_upsert finishes, drop all matching pendings and ensure the real event id is present.
 * match(e) is an optional extra predicate (e.g. same leJobId for caldup).
 */
export function promotePendingCalendarEvent(evs, eventId, pl, match) {
  if (!eventId) return evs || [];
  const startKey = String(pl?.start || "").slice(0, 16);
  const rest = (evs || []).filter((e) => {
    if (!isPendingCalEventId(e.id)) return true;
    if (typeof match === "function" && match(e)) return false;
    if ((e.summary || "") === (pl?.summary || "") && eventStartKey(e) === startKey) return false;
    return true;
  });
  if (rest.some((e) => String(e.id) === String(eventId))) return rest;
  return rest.concat([
    {
      id: eventId,
      summary: pl?.summary || "",
      start: pl?.start || "",
      location: pl?.location || "",
      description: pl?.description || "",
    },
  ]);
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

/** All synced calendar events (no date filter), newest first. */
export function allCalendarEvents(events) {
  return (events || [])
    .filter((e) => evStart(e))
    .sort((a, b) => evStart(b).localeCompare(evStart(a)));
}

/** ISO date for the rolling 365-day window (legacy picker range). */
export function rollingYearCutIso(now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() - 365);
  return d.toISOString().slice(0, 10);
}

/** ISO date one year ahead (calendar search upper bound). */
export function forwardYearCutIso(now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() + 365);
  return d.toISOString().slice(0, 10);
}

/** Calendar events from the past year onward, newest first. */
export function eventsWithinPastYear(events, now = new Date()) {
  const cut = rollingYearCutIso(now);
  return (events || [])
    .filter((e) => {
      const s = evStart(e);
      return s && s.slice(0, 10) >= cut;
    })
    .sort((a, b) => evStart(b).localeCompare(evStart(a)));
}

/** Calendar search window — Jan 1 this year through one year ahead. */
export function eventsWithinCalendarSearch(events, now = new Date()) {
  const start = yearStartIso(now.getFullYear());
  const end = forwardYearCutIso(now);
  return (events || [])
    .filter((e) => {
      const s = evStart(e);
      const day = s ? s.slice(0, 10) : "";
      return day && day >= start && day <= end;
    })
    .sort((a, b) => evStart(b).localeCompare(evStart(a)));
}

/** Best initial search for linking — street line, then customer name. */
export function appointmentSearchSeed(job) {
  const street = String(job?.serviceAddress || job?.address || "")
    .split(",")[0]
    .trim();
  if (street.length >= 5) return street;
  return String(job?.customer || job?.businessName || "").trim();
}

function normToken(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenHits(hay, token) {
  const t = normToken(token);
  if (!t || t.length < 3) return false;
  const h = normToken(hay);
  if (h.includes(t)) return true;
  const words = t.split(" ").filter((w) => w.length >= 3);
  return words.length > 0 && words.every((w) => h.includes(w));
}

/** Suggested jobs matching a calendar event (reverse of suggestAppointmentsForJob). */
export function suggestJobsForEvent(event, jobs, limit = 5) {
  const hay = [event?.summary, event?.location, displayEventNotes(event?.description)].filter(Boolean).join(" ");
  const active = (jobs || []).filter((j) => !j._archived && !j._deleted);
  const scored = [];
  for (const j of active) {
    const customer = j.customer || "";
    const company = j.businessName || "";
    const address = j.serviceAddress || j.address || "";
    const street = address.split(",")[0].trim();
    let score = 0;
    if (tokenHits(hay, customer)) score += 4;
    if (company && normToken(company) !== normToken(customer) && tokenHits(hay, company)) score += 3;
    if (street.length >= 5) {
      if (tokenHits(event?.location || hay, street)) score += 5;
      else if (tokenHits(hay, address)) score += 4;
    }
    if (j.title && tokenHits(hay, j.title)) score += 2;
    if (j.invoiceNo && hay.includes(String(j.invoiceNo))) score += 3;
    if (score > 0) scored.push({ job: j, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || (b.job.customer || "").localeCompare(a.job.customer || ""))
    .slice(0, limit)
    .map((s) => s.job);
}

/** Suggested appointments matching customer name, company, or service address. */
export function suggestAppointmentsForJob(job, events, _year, limit = 8) {
  const customer = job?.customer || "";
  const company = job?.businessName || "";
  const address = job?.serviceAddress || job?.address || "";
  const street = address.split(",")[0].trim();
  const base = eventsWithinCalendarSearch(events);
  const scored = [];
  for (const e of base) {
    const hay = [e.summary, e.location, displayEventNotes(e.description)].filter(Boolean).join(" ");
    let score = 0;
    if (tokenHits(hay, customer)) score += 4;
    if (company && normToken(company) !== normToken(customer) && tokenHits(hay, company)) score += 3;
    if (street.length >= 5) {
      if (tokenHits(e.location || hay, street)) score += 5;
      else if (tokenHits(hay, address)) score += 4;
    }
    if (score > 0) scored.push({ event: e, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || evStart(b.event).localeCompare(evStart(a.event)))
    .slice(0, limit)
    .map((s) => s.event);
}

/** Search calendar events (this year + one year ahead) by summary, location, notes, or date. */
export function searchCalendarEvents(events, query, now = new Date()) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  const base = eventsWithinCalendarSearch(events, now);
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
        // Written into the Google Calendar event, i.e. external stored data:
        // a rename affects only NEW events, and any future reader must
        // tolerate both the old and new wording.
        description: desc || `Linked from ${productName()}`,
      },
      "judgment",
      "callink:" + eid + ":" + job.id
    );
  }
  if (patchLocalEvent && eid) patchLocalEvent(eid, { description: desc });
}

/** Google Calendar day or event deep-link for the tenant's office account. */
export function googleCalendarOpenUrl({ event, dateYmd, account = tenantCalendarAccount() }) {
  const auth = "?authuser=" + encodeURIComponent(account);
  const d =
    dateYmd ||
    (event ? evStart(event).slice(0, 10) : "") ||
    "";
  const dayPath = d ? "/" + d.replace(/-/g, "/") : "";
  const dayUrl = "https://calendar.google.com/calendar/u/0/r/day" + dayPath + auth;
  const eid = event?.id;
  if (!eid) return dayUrl;
  try {
    const raw = String(eid).includes("@") ? String(eid) : String(eid) + "@google.com";
    const b64 = btoa(unescape(encodeURIComponent(raw))).replace(/=+$/, "");
    return "https://calendar.google.com/calendar/event?eid=" + encodeURIComponent(b64) + auth;
  } catch {
    return dayUrl;
  }
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
        description: desc || `Unlinked in ${productName()}`,
      },
      "judgment",
      "calunlink:" + eid + ":" + Date.now()
    );
  }
}