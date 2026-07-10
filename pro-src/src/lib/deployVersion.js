// #64 Rollback on every deploy — pure helpers (no I/O).
// Before each deploy, record the LIVE version (git SHA and/or Netlify deploy id).
// Every deploy must be reversible: previous + new ids are posted so a rollback
// target always exists. Prefer Netlify instant rollback when a deploy id is
// present; otherwise fall back to redeploying the previous git SHA.

/** @typedef {{ gitSha?: string, gitShaShort?: string, netlifyDeployId?: string|null, ts?: string, task?: string, note?: string }} VersionIds */
/** @typedef {{ previous: VersionIds, next: VersionIds, mode?: string, task?: string, ts?: string }} DeployRecord */

/** Normalize a git SHA (full or short) into { gitSha, gitShaShort }. */
export function normalizeGitSha(sha) {
  const s = String(sha || "").trim();
  if (!s) return { gitSha: "", gitShaShort: "" };
  return {
    gitSha: s,
    gitShaShort: s.length > 7 ? s.slice(0, 7) : s,
  };
}

/** Build a version identity from partial inputs. */
export function makeVersionRecord(partial = {}) {
  const git = normalizeGitSha(partial.gitSha || partial.gitShaShort || "");
  const netlifyDeployId =
    partial.netlifyDeployId != null && String(partial.netlifyDeployId).trim()
      ? String(partial.netlifyDeployId).trim()
      : null;
  return {
    gitSha: git.gitSha,
    gitShaShort: git.gitShaShort,
    netlifyDeployId,
    ts: partial.ts || new Date().toISOString(),
    task: partial.task || "",
    note: partial.note || "",
  };
}

/** Compact id string for posts / logs: prefer netlify deploy id, else short SHA. */
export function versionId(v) {
  if (!v) return "unknown";
  if (v.netlifyDeployId) return `netlify:${v.netlifyDeployId}`;
  if (v.gitShaShort || v.gitSha) return `git:${v.gitShaShort || normalizeGitSha(v.gitSha).gitShaShort}`;
  return "unknown";
}

/**
 * Append a deploy event to history.
 * `previousLive` = version that was LIVE before this deploy (the rollback target).
 * `newLive` = version that becomes LIVE after this deploy.
 */
export function appendDeployRecord(history, previousLive, newLive, meta = {}) {
  const list = Array.isArray(history) ? history.slice() : [];
  const previous = makeVersionRecord(previousLive || {});
  const next = makeVersionRecord(newLive || {});
  const record = {
    previous,
    next,
    mode: meta.mode || (previous.netlifyDeployId ? "netlify-instant" : "git-sha"),
    task: meta.task || next.task || previous.task || "",
    ts: meta.ts || next.ts || new Date().toISOString(),
  };
  list.push(record);
  const max = meta.max ?? 50;
  return list.length > max ? list.slice(list.length - max) : list;
}

/** Latest deploy record, or null. */
export function latestDeploy(history) {
  if (!Array.isArray(history) || !history.length) return null;
  return history[history.length - 1];
}

/**
 * Resolve the rollback target for a history list.
 * Default: previous of the latest deploy (what LIVE was before last ship).
 * `n = 1` rolls back one step, `n = 2` two steps, etc.
 */
export function resolveRollbackTarget(history, n = 1) {
  if (!Array.isArray(history) || !history.length) return null;
  const idx = history.length - Number(n || 1);
  if (idx < 0 || idx >= history.length) return null;
  const rec = history[idx];
  return rec.previous || null;
}

/** Preferred rollback mode for a version target. */
export function rollbackMode(target) {
  if (target && target.netlifyDeployId) return "netlify-instant";
  if (target && (target.gitSha || target.gitShaShort)) return "git-sha";
  return "none";
}

/**
 * One-line post for Telegram / dispatch_outbox after a deploy.
 * Example: `deploy previous=git:abc1234 new=git:def5678 rollback_target=git:abc1234 mode=git-sha`
 */
export function formatDeployPost({ previous, next, mode, task } = {}) {
  const prev = makeVersionRecord(previous || {});
  const neu = makeVersionRecord(next || {});
  const m = mode || (prev.netlifyDeployId ? "netlify-instant" : "git-sha");
  const parts = [
    "deploy",
    `previous=${versionId(prev)}`,
    `new=${versionId(neu)}`,
    `rollback_target=${versionId(prev)}`,
    `mode=${m}`,
  ];
  if (task) parts.push(`task=${task}`);
  return parts.join(" ");
}

/** One-line post after a successful rollback. */
export function formatRollbackPost({ target, mode, task } = {}) {
  const t = makeVersionRecord(target || {});
  const parts = [
    "rollback",
    `to=${versionId(t)}`,
    `mode=${mode || rollbackMode(t)}`,
  ];
  if (task) parts.push(`task=${task}`);
  return parts.join(" ");
}

/**
 * Parse a history document (array or { deploys: [] }).
 * Returns a plain array of DeployRecord.
 */
export function parseHistoryDoc(doc) {
  if (!doc) return [];
  if (Array.isArray(doc)) return doc;
  if (Array.isArray(doc.deploys)) return doc.deploys;
  return [];
}

/** Serialize history for disk. */
export function serializeHistoryDoc(history, extra = {}) {
  return {
    schema: "le-pro-deploy-history/v1",
    updatedAt: new Date().toISOString(),
    ...extra,
    deploys: Array.isArray(history) ? history : [],
  };
}

/**
 * Build the public version.json payload stamped into app/pro/ at build/deploy.
 * Readable on LIVE at /app/pro/version.json so workers can detect current LIVE.
 */
export function makePublicVersion(partial = {}) {
  const v = makeVersionRecord(partial);
  return {
    schema: "le-pro-version/v1",
    gitSha: v.gitSha,
    gitShaShort: v.gitShaShort,
    netlifyDeployId: v.netlifyDeployId,
    builtAt: v.ts || new Date().toISOString(),
    task: v.task || "",
    rollbackAvailable: true,
  };
}