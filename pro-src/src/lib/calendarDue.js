// Follow-up buckets, auto paperwork reminders, and Jobs To Do / Upcoming filters.
import { todayStr } from "./format.js";

export const PAPERWORK_REMINDER_DAYS = 7;

export function addDays(dateStr, days) {
  const d = new Date(String(dateStr) + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function followUpDate(job) {
  return (job.followUp && job.followUp.date) || "";
}

export function scheduledJobDate(job) {
  return (job.status && job.status.Scheduled && job.status.Scheduled.d) || "";
}

export function nextActionDate(job) {
  const ds = [scheduledJobDate(job), followUpDate(job)].filter(Boolean);
  return ds.length ? ds.sort()[0] : "";
}

export function hasFollowUp(job) {
  return !!followUpDate(job);
}

export function followUpLabel(job) {
  const fu = job.followUp || {};
  return fu.text || fu.type || "Follow up";
}

/** Group unpaid jobs with a follow-up date into Calendar sections. */
export function bucketFollowUps(jobs, today = todayStr()) {
  const eligible = jobs.filter((j) => !j.paid && !j._archived && !j._deleted && hasFollowUp(j));
  const tomorrow = addDays(today, 1);
  const in3 = addDays(today, 3);

  const overdue = [];
  const todayDue = [];
  const tomorrowDue = [];
  const next3 = [];
  const later = [];

  const sorted = eligible.slice().sort((a, b) => followUpDate(a).localeCompare(followUpDate(b)));

  for (const j of sorted) {
    const d = followUpDate(j);
    if (d < today) overdue.push(j);
    else if (d === today) todayDue.push(j);
    else if (d === tomorrow) tomorrowDue.push(j);
    else if (d > tomorrow && d <= in3) next3.push(j);
    else later.push(j);
  }

  return { overdue, todayDue, tomorrowDue, next3, later, all: sorted };
}

/** Marking a paperwork step complete resets a 1-week follow-up reminder. */
export function followUpFromPaperworkStep(branchKey, stepName) {
  const branchLabel =
    branchKey === "coned" ? "Con Ed" : branchKey === "dob" ? "City permit" : "Paperwork";
  return {
    type: "Paperwork / permits",
    text: `Update: ${stepName} (${branchLabel})`,
    date: addDays(todayStr(), PAPERWORK_REMINDER_DAYS),
    remind: true,
  };
}

/** Jobs → To Do: overdue or due today. */
export function isToDoJob(job, today = todayStr()) {
  return !job.paid && hasFollowUp(job) && followUpDate(job) <= today;
}

/** Jobs → Upcoming: future follow-up or scheduled job date. */
export function isUpcomingJob(job, today = todayStr()) {
  if (job.paid || job._archived || job._deleted) return false;
  const fd = followUpDate(job);
  if (fd && fd > today) return true;
  const sd = scheduledJobDate(job);
  return !!(sd && sd > today);
}

export function dueDateTone(dateStr, today = todayStr()) {
  if (!dateStr) return "muted";
  if (dateStr < today) return "overdue";
  if (dateStr === today) return "today";
  return "upcoming";
}