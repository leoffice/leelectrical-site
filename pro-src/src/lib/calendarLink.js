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

/** Product-stamped markers LE Pro used to write into Google Calendar descriptions. */
const PRODUCT_MARKER_RE =
  /^(Created|Linked|Scheduled|Unlinked|Updated)\s+(in|from)\s+.+$/i;

/**
 * True when the description is empty or only a product stamp
 * ("Created in LE Pro", "Linked from …", etc.) — not real user notes.
 */
export function isProductCalendarMarker(desc) {
  const s = displayEventNotes(desc);
  if (!s) return true;
  // Allow multi-line only if every non-empty line is a marker (rare).
  const lines = s.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return lines.length > 0 && lines.every((l) => PRODUCT_MARKER_RE.test(l));
}

/**
 * Description for calendar_upsert — NEVER clobber user Google Calendar notes.
 *
 * - Prefer real notes (job / event description), cleaned of legacy leJobId tags.
 * - When updating an existing Google event (`calEventId`), return null so the
 *   host PATCH omits `description` unless we have real notes to write.
 * - Brand-new events may still get a create marker when notes are empty.
 *
 * @param {{ notes?: string, calEventId?: string, createFallback?: string }} opts
 * @returns {string|null} description to send, or null to omit the field
 */
export function calendarUpsertDescription({ notes, calEventId, createFallback } = {}) {
  const cleaned = displayEventNotes(notes);
  if (cleaned && !isProductCalendarMarker(cleaned)) return cleaned;
  // Existing Google event: do not send a marker-only overwrite.
  if (calEventId && !isPendingCalEventId(calEventId)) return null;
  if (cleaned) return cleaned; // rare: marker text the user somehow typed as only content
  return createFallback != null ? createFallback : `Created in ${productName()}`;
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
  return tokenHitsNorm(normToken(hay), token);
}

/**
 * tokenHits against an ALREADY-normalized haystack.
 *
 * The haystack is the event's whole text, and the old tokenHits re-normalized
 * it on every call — up to five times per job, for every job, for every event.
 * At LE's data size that was ~2.4M regex passes over the same strings and made
 * the reminder badge take ~0.9s on each jobs/events/commands change
 * (Levi 2026-07-28). Callers in a loop must hoist the normalization.
 */
function tokenHitsNorm(normHay, token) {
  return tokenHitsBothNorm(normHay, normToken(token));
}

/** Both sides pre-normalized — the form the scoring loops use. */
function tokenHitsBothNorm(normHay, t, words) {
  if (!t || t.length < 3) return false;
  if (normHay.includes(t)) return true;
  const parts = words || t.split(" ").filter((w) => w.length >= 3);
  return parts.length > 0 && parts.every((w) => normHay.includes(w));
}

/** Pre-split the multi-word fallback so the loops don't re-split per event. */
function normEntry(raw) {
  const t = normToken(raw);
  return { t, words: t.split(" ").filter((w) => w.length >= 3) };
}

/** Suggested jobs matching a calendar event (reverse of suggestAppointmentsForJob). */
/**
 * Normalized match fields per job, cached against the jobs ARRAY identity.
 *
 * Scoring re-normalized every job's name/company/address/title once per event.
 * Over a reminder build that is jobs × events normalizations of strings that
 * never changed; caching per array turns it into jobs, once (Levi 2026-07-28).
 * The store hands out a stable array unless the data really changed, so the
 * cache hits on every subsequent event in the same pass.
 */
const jobMatchIndexCache = new WeakMap();

