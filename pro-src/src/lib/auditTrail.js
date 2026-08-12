// Universal non-destructive archive / audit trail (LE Pro §1).
//
// Every create / edit / delete of a transaction appends an IMMUTABLE row.
// DELETE = soft-delete (tombstone + deletedAt + optional archive flag).
// EDIT = prior state retained in the audit entry so restore is possible.
// FUTURE: version-history UI reads this same log — no migration.
//
// Compatible with the non-destructive QBO sync guardrail (retain + flag
// "not in QBO"): that path is a special case of this layer. Same tombstone /
// audit entry shape; no divergent model.
//
// Persistence today: overlay key `_auditLog` (append-only entries array) via
// the same patchAndSave / saveJob path as jobs. Future Supabase: dedicated
// `audit_commands` table (migration 005) with the same row shape.

/** Reserved overlay namespace — never a job id. */
export const AUDIT_OV_KEY = "_auditLog";

/** Soft cap for blob-store history (oldest dropped only when exceeded). */
export const AUDIT_LOG_CAP = 8000;

export const AUDIT_OPS = Object.freeze({
  CREATE: "create",
  EDIT: "edit",
  DELETE: "delete",
  ARCHIVE: "archive",
  RESTORE: "restore",
  FLAG: "flag",
});

export const AUDIT_ENTITIES = Object.freeze({
  JOB: "job",
  PAYMENT: "payment",
  INVOICE: "invoice",
  ESTIMATE: "estimate",
  CUSTOMER: "customer",
  UNKNOWN: "unknown",
});

function isoNow(at) {
  if (at == null) return new Date().toISOString();
  if (typeof at === "number") return new Date(at).toISOString();
  return String(at);
}

function cloneShallow(v) {
  if (v == null || typeof v !== "object") return v;
  try {
    if (typeof structuredClone === "function") return structuredClone(v);
  } catch {
    /* fall through */
  }
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return { ...v };
  }
}

/** Stable-ish id for one audit row (append-only; never reused). */
export function auditEntryId(at = Date.now()) {
  const t = typeof at === "number" ? at : Date.now();
  return "aud-" + t + "-" + Math.random().toString(36).slice(2, 9);
}

/**
 * Infer entity type from a record / id / explicit hint.
 * Payments live on jobs but are first-class for audit purposes.
 */
export function inferEntity(record, hint) {
  if (hint && AUDIT_ENTITIES[String(hint).toUpperCase()]) {
    return AUDIT_ENTITIES[String(hint).toUpperCase()];
  }
  if (hint && Object.values(AUDIT_ENTITIES).includes(hint)) return hint;
  if (!record || typeof record !== "object") return AUDIT_ENTITIES.UNKNOWN;
  if (record.entity) return record.entity;
  if (record.qboPaymentId != null || record.method != null || String(record.id || "").startsWith("pay-")) {
    return AUDIT_ENTITIES.PAYMENT;
  }
  if (record.invoiceNo && !record.estimateNo && record.payments) return AUDIT_ENTITIES.JOB;
  if (record.invoiceNo && !record.customer && !record.title) return AUDIT_ENTITIES.INVOICE;
  if (record.estimateNo && !record.invoiceNo && !record.customer) return AUDIT_ENTITIES.ESTIMATE;
  if (record.customer != null || record.title != null || record.status) return AUDIT_ENTITIES.JOB;
  if (record.name || record.qboCustomerId) return AUDIT_ENTITIES.CUSTOMER;
  return AUDIT_ENTITIES.UNKNOWN;
}

/** Next monotonic version/seq for a live record (starts at 1). */
export function nextVersion(record) {
  const cur = Number(record?._version ?? record?.version ?? record?._seq ?? 0);
  return (Number.isFinite(cur) ? cur : 0) + 1;
}

/**
 * Build one immutable audit row.
 * Shape is fixed for future version-history UI + Supabase audit_commands.
 *
 * @param {object} opts
 * @param {string} [opts.tenantId]
 * @param {string} opts.entity - job|payment|invoice|estimate|customer
 * @param {string} opts.entityId - stable record id
 * @param {string} opts.op - create|edit|delete|archive|restore|flag
 * @param {string} [opts.actor]
 * @param {*} [opts.before] - prior state (full or partial)
 * @param {*} [opts.after] - new state
 * @param {*} [opts.delta] - optional field-level delta
 * @param {number} [opts.version]
 * @param {string} [opts.reason]
 * @param {string|number} [opts.at]
 * @param {object} [opts.meta]
 */
