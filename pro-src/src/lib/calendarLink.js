// Job ↔ calendar appointment linking (calEventId on job + leJobId: tag in description).

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