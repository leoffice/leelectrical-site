// permitConfirm — the universal CONFIRMED/DONE model for deployed permit actions.
//
// Levi's rule (2026-08-13 redesign): NOTHING advances on a self-report. A deployed
// action (inquiry, renewal, upload, case step…) only counts as done once we are
// NOTIFIED it was actually performed at the agency — by the browser agent / Israel
// posting a confirmation, or by an agency email landing (email-insight pipeline).
//
// State machine per action:
//   ready → sent (firedAt stamped when handed to the agent/bus)
//         → confirmed (confirmedAt + confirmedBy 'agent'|'email'|'manual')
//   timeout: sent for > flagAfterHours without confirmation → FLAGGED.
//   Re-nudge: message Israel + re-offer the action. NEVER auto-fires (Levi default #5).
//
// Records live on the job at `job.permitActions[key]` so they ride the normal
// patchAndSave → KV → board-derivation pipe (single source of truth stays jobs).
// Pure functions only — callers inject `now` for testability.

/**
 * LEVI-DEFAULTS (2026-08-13) — sensible defaults for the items Levi hasn't
 * finalized; all configurable here in one place:
 *  - flagAfterHours: >24h after send with no confirmation → flag + offer re-nudge.
 *  - inquiryReplyWindowHours: after confirmed-submitted, wait up to 48h for the
 *    emailed answer before flagging (reply matched by case # in subject/body).
 *  - staleAfterDays: Open Cases — no update in >7 days and not complete →
 *    "needs to be addressed" card + Needs-Attention count.
 *  - nudgeChannel: re-nudge sends Israel a task/message and re-offers the deploy
 *    button; it does NOT re-fire the action automatically.
 */
export const PERMIT_CONFIRM_DEFAULTS = {
  flagAfterHours: 24,
  inquiryReplyWindowHours: 48,
  staleAfterDays: 7,
  nudgeChannel: "israel",
};