export function makeAuditEntry(opts = {}) {
  const at = isoNow(opts.at);
  const entity = opts.entity || inferEntity(opts.after || opts.before, opts.entityHint);
  const entityId = String(
    opts.entityId ||
      opts.after?.id ||
      opts.before?.id ||
      ""
  );
  return Object.freeze({
    id: opts.id || auditEntryId(Date.now()),
    tenantId: String(opts.tenantId || "le"),
    entity,
    entityId,
    op: String(opts.op || AUDIT_OPS.EDIT),
    at,
    actor: opts.actor != null ? String(opts.actor) : "local",
    version: opts.version != null ? Number(opts.version) : null,
    before: opts.before === undefined ? null : cloneShallow(opts.before),
    after: opts.after === undefined ? null : cloneShallow(opts.after),
    delta: opts.delta === undefined ? null : cloneShallow(opts.delta),
    reason: opts.reason ? String(opts.reason) : null,
    meta: opts.meta && typeof opts.meta === "object" ? cloneShallow(opts.meta) : null,
  });
}

/**
 * Normalize any stored audit blob into a sorted entries array.
 * Supports:
 *   - { byId: { [id]: entry }, schema }  ← preferred (deepMerge-safe)
 *   - { entries: [...] }
 *   - bare array
 */
export function auditEntriesOf(log) {
  if (!log) return [];
  if (Array.isArray(log)) return log.filter(Boolean);
  if (log.byId && typeof log.byId === "object") {
    return Object.values(log.byId)
      .filter(Boolean)
      .sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  }
  if (Array.isArray(log.entries)) return log.entries.filter(Boolean);
  return [];
}

/**
 * Append-only: returns a NEW log object; never mutates existing entries.
 * Uses `byId` so Netlify/CF deepMerge of ov._auditLog keeps prior rows
 * (arrays are replaced by deepMerge; object keys merge).
 * Caps length at AUDIT_LOG_CAP by dropping oldest.
 */
export function appendAuditLog(log, entryOrEntries) {
  const prevList = auditEntriesOf(log);
  const add = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];
  const sealed = add.filter(Boolean).map((e) => (Object.isFrozen(e) ? e : makeAuditEntry(e)));
  let entries = prevList.concat(sealed);
  if (entries.length > AUDIT_LOG_CAP) {
    entries = entries.slice(entries.length - AUDIT_LOG_CAP);
  }
  const byId = {};
  for (const e of entries) {
    if (e && e.id) byId[e.id] = e;
  }
  return {
    byId,
    // entries kept for readers/tests that prefer a list (rebuilt, not source of merge truth)
    entries,
    updatedAt: sealed.length ? sealed[sealed.length - 1].at : log?.updatedAt || null,
    schema: 1,
  };
}

/** Read helpers for future version-history UI (no UI built yet). */
export function listAuditForEntity(log, entityId, entity) {
  const entries = auditEntriesOf(log);
  const id = String(entityId || "");
  return entries.filter(
    (e) => e && String(e.entityId) === id && (!entity || e.entity === entity)
  );
}

export function listAuditForTenant(log, tenantId) {
  const entries = auditEntriesOf(log);
  const t = String(tenantId || "le");
  return entries.filter((e) => e && String(e.tenantId || "le") === t);
}

/**
 * Soft-delete / tombstone patch for a job (or any top-level overlay record).
 * Moves out of live: `_deleted` + `_archived` + `deletedAt`. Data stays in ov.
 */
export function softDeletePatch(before = {}, opts = {}) {
  const at = isoNow(opts.at);
  const version = nextVersion(before);
  return {
    _deleted: true,
    _archived: true,
    deletedAt: at,
    _version: version,
    version,
  };
}

/** Archive without full delete (Archive tab restore path). */
export function softArchivePatch(before = {}, opts = {}) {
  const at = isoNow(opts.at);
  const version = nextVersion(before);
  return {
    _archived: true,
    archivedAt: at,
    _version: version,
    version,
  };
}

/** Restore from archive or soft-delete. */
export function softRestorePatch(before = {}, opts = {}) {
  const at = isoNow(opts.at);
  const version = nextVersion(before);
  return {
    _deleted: false,
    _archived: false,
    deletedAt: null,
    restoredAt: at,
    _version: version,
    version,
  };
}

/**
 * Soft-delete a payment row IN PLACE (same id — history stays linked).
 * Live ledgers must use normalizePayments() which drops tombstones.
 */
export function softDeletePayment(payment, opts = {}) {
  if (!payment) return null;
  const at = isoNow(opts.at);
  const version = nextVersion(payment);
  return {
    ...payment,
    _deleted: true,
    deletedAt: at,
    deletedBy: opts.actor != null ? String(opts.actor) : payment.deletedBy || null,
    _version: version,
    version,
  };
}

/**
 * Enrich an incoming save patch with version bump + classify the op.
 * Does not invent field values — only adds audit metadata fields.
 */
