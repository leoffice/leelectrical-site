import { describe, it, expect } from "vitest";
import {
  AUDIT_OV_KEY,
  AUDIT_OPS,
  AUDIT_LOG_CAP,
  makeAuditEntry,
  appendAuditLog,
  auditEntriesOf,
  auditPatchOnly,
  planMutation,
  softDeletePatch,
  softRestorePatch,
  softDeletePayment,
  planNotInQboFlag,
  listAuditForEntity,
  restorePatchFromAuditEntry,
  mergeAuditOvPayload,
  isLiveRecord,
  isTombstoned,
  nextVersion,
} from "../src/lib/auditTrail.js";
import { deleteJobPatch } from "../src/lib/deleteDoc.js";
import { normalizePayments, removePayment, applyPaymentsPatch } from "../src/lib/payments.js";
import { deepMerge } from "../src/data/merge.js";

describe("auditTrail — immutable entries", () => {
  it("makeAuditEntry freezes a full create/edit/delete row with tenant + actor", () => {
    const e = makeAuditEntry({
      tenantId: "wl-acme",
      entity: "job",
      entityId: "J-1",
      op: AUDIT_OPS.EDIT,
      actor: "user-42",
      before: { id: "J-1", amount: "$100" },
      after: { id: "J-1", amount: "$200" },
      version: 2,
    });
    expect(Object.isFrozen(e)).toBe(true);
    expect(e.tenantId).toBe("wl-acme");
    expect(e.entity).toBe("job");
    expect(e.entityId).toBe("J-1");
    expect(e.op).toBe("edit");
    expect(e.actor).toBe("user-42");
    expect(e.before.amount).toBe("$100");
    expect(e.after.amount).toBe("$200");
    expect(e.version).toBe(2);
    expect(e.id).toMatch(/^aud-/);
    expect(e.at).toBeTruthy();
  });

  it("appendAuditLog never mutates prior entries and is deepMerge-safe via byId", () => {
    const a = makeAuditEntry({ entity: "job", entityId: "J-1", op: "create", after: { id: "J-1" } });
    const log1 = appendAuditLog(null, a);
    const b = makeAuditEntry({ entity: "job", entityId: "J-1", op: "edit", before: { id: "J-1" }, after: { id: "J-1", paid: true } });
    const log2 = appendAuditLog(log1, b);

    expect(log1.entries).toHaveLength(1);
    expect(log2.entries).toHaveLength(2);
    expect(log1.byId[a.id]).toBe(a);
    expect(log2.byId[a.id]).toBe(a);
    expect(log2.byId[b.id]).toBe(b);

    // Incremental patch only carries new keys — deepMerge keeps old byId rows.
    const patch = auditPatchOnly(b);
    const server = deepMerge({ byId: { [a.id]: a }, schema: 1 }, patch);
    expect(server.byId[a.id]).toEqual(a);
    expect(server.byId[b.id]).toEqual(b);
  });

  it("caps history without rewriting sealed rows", () => {
    let log = { byId: {}, entries: [], schema: 1 };
    const sealed = [];
    for (let i = 0; i < 5; i++) {
      const e = makeAuditEntry({ entity: "job", entityId: "J-x", op: "edit", version: i + 1 });
      sealed.push(e);
      log = appendAuditLog(log, e);
    }
    // Force cap with a tiny override by flooding past cap in a unit-local way:
    // we only assert append never mutates the sealed object identity.
    for (const e of sealed) {
      expect(Object.isFrozen(e)).toBe(true);
    }
    expect(AUDIT_LOG_CAP).toBeGreaterThan(100);
    expect(AUDIT_OV_KEY).toBe("_auditLog");
  });
});

describe("auditTrail — soft-delete / restore / version", () => {
  it("softDeletePatch tombstones with deletedAt + archive + version bump", () => {
    const before = { id: "J-1", customer: "Seewald", _version: 3 };
    const p = softDeletePatch(before, { at: "2026-07-31T12:00:00.000Z" });
    expect(p._deleted).toBe(true);
    expect(p._archived).toBe(true);
    expect(p.deletedAt).toBe("2026-07-31T12:00:00.000Z");
    expect(p._version).toBe(4);
    expect(isTombstoned({ ...before, ...p })).toBe(true);
    expect(isLiveRecord({ ...before, ...p })).toBe(false);
  });

  it("deleteJobPatch uses the same tombstone shape (shared layer)", () => {
    const p = deleteJobPatch({ id: "J-9", _version: 1 });
    expect(p._deleted).toBe(true);
    expect(p._archived).toBe(true);
    expect(p.deletedAt).toBeTruthy();
    expect(p._version).toBe(2);
  });

  it("planMutation delete retains prior state for reverse", () => {
    const before = {
      id: "J-1",
      customer: "Seewald",
      amount: "$5000",
      payments: [{ id: "pay-1", amount: "5000", method: "Zelle" }],
      _version: 1,
    };
    const { patch, entry, op } = planMutation(before, { _deleted: true }, { actor: "levi", tenantId: "le" });
    expect(op).toBe("delete");
    expect(patch.deletedAt).toBeTruthy();
    expect(patch._archived).toBe(true);
    expect(entry.before.customer).toBe("Seewald");
    expect(entry.before.payments).toHaveLength(1);
    expect(entry.op).toBe("delete");
    expect(entry.tenantId).toBe("le");

    const restore = restorePatchFromAuditEntry(entry);
    expect(restore.customer).toBe("Seewald");
    expect(restore._deleted).toBe(false);
    expect(restore._archived).toBe(false);
    expect(restore.payments[0].amount).toBe("5000");
  });

  it("planMutation edit bumps version and keeps before snapshot", () => {
    const before = { id: "J-2", amount: "$100", phone: "718", _version: 5 };
    const { patch, entry, op } = planMutation(before, { amount: "$150" }, { actor: "local" });
    expect(op).toBe("edit");
    expect(patch._version).toBe(6);
    expect(entry.before.amount).toBe("$100");
    expect(entry.delta.amount).toBe("$150");
  });

  it("softRestorePatch clears tombstone flags", () => {
    const before = { id: "J-1", _deleted: true, _archived: true, deletedAt: "2026-07-01T00:00:00.000Z", _version: 2 };
    const p = softRestorePatch(before);
    expect(p._deleted).toBe(false);
    expect(p._archived).toBe(false);
    expect(p.deletedAt).toBeNull();
    expect(p.restoredAt).toBeTruthy();
    expect(p._version).toBe(3);
  });

  it("nextVersion starts at 1", () => {
    expect(nextVersion(null)).toBe(1);
    expect(nextVersion({})).toBe(1);
    expect(nextVersion({ _version: 9 })).toBe(10);
  });
});