export function permitConfirmConfig(overrides = {}) {
  return { ...PERMIT_CONFIRM_DEFAULTS, ...(overrides || {}) };
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function ts(v) {
  const t = Date.parse(v || "");
  return Number.isFinite(t) ? t : 0;
}

function nowIso(now) {
  return new Date(now ?? Date.now()).toISOString();
}

/** All confirmation records on a job. */
export function getPermitActions(job) {
  const map = job?.permitActions;
  return map && typeof map === "object" ? map : {};
}

export function getPermitAction(job, key) {
  return getPermitActions(job)[key] || null;
}

/**
 * Phase of one action record:
 *   'ready'     — nothing fired yet (or record missing)
 *   'sent'      — fired, awaiting confirmation it was actually performed
 *   'flagged'   — sent > flagAfterHours ago, still unconfirmed
 *   'confirmed' — a real notification (agent/email/manual) landed
 */
export function permitActionPhase(rec, { now = Date.now(), config } = {}) {
  if (!rec) return "ready";
  // A confirmation always wins — even for actions confirmed without a fire
  // (e.g. "account activated" manual-confirm, or work Israel did unprompted).
  if (rec.confirmedAt) return "confirmed";
  if (!rec.firedAt) return "ready";
  const cfg = permitConfirmConfig(config);
  const fired = ts(rec.firedAt);
  if (fired && now - fired > cfg.flagAfterHours * HOUR_MS) return "flagged";
  return "sent";
}

/** Hours since the action was fired (0 when not fired / unparseable). */
export function hoursSinceFired(rec, now = Date.now()) {
  const fired = ts(rec?.firedAt);
  if (!fired) return 0;
  return Math.max(0, (now - fired) / HOUR_MS);
}

function mergedActions(job, key, rec) {
  return { permitActions: { ...getPermitActions(job), [key]: rec } };
}

/**
 * Stamp "fired" — the action was handed to the agent/bus. This is the START of
 * the wait-for-confirmation window, never a completion.
 * meta: free-form context (caseNumber, permitNo, text…), kept for display/matching.
 */
export function buildActionFiredPatch(job, key, { kind = "", via = "", meta = {}, now } = {}) {
  if (!key) return null;
  const prev = getPermitAction(job, key) || {};
  return mergedActions(job, key, {
    ...prev,
    key,
    kind: kind || prev.kind || "",
    via: via || prev.via || "",
    meta: { ...(prev.meta || {}), ...(meta || {}) },
    firedAt: nowIso(now),
    // re-firing resets the confirmation wait
    confirmedAt: "",
    confirmedBy: "",
    confirmSource: "",
    flaggedAt: "",
  });
}

/**
 * Stamp "confirmed" — an external NOTIFICATION says it was actually performed.
 * by: 'agent' (Israel/browser agent posted done), 'email' (agency email landed),
 *     'manual' (Levi explicitly confirmed on the card).
 * source: message/command/insight ref for the audit trail.
 */
export function buildActionConfirmedPatch(job, key, { by = "agent", source = "", note = "", now } = {}) {
  if (!key) return null;
  const prev = getPermitAction(job, key) || { key };
  return mergedActions(job, key, {
    ...prev,
    key,
    confirmedAt: nowIso(now),
    confirmedBy: by,
    confirmSource: source || "",
    confirmNote: note || "",
    flaggedAt: "",
  });
}

/**
 * Record a re-nudge (message to Israel + the action re-offered). Does NOT
 * re-fire the action and does NOT clear the flag — only a confirmation does.
 */
export function buildActionNudgePatch(job, key, { channel, note = "", now } = {}) {
  if (!key) return null;
  const prev = getPermitAction(job, key) || { key };
  const cfg = permitConfirmConfig();
  const nudge = {
    at: nowIso(now),
    channel: channel || cfg.nudgeChannel,
    note: note || "",
  };
  const nudges = [...(Array.isArray(prev.nudges) ? prev.nudges : []), nudge].slice(-20);
  return mergedActions(job, key, {
    ...prev,
    key,
    nudges,
    flaggedAt: prev.flaggedAt || nowIso(now),
  });
}

/** Every unconfirmed action on a job that is past the flag window. */
export function listFlaggedActions(job, { now = Date.now(), config } = {}) {
  const out = [];
  const actions = getPermitActions(job);
  for (const key of Object.keys(actions)) {
    const rec = actions[key];
    if (permitActionPhase(rec, { now, config }) === "flagged") out.push(rec);
  }
  return out;
}

/** Friendly status line for one action record (UI copy in one place). */
export function describePermitAction(rec, { now = Date.now(), config } = {}) {
  const phase = permitActionPhase(rec, { now, config });
  if (phase === "ready") return { phase, label: "Ready to deploy", sub: "" };
  if (phase === "confirmed") {
    const by =
      rec.confirmedBy === "email"
        ? "confirmed by agency email"
        : rec.confirmedBy === "manual"
          ? "confirmed manually"
          : "confirmed by agent";
    return { phase, label: `Confirmed performed — ${by}`, sub: rec.confirmNote || "" };
  }
  const hrs = Math.round(hoursSinceFired(rec, now));
  if (phase === "flagged") {
    return {
      phase,
      label: `Sent ${hrs}h ago — still no confirmation it was performed`,
      sub: "Flagged. Re-nudge Israel or re-send — it stays here until confirmed.",
    };
  }
  return {
    phase,
    label: "Sent — awaiting confirmation it was performed at the agency",
    sub: "Nothing is marked done on a self-report.",
  };
}

/* ---------------- Open Cases staleness (the >7-day rule) ---------------- */

const COMPLETE_BUCKETS = new Set(["Passed", "Terminal"]);

/** Whole days since the last update (0 when unknown). */
export function staleDays(updatedAt, now = Date.now()) {
  const t = ts(updatedAt);
  if (!t) return 0;
  return Math.max(0, Math.floor((now - t) / DAY_MS));
}

/**
 * Open-case track stale rule: last update older than staleAfterDays AND the
 * track is not complete. Unknown updatedAt never false-flags.
 */
export function caseTrackIsStale(row, { now = Date.now(), config } = {}) {
  if (!row) return false;
  if (COMPLETE_BUCKETS.has(row.stageBucket)) return false;
  const t = ts(row.updatedAt);
  if (!t) return false;
  const cfg = permitConfirmConfig(config);
  return now - t > cfg.staleAfterDays * DAY_MS;
}