export function enrichMutationPatch(before, patch, opts = {}) {
  const p = { ...(patch || {}) };
  const version = nextVersion(before);
  p._version = version;
  p.version = version;

  let op = opts.op || null;
  if (!op) {
    if (p._deleted === true && !before?._deleted) op = AUDIT_OPS.DELETE;
    else if (p._archived === true && p._deleted !== true && !before?._archived) op = AUDIT_OPS.ARCHIVE;
    else if (
      (p._deleted === false || p._archived === false) &&
      (before?._deleted || before?._archived)
    ) {
      op = AUDIT_OPS.RESTORE;
    } else if (!before || before._new === true && p && Object.keys(before).length <= 2) {
      op = before?._new || p._new ? AUDIT_OPS.CREATE : AUDIT_OPS.EDIT;
    } else if (!before) op = AUDIT_OPS.CREATE;
    else op = AUDIT_OPS.EDIT;
  }

  if (op === AUDIT_OPS.DELETE) {
    if (!p.deletedAt) p.deletedAt = isoNow(opts.at);
    if (p._archived == null) p._archived = true;
    if (p._deleted == null) p._deleted = true;
  }
  if (op === AUDIT_OPS.ARCHIVE && !p.archivedAt) {
    p.archivedAt = isoNow(opts.at);
  }
  if (op === AUDIT_OPS.RESTORE) {
    p.restoredAt = isoNow(opts.at);
    if (p._deleted === false) p.deletedAt = null;
  }

  return { patch: p, op, version };
}

/**
 * Build the audit entry + enriched patch for one mutation.
 * Call from patchAndSave / saveAll before writing.
 *
 * @returns {{ patch, entry, op, version }}
 */
export function planMutation(before, patch, opts = {}) {
  const { patch: enriched, op, version } = enrichMutationPatch(before, patch, opts);
  const after = before ? { ...before, ...enriched } : { ...enriched };
  // Deletes/archives keep a FULL prior snapshot (enough to reverse); routine
  // edits store slim summaries — the delta already carries the change.
  const fullSnap = op === AUDIT_OPS.DELETE || op === AUDIT_OPS.ARCHIVE;
  const beforeSnap = before ? snapshotForAudit(before, { slim: !fullSnap }) : null;

  const entry = makeAuditEntry({
    tenantId: opts.tenantId,
    entity: opts.entity || inferEntity(before || after, opts.entityHint),
    entityId: opts.entityId || before?.id || after?.id || opts.id,
    op,
    actor: opts.actor,
    before: beforeSnap,
    after:
      op === AUDIT_OPS.DELETE
        ? { id: after.id, _deleted: true, deletedAt: enriched.deletedAt }
        : snapshotForAudit(after, { slim: !fullSnap }),
    delta: opts.delta != null ? opts.delta : patch,
    version,
    reason: opts.reason,
    at: opts.at,
    meta: opts.meta,
  });

  return { patch: enriched, entry, op, version };
}

/**
 * Compact snapshot for audit storage — enough to reverse, not a full jobs dump.
 * Keeps identity, money, people, addresses, payments, doc numbers, flags.
 */
/** Compact stand-ins for the heavy array fields when slimming (see below). */
function summarizeArrayField(key, v) {
  if (!Array.isArray(v)) return v;
  const out = { _slim: true, n: v.length };
  if (key === "invoiceLines" || key === "estimateLines") {
    let total = 0;
    for (const ln of v) total += (Number(ln?.unitPrice) || 0) * (Number(ln?.qty) || 1);
    out.total = Math.round(total * 100) / 100;
  }
  if (key === "payments") {
    let total = 0;
    for (const p of v) total += Number(String(p?.amount || "").replace(/[$,]/g, "")) || 0;
    out.total = Math.round(total * 100) / 100;
  }
  return out;
}

/**
 * @param {object} record
 * @param {{ slim?: boolean }} [opts] slim=true replaces the heavy array fields
 *   (payments/lines/history) with { _slim, n, total } summaries and truncates
 *   long notes. Routine EDIT entries were storing TWO full job snapshots each
 *   (~5 KB/entry, ov._auditLog grew to 4.19 MB — 73% of the state blob, perf
 *   hotfix 2026-08-12). DELETE/ARCHIVE entries stay full so a restore can
 *   reverse them; the entry's `delta` always carries the actual change.
 */
