// openCasesView — pure derivation for the redesigned Open Cases tab.
//
// Takes the live board (buildPermitBoard output) + jobs + fleet caseRuns and
// produces per-JOB cards with two independent rails (Con Ed / DOB), status
// buckets (In Progress / Needs Attention / Completed), the >7-day stale rule,
// a compact step trail, a verification indicator, and an always-visible
// "last update + what was submitted" line. No network, no React — the view
// stays live because it re-derives from `jobs` on every board change.

import { caseTrackIsStale, staleDays } from "./permitConfirm.js";

/**
 * Needs-attention for the redesign = the agency ball is genuinely with us
 * (stage bucket Waiting-on-us / At-risk) — NOT the softer recommender
 * elevation (withCaseRecommendations flags any required next step as
 * blocked-by-us, which would paint nearly every card red). Staleness is
 * layered on by the caller.
 */
export function trackNeedsAttention(row) {
  if (!row) return false;
  return row.stageBucket === "Waiting-on-us" || row.stageBucket === "At-risk";
}

/* Compact rails — real stage vocab mapped onto a readable 5/6-bead trail
   (approved mockup LE-permits-redesign-v2). */
export const CONED_RAIL = ["Filed", "Layout", "Survey", "Inspection", "Final", "Meter"];
export const DOB_RAIL = ["Filed", "Review", "Permit", "Inspection", "Sign-off"];

export const CONED_RAIL_IDX = {
  application_filed: 0,
  docs_pending: 0,
  tracked: 0,
  at_risk: 0,
  layout_issued: 1,
  survey_service_date: 2,
  awaiting_initial_visit: 3,
  initial_inspection: 3,
  field_crew: 3,
  deposit_due: 3,
  no_show_reschedule: 3,
  final_checklist_wait: 4,
  ready_for_final: 4,
  final_inspection: 4,
  failed_rework: 4,
  passed_complete: 5,
  meter_turn_on: 5,
  cancelled: 5,
};
export const DOB_RAIL_IDX = {
  filing_submitted: 0,
  under_review: 1,
  objections: 1,
  permit_issued: 2,
  inspection_scheduled: 3,
  inspection_passed: 3,
  inspection_failed: 3,
  signed_off: 4,
  cancelled: 4,
};

export function railForAgency(agency) {
  return agency === "coned" ? CONED_RAIL : DOB_RAIL;
}
export function railIndex(agency, stage) {
  const map = agency === "coned" ? CONED_RAIL_IDX : DOB_RAIL_IDX;
  return map[stage] ?? 0;
}

/**
 * Visual tone for a track's big friendly status:
 * done | action | inspect | review | submitted | pending
 * (stale gets layered on top by the caller).
 */
export function trackTone(row) {
  if (!row) return "pending";
  if (row.stageBucket === "Passed" || row.stageBucket === "Terminal") return "done";
  if (trackNeedsAttention(row)) return "action";
  const st = String(row.stage || "");
  if (row.agency === "coned") {
    if (["initial_inspection", "final_inspection", "field_crew"].includes(st)) return "inspect";
    if (st === "tracked" || !st) return "pending";
    return "submitted";
  }
  if (st === "inspection_scheduled") return "inspect";
  if (st === "permit_issued") return "review";
  if (!st) return "pending";
  return "submitted";
}

