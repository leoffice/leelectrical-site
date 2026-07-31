/**
 * "FUNCTIONALITIES TO LOCK IN" — visible Con Ed sub-workflow checklist.
 * Seeded from LEPRO_PERMITS_DEPLOY_METER_APP_SPEC.md §2.
 * Flip status to "done" when each item is built + verified.
 */

/** @typedef {'done'|'to_build'} LockInStatus */

/**
 * @type {ReadonlyArray<{
 *   id: number,
 *   title: string,
 *   status: LockInStatus,
 *   notes?: string
 * }>}
 */
export const FUNCTIONALITIES_LOCK_IN = Object.freeze([
  {
    id: 1,
    title: "Create an application (new service application)",
    status: "to_build",
  },
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
    id: 8,
    title: "Submit meter application (4 options)",
    status: "done",
    notes: "Not required · Not needed for this job · A new meter · A new application",
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

/** Fresh array copy of the seed (UI-safe). */
export function functionalitiesLockInSeed() {
  return FUNCTIONALITIES_LOCK_IN.map((item) => ({ ...item }));
}

export function isLockInDone(item) {
  return item && item.status === "done";
}

export function lockInDoneCount(list = FUNCTIONALITIES_LOCK_IN) {
  return (list || []).filter(isLockInDone).length;
}

export function lockInTotalCount(list = FUNCTIONALITIES_LOCK_IN) {
  return (list || []).length;
}