export function snapshotForAudit(record, opts = {}) {
  if (!record || typeof record !== "object") return record == null ? null : record;
  const slim = !!opts.slim;
  const keys = [
    "id",
    "customer",
    "businessName",
    "personName",
    "title",
    "amount",
    "openBalance",
    "phone",
    "email",
    "address",
    "serviceAddress",
    "billingAddress",
    "apartment",
    "estimateNo",
    "invoiceNo",
    "paid",
    "notes",
    "payments",
    "payment",
    "paymentBaseline",
    "invoiceLines",
    "estimateLines",
    "invoiceHistory",
    "followUp",
    "calEventId",
    "status",
    "qboCustomerId",
    "invoiceQboId",
    "estimateQboId",
    "changeOrder",
    "changeOrderLabel",
    "changeOrderKind",
    "changeOrderSourceId",
    "_new",
    "_deleted",
    "_archived",
    "deletedAt",
    "archivedAt",
    "restoredAt",
    "_version",
    "version",
    "notInQbo",
    "syncFlag",
    "method",
    "ref",
    "date",
    "source",
    "qboPaymentId",
    "amountWhenBaselined",
  ];
  const HEAVY = new Set(["payments", "invoiceLines", "estimateLines", "invoiceHistory"]);
  const out = {};
  for (const k of keys) {
    if (record[k] === undefined) continue;
    if (slim && HEAVY.has(k)) {
      out[k] = summarizeArrayField(k, record[k]);
    } else if (slim && k === "notes" && typeof record[k] === "string" && record[k].length > 400) {
      out[k] = record[k].slice(0, 400) + "…";
    } else {
      out[k] = cloneShallow(record[k]);
    }
  }
  // Always keep id if present on the object under another shape.
  if (record.id != null) out.id = record.id;
  return out;
}

/**
 * Sync-guardrail bridge: when a local record is retained because QBO is missing
 * it, produce a FLAG audit entry (not a delete). Same layer as soft-delete.
 */
export function planNotInQboFlag(record, opts = {}) {
  const before = snapshotForAudit(record);
  const after = {
    ...before,
    notInQbo: true,
    syncFlag: "not_in_qbo",
    _version: nextVersion(record),
    version: nextVersion(record),
  };
  const entry = makeAuditEntry({
    tenantId: opts.tenantId,
    entity: opts.entity || inferEntity(record, opts.entityHint || "payment"),
    entityId: record?.id,
    op: AUDIT_OPS.FLAG,
    actor: opts.actor || "sync",
    before,
    after,
    delta: { notInQbo: true, syncFlag: "not_in_qbo" },
    version: after._version,
    reason: opts.reason || "not_in_qbo",
    at: opts.at,
    meta: { source: "qbo_sync", ...(opts.meta || {}) },
  });
  return { entry, after };
}

/**
 * Merge audit entries into the `_auditLog` overlay payload for saveJob.
 * Pure: returns the next `_auditLog` object (byId map = deepMerge-safe).
 *
 * For incremental saves when only NEW rows are known, pass
 * `{ byId: { [entry.id]: entry } }` via `auditPatchOnly(entries)` so
 * deepMerge keeps existing byId keys on the server.
 */
export function mergeAuditOvPayload(prevOvAudit, entryOrEntries) {
  return appendAuditLog(prevOvAudit || { byId: {}, entries: [], schema: 1 }, entryOrEntries);
}

/**
 * Incremental overlay patch: only the new entry keys (deepMerge-safe).
 * Prefer this for live saveJob(AUDIT_OV_KEY, patch) so concurrent writers
 * don't clobber each other's rows.
 */
export function auditPatchOnly(entryOrEntries) {
  const add = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];
  const sealed = add.filter(Boolean).map((e) => (Object.isFrozen(e) ? e : makeAuditEntry(e)));
  const byId = {};
  for (const e of sealed) {
    if (e && e.id) byId[e.id] = e;
  }
  return {
    byId,
    updatedAt: sealed.length ? sealed[sealed.length - 1].at : null,
    schema: 1,
  };
}

/** Live vs archived predicates (shared with merge filters). */
export function isLiveRecord(r) {
  return !!(r && !r._deleted && !r._archived && !r.deletedAt);
}

export function isTombstoned(r) {
  return !!(r && (r._deleted || r.deletedAt));
}

export function isArchivedOnly(r) {
  return !!(r && r._archived && !r._deleted);
}

/**
 * Resolve restore payload from an audit entry's `before` snapshot.
 * Enough for reverse of delete/edit when the entry retained prior state.
 */
export function restorePatchFromAuditEntry(entry) {
  if (!entry || !entry.before || typeof entry.before !== "object") return null;
  const b = cloneShallow(entry.before);
  // Force live flags when restoring a deleted/archived prior.
  delete b._deleted;
  delete b.deletedAt;
  b._deleted = false;
  b._archived = false;
  b.restoredAt = new Date().toISOString();
  b._version = nextVersion(b);
  b.version = b._version;
  return b;
}