function shortWhen(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Human line for one permit event (what was submitted / what happened). */
function eventText(ev) {
  const subject = String(ev?.subject || "").trim();
  if (subject) return subject.replace(/^re:\s*/i, "").slice(0, 120);
  const type = String(ev?.eventType || "").replace(/_/g, " ").trim();
  return type ? type[0].toUpperCase() + type.slice(1) : "Update";
}

/** Timeline for a track — permit events when present, else a synthesized entry. */
export function buildTrackTimeline(row) {
  const events = Array.isArray(row?.events) ? row.events : [];
  if (events.length) {
    return events.slice(-12).map((ev, i, arr) => ({
      text: eventText(ev),
      when: shortWhen(ev?.createdAt || ev?.receivedAt),
      state: i === arr.length - 1 ? "now" : "done",
    }));
  }
  const label = row?.stageLabel || "Open case";
  return [{ text: label, when: shortWhen(row?.updatedAt), state: "now" }];
}

/**
 * Verification indicator — how do we KNOW this case is real at the agency?
 *   verified  — agency email(s) on file (+ case #): "Verified via email · MC-…"
 *   submitted — filed (fleet submitted/done or case # on file), awaiting the
 *               agency's email confirmation
 *   pending   — nothing filed yet
 */
export function trackVerification(row, { caseRuns = [] } = {}) {
  const caseNumber = String(row?.caseNumber || "").trim();
  const hasEmailEvents = Array.isArray(row?.events) && row.events.length > 0;
  if (hasEmailEvents) {
    return {
      state: "verified",
      label: caseNumber ? `Verified via email · ${caseNumber}` : "Verified via agency email",
    };
  }
  const run = (caseRuns || []).find(
    (r) =>
      r &&
      r.jobId === row?.jobId &&
      String(r.type || "") === "create_case" &&
      ["submitted", "done", "approved"].includes(String(r.status || ""))
  );
  if (run || caseNumber) {
    return {
      state: "submitted",
      label: caseNumber
        ? `Submitted · ${caseNumber} — awaiting email confirmation`
        : "Submitted — awaiting email confirmation",
    };
  }
  return { state: "pending", label: "Not filed yet" };
}

/** Step trail — bead states for the compact rail. */
export function buildRailSteps(agency, stage, tone) {
  const rail = railForAgency(agency);
  const cur = railIndex(agency, stage);
  const done = tone === "done";
  return rail.map((label, i) => ({
    label,
    state: i < cur || (done && i <= cur) ? "done" : i === cur ? "current" : "todo",
  }));
}

/**
 * Group live board rows into one card per JOB with both rails.
 * Buckets: 'completed' (every track passed/terminal) · 'needs' (any track needs
 * action OR is stale >7d) · 'progress' (everything else).
 */
export function buildOpenCaseCards({ board, caseRuns = [], now = Date.now(), config } = {}) {
  const byJob = new Map();
  for (const sec of board?.sections || []) {
    for (const row of sec.cases || []) {
      const id = String(row.jobId || row.key || "");
      if (!id) continue;
      if (!byJob.has(id)) {
        byJob.set(id, {
          jobId: row.jobId || id,
          jobName: row.jobName || "",
          address: row.address || "",
          tracks: [],
        });
      }
      const g = byJob.get(id);
      if (!g.jobName && row.jobName) g.jobName = row.jobName;
      if (!g.address && row.address) g.address = row.address;

      const stale = caseTrackIsStale(row, { now, config });
      const tone = trackTone(row);
      const timeline = buildTrackTimeline(row);
      const needs = (trackNeedsAttention(row) || stale) && tone !== "done";
      g.tracks.push({
        key: row.key,
        agency: row.agency === "coned" ? "coned" : "dob",
        agencyLabel: row.agency === "coned" ? "Con Edison" : "DOB / City",
        row,
        caseNumber: row.caseNumber || "",
        stage: row.stage || "",
        stageLabel: row.stageLabel || "Open case",
        tone: stale && tone !== "done" ? "action" : tone,
        railSteps: buildRailSteps(row.agency, row.stage, tone),
        updatedAt: row.updatedAt || "",
        lastUpdate: timeline[timeline.length - 1] || null,
        timeline,
        needsAttention: needs,
        attention: needs ? row.nextAction || row.stageLabel || "" : "",
        stale,
        staleDays: stale ? staleDays(row.updatedAt, now) : 0,
        verification: trackVerification(row, { caseRuns }),
      });
    }
  }

  const cards = [...byJob.values()].map((g) => {
    const allDone = g.tracks.length > 0 && g.tracks.every((t) => t.tone === "done");
    const anyNeeds = g.tracks.some((t) => t.needsAttention);
    const bucket = allDone ? "completed" : anyNeeds ? "needs" : "progress";
    const latest = Math.max(0, ...g.tracks.map((t) => Date.parse(t.updatedAt || "") || 0));
    return {
      ...g,
      bucket,
      stale: g.tracks.some((t) => t.stale),
      hasConed: g.tracks.some((t) => t.agency === "coned"),
      hasDob: g.tracks.some((t) => t.agency === "dob"),
      latestTs: latest,
    };
  });

  const BUCKET_RANK = { needs: 0, progress: 1, completed: 2 };
  cards.sort(
    (a, b) =>
      (BUCKET_RANK[a.bucket] ?? 1) - (BUCKET_RANK[b.bucket] ?? 1) ||
      b.latestTs - a.latestTs ||
      String(a.jobName).localeCompare(String(b.jobName))
  );

  const counts = {
    progress: cards.filter((c) => c.bucket === "progress").length,
    needs: cards.filter((c) => c.bucket === "needs").length,
    completed: cards.filter((c) => c.bucket === "completed").length,
    open: cards.filter((c) => c.bucket !== "completed").length,
  };
  return { cards, counts };
}

/** Apply the All / Needs-attention filter. */
export function filterOpenCaseCards(cards, filter) {
  if (filter === "needs") return (cards || []).filter((c) => c.bucket === "needs");
  return cards || [];
}