function jobMatchIndex(jobs) {
  const list = jobs || [];
  const hit = jobMatchIndexCache.get(list);
  if (hit) return hit;
  const built = [];
  for (const j of list) {
    if (j._archived || j._deleted) continue;
    const customer = j.customer || "";
    const company = j.businessName || "";
    const address = j.serviceAddress || j.address || "";
    const nCustomer = normEntry(customer);
    const nCompany = normEntry(company);
    built.push({
      job: j,
      nCustomer,
      nCompany,
      nAddress: normEntry(address),
      nStreet: normEntry(address.split(",")[0].trim()),
      nTitle: normEntry(j.title || ""),
      streetLen: address.split(",")[0].trim().length,
      invoiceNo: j.invoiceNo ? String(j.invoiceNo) : "",
      distinctCompany: !!company && nCompany.t !== nCustomer.t,
    });
  }
  try {
    jobMatchIndexCache.set(list, built);
  } catch {
    /* non-object (frozen/primitive) — just skip caching */
  }
  return built;
}

export function suggestJobsForEvent(event, jobs, limit = 5) {
  const hay = [event?.summary, event?.location, displayEventNotes(event?.description)].filter(Boolean).join(" ");
  // Normalize the event text ONCE, not once per job per field.
  const normHay = normToken(hay);
  const normLoc = event?.location ? normToken(event.location) : normHay;
  const scored = [];
  for (const e of jobMatchIndex(jobs)) {
    let score = 0;
    if (tokenHitsBothNorm(normHay, e.nCustomer.t, e.nCustomer.words)) score += 4;
    if (e.distinctCompany && tokenHitsBothNorm(normHay, e.nCompany.t, e.nCompany.words)) score += 3;
    if (e.streetLen >= 5) {
      if (tokenHitsBothNorm(normLoc, e.nStreet.t, e.nStreet.words)) score += 5;
      else if (tokenHitsBothNorm(normHay, e.nAddress.t, e.nAddress.words)) score += 4;
    }
    if (e.nTitle.t && tokenHitsBothNorm(normHay, e.nTitle.t, e.nTitle.words)) score += 2;
    if (e.invoiceNo && hay.includes(e.invoiceNo)) score += 3;
    if (score > 0) scored.push({ job: e.job, score });
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
  // Job side is fixed here — normalize it once, then walk the events.
  const sameCompany = company && normToken(company) === normToken(customer);
  for (const e of base) {
    const hay = [e.summary, e.location, displayEventNotes(e.description)].filter(Boolean).join(" ");
    const normHay = normToken(hay);
    let score = 0;
    if (tokenHitsNorm(normHay, customer)) score += 4;
    if (company && !sameCompany && tokenHitsNorm(normHay, company)) score += 3;
    if (street.length >= 5) {
      if (tokenHitsNorm(e.location ? normToken(e.location) : normHay, street)) score += 5;
      else if (tokenHitsNorm(normHay, address)) score += 4;
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
  // Preserve real Google notes; never replace them with "Linked from …".
  const desc = calendarUpsertDescription({
    notes: event?.description,
    calEventId: eid,
    createFallback: `Linked from ${productName()}`,
  });
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
    const payload = {
      calEventId: eid,
      summary: event.summary || "Appointment",
      start: evStart(event),
      location: event.location || "",
    };
    if (desc != null) payload.description = desc;
    await enqueue("calendar_upsert", job.id, payload, "judgment", "callink:" + eid + ":" + job.id);
  }
  // Local mirror: keep real notes; only stamp when there were none.
  if (patchLocalEvent && eid) {
    patchLocalEvent(eid, {
      description: desc != null ? desc : displayEventNotes(event?.description),
    });
  }
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
  // Keep user notes on unlink — do not stamp "Unlinked in …" over them.
  const desc = calendarUpsertDescription({
    notes: event?.description,
    calEventId: eid,
    createFallback: "", // omit marker entirely when notes empty
  });
  if (eid) {
    if (patchLocalEvent) {
      patchLocalEvent(eid, {
        description: desc != null ? desc : displayEventNotes(event?.description),
      });
    }
    const payload = {
      calEventId: eid,
      summary: event.summary || "Appointment",
      start: evStart(event),
      location: event.location || "",
    };
    if (desc) payload.description = desc;
    await enqueue(
      "calendar_upsert",
      jobId || "today",
      payload,
      "judgment",
      "calunlink:" + eid + ":" + Date.now()
    );
  }
}