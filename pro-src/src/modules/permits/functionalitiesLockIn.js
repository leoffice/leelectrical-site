/**
 * "FUNCTIONALITIES TO LOCK IN" — remaining Con Ed / DOB sub-workflows to teach.
 * Learned / already-shipped skills are REMOVED from the list (clean slate).
 * Seeded from LEPRO_PERMITS_DEPLOY_METER_APP_SPEC.md §2 (ids preserved).
 * Scale = learned / total — update LEARNED_SKILLS_REMOVED when a skill is verified working.
 */

/** @typedef {'done'|'to_build'|'learned'} LockInStatus */

/**
 * Skills still on the board (not yet locked in / still to teach).
 * Removed (learned) — see LEARNED_SKILLS_REMOVED.
 *
 * @type {ReadonlyArray<{
 *   id: number,
 *   title: string,
 *   status: LockInStatus,
 *   notes?: string
 * }>}
 */
export const FUNCTIONALITIES_LOCK_IN = Object.freeze([
  {
    id: 2,
    title: "Submit the electrical application",
    status: "to_build",
  },
  {
    id: 3,
    title:
      'Submit electrical permit (enter permit # → L1 field NOT "IL" → EL = Electrical Permit)',
    status: "to_build",
    notes: "L1 not IL; EL = Electrical Permit",
  },
  {
    id: 4,
    title: "Submit final checklist",
    status: "to_build",
  },
  {
    id: 5,
    title: "Submit request for POE visit",
    status: "to_build",
    notes: "POE = Point of Entry",
  },
  {
    id: 6,
    title: "Submit sleeve affidavit",
    status: "to_build",
  },
  {
    id: 7,
    title: "Submit an inquiry",
    status: "to_build",
  },
  {
    id: 9,
    title: "Read service-layout result + flag when new conduit required",
    status: "to_build",
  },
  {
    id: 10,
    title: "Schedule POE appointment to calendar (10:00–12:30 window, Levi name + phone)",
    status: "to_build",
    notes: "Preferred 10:00–12:30; contact = Levi name + phone",
  },
  {
    id: 11,
    title:
      "Attach/upload documents (full-detail PDF from BLZ Electric/Permits by permit #)",
    status: "to_build",
    notes: "~/Downloads/BLZ Electric/Permits keyed by permit #",
  },
  {
    id: 12,
    title:
      "Final-inspection readiness gate (accounts active + city permit + electrical permit + full details) → Submit final-inspection request",
    status: "to_build",
  },
  {
    id: 13,
    title: "Post-final follow-up 1-week timer → inquiry for meter-install date",
    status: "to_build",
  },
  {
    id: 14,
    title: 'Per-case "pull all pending to-dos" dashboard (triggered when Levi says "Con Edison")',
    status: "to_build",
    notes: 'Dashboard trigger phrase: "Con Edison"',
  },
]);

/**
 * Skills already learned and removed from the visible board (audit + scale).
 * id 15 = Submit a Case (Energy Services create-case) — verified end-to-end:
 * fill → Review → View/Print Summary PDF → human submit (MC-941580 1337 President).
 * Never auto-submit. View/Print → Con Edison Applications is mandatory before Save/Submit.
 */
export const LEARNED_SKILLS_REMOVED = Object.freeze([
  { id: 1, title: "Create an application (new service application)" },
  { id: 8, title: "Submit meter application (4 options)" },
  {
    id: 15,
    title: "Submit a Case (Energy Services create-case → Review + View/Print)",
    notes:
      "Fill to Review; View/Print Summary → Con Edison Applications PDF (address - customer); Levi confirms before submit",
  },
]);

/** Fresh array copy of the seed (UI-safe). Done/learned never appear. */
export function functionalitiesLockInSeed() {
  return FUNCTIONALITIES_LOCK_IN.filter((item) => item.status === "to_build").map((item) => ({
    ...item,
  }));
}

export function isLockInDone(item) {
  return item && (item.status === "done" || item.status === "learned");
}

export function lockInDoneCount(list = FUNCTIONALITIES_LOCK_IN) {
  // Board is remaining-only; "done" count is learned skills already removed.
  if (list === FUNCTIONALITIES_LOCK_IN || !list?.length) {
    return LEARNED_SKILLS_REMOVED.length;
  }
  return (list || []).filter(isLockInDone).length;
}

export function lockInTotalCount(list = FUNCTIONALITIES_LOCK_IN) {
  if (list === FUNCTIONALITIES_LOCK_IN || list === undefined) {
    return FUNCTIONALITIES_LOCK_IN.length + LEARNED_SKILLS_REMOVED.length;
  }
  return (list || []).length + LEARNED_SKILLS_REMOVED.length;
}

/** Remaining skills still to teach (visible list length). */
export function lockInRemainingCount(list) {
  const seed = list || FUNCTIONALITIES_LOCK_IN;
  return (seed || []).filter((i) => i && i.status === "to_build").length;
}

/** 0–100 progress for the skills scale (learned / total). */
export function lockInProgressPct(list) {
  const total = lockInTotalCount(list);
  if (!total) return 0;
  return Math.round((lockInDoneCount(list) / total) * 100);
}