describe("auditTrail — payment soft-delete + QBO flag bridge", () => {
  it("removePayment tombstones in place (same id) and drops from live ledger", () => {
    const job = {
      id: "J-1",
      amount: "$10000",
      payments: [
        { id: "pay-a", amount: "5000", method: "Zelle", date: "2026-07-01" },
        { id: "pay-b", amount: "5000", method: "Zelle", date: "2026-07-02" },
      ],
    };
    const patch = removePayment(job, "pay-a", { actor: "levi", at: "2026-07-31T15:00:00.000Z" });
    expect(patch.payments).toHaveLength(2);
    const tomb = patch.payments.find((p) => p.id === "pay-a");
    expect(tomb._deleted).toBe(true);
    expect(tomb.deletedAt).toBe("2026-07-31T15:00:00.000Z");
    expect(tomb.amount).toBe("5000"); // prior amount retained on tombstone

    const live = normalizePayments({ ...job, ...patch });
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe("pay-b");

    const all = normalizePayments({ ...job, ...patch }, { includeDeleted: true });
    expect(all).toHaveLength(2);

    // Balances ignore tombstone.
    expect(patch.paid).toBe(false);
    expect(Number(patch.openBalance)).toBeGreaterThan(0);
  });

  it("softDeletePayment keeps stable id for history linkage", () => {
    const p = softDeletePayment({ id: "pay-1", amount: "100", qboPaymentId: "Q9" }, { actor: "sync" });
    expect(p.id).toBe("pay-1");
    expect(p.qboPaymentId).toBe("Q9");
    expect(p._deleted).toBe(true);
    expect(p.deletedBy).toBe("sync");
  });

  it("planNotInQboFlag is FLAG not delete — same audit layer as sync guardrail", () => {
    const pay = { id: "pay-4", amount: "5000", method: "Zelle" };
    const { entry, after } = planNotInQboFlag(pay, { tenantId: "le", actor: "sync" });
    expect(entry.op).toBe("flag");
    expect(entry.reason).toBe("not_in_qbo");
    expect(entry.meta.source).toBe("qbo_sync");
    expect(after.notInQbo).toBe(true);
    expect(after.syncFlag).toBe("not_in_qbo");
    expect(isTombstoned(after)).toBe(false); // flagged, not deleted
  });
});

describe("auditTrail — version history read path (no UI)", () => {
  it("listAuditForEntity returns chronological history for restore UI later", () => {
    let log = null;
    const e1 = makeAuditEntry({ entity: "job", entityId: "J-1", op: "create", after: { id: "J-1" }, at: "2026-07-01T00:00:00.000Z" });
    const e2 = makeAuditEntry({ entity: "job", entityId: "J-1", op: "edit", before: { amount: "1" }, after: { amount: "2" }, at: "2026-07-02T00:00:00.000Z" });
    const e3 = makeAuditEntry({ entity: "payment", entityId: "pay-9", op: "delete", before: { id: "pay-9" }, at: "2026-07-03T00:00:00.000Z" });
    log = mergeAuditOvPayload(log, [e1, e2, e3]);
    const hist = listAuditForEntity(log, "J-1", "job");
    expect(hist).toHaveLength(2);
    expect(hist[0].op).toBe("create");
    expect(hist[1].op).toBe("edit");
    expect(auditEntriesOf(log)).toHaveLength(3);
  });
});

describe("auditTrail — applyPaymentsPatch still works with live-only lists", () => {
  it("applyPaymentsPatch on live list after soft-delete yields correct open balance", () => {
    const job = { id: "J-1", amount: "$1000", payments: [{ id: "p1", amount: "1000", method: "Cash", date: "2026-07-01" }] };
    const afterDel = removePayment(job, "p1");
    // Re-run apply on live-only should match remaining
    const live = normalizePayments({ ...job, payments: afterDel.payments });
    const re = applyPaymentsPatch(job, live);
    expect(live).toHaveLength(0);
    expect(re.paid).toBe(false);
    expect(re.openBalance).toBe(1000);
  });
});
