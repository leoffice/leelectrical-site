import { describe, expect, it, vi } from "vitest";
import { pullCustomerFromQbo, runQboSync, refreshOfficeFiles } from "../src/lib/qboSyncActions.js";

describe("pullCustomerFromQbo", () => {
  it("fetches QuickBooks customer and patches every job for the group", async () => {
    const patchAndSave = vi.fn(async () => {});
    const showToast = vi.fn();
    const api = {
      getCustomer: vi.fn(async () => ({
        id: "34",
        name: "Avraham Drizin",
        phone: "718-555-0100",
        email: "a@d.com",
        billingAddress: "12 Bill St",
      })),
    };
    const jobs = [
      { id: "J-a", customer: "Old Name", qboCustomerId: "34" },
      { id: "J-b", customer: "Old Name", qboCustomerId: "34" },
    ];
    const ok = await pullCustomerFromQbo({
      qboId: "34",
      jobs,
      jobId: "J-a",
      api,
      patchAndSave,
      showToast,
    });
    expect(ok).toBe(true);
    expect(patchAndSave).toHaveBeenCalledTimes(2);
    expect(patchAndSave.mock.calls[0][1].phone).toBe("718-555-0100");
    expect(patchAndSave.mock.calls[0][1].billingAddress).toBe("12 Bill St");
    expect(showToast).toHaveBeenCalledWith("Customer info updated");
  });
});

describe("refreshOfficeFiles / refresh_files", () => {
  it("enqueues refresh_local_db and reports success when done", async () => {
    const enqueue = vi.fn(async () => {});
    const showToast = vi.fn();
    const api = {
      listCommands: vi.fn(async () => [
        { idempotencyKey: "refresh_local_db|1", status: "done", result: '{"ok":true}' },
      ]),
    };
    // Force a known idk by stubbing Date.now
    const now = Date.now;
    Date.now = () => 1;
    try {
      const ok = await refreshOfficeFiles({ enqueue, showToast, api });
      expect(ok).toBe(true);
      expect(enqueue).toHaveBeenCalledWith(
        "refresh_local_db",
        "refresh-local-db",
        {},
        "deterministic",
        "refresh_local_db|1"
      );
      expect(showToast).toHaveBeenCalledWith("Office files updated — imports will be fast again");
    } finally {
      Date.now = now;
    }

    enqueue.mockClear();
    showToast.mockClear();
    Date.now = () => 2;
    try {
      await runQboSync({
        kind: "refresh_files",
        job: { id: "J1", customer: "X" },
        enqueue,
        showToast,
        api: {
          listCommands: vi.fn(async () => [
            { idempotencyKey: "refresh_local_db|2", status: "done", result: "{}" },
          ]),
        },
      });
      expect(enqueue).toHaveBeenCalledWith(
        "refresh_local_db",
        expect.any(String),
        {},
        "deterministic",
        expect.stringMatching(/^refresh_local_db\|/)
      );
    } finally {
      Date.now = now;
    }
  });
});

describe("runQboSync customer kind", () => {
  it("pulls customer info instead of enqueueing update_customer", async () => {
    const enqueue = vi.fn();
    const patchAndSave = vi.fn(async () => {});
    const showToast = vi.fn();
    const api = {
      getCustomer: vi.fn(async () => ({
        id: "99",
        name: "Test Co",
        phone: "718-555-0000",
        email: "t@x.com",
        billingAddress: "1 Main",
      })),
      listCommands: vi.fn(async () => []),
    };
    await runQboSync({
      kind: "customer",
      job: { id: "J-open", customer: "Test Co", qboCustomerId: "99" },
      customerJobs: [{ id: "J-open", customer: "Test Co", qboCustomerId: "99" }],
      enqueue,
      showToast,
      refreshJobs: vi.fn(),
      api,
      patchAndSave,
    });
    expect(enqueue).not.toHaveBeenCalled();
    expect(patchAndSave).toHaveBeenCalledWith("J-open", expect.objectContaining({ phone: "718-555-0000" }));
  });
});

describe("runQboSync history kind", () => {
  it("always imports full history with scope=all (not open-only)", async () => {
    const enqueue = vi.fn(async () => {});
    const showToast = vi.fn();
    const refreshJobs = vi.fn(async () => []);
    const patchAndSave = vi.fn(async () => {});
    const now = Date.now;
    Date.now = () => 99;
    try {
      await runQboSync({
        kind: "history",
        scope: "open", // UI default — must still force all
        job: { id: "J1", customer: "Test Co", qboCustomerId: "99", invoiceNo: "100" },
        customerJobs: [{ id: "J1", customer: "Test Co", qboCustomerId: "99", invoiceNo: "100" }],
        enqueue,
        showToast,
        refreshJobs,
        api: {
          getCustomer: vi.fn(async () => null),
          listCommands: vi.fn(async () => [
            {
              idempotencyKey: "import_customer|99|history|all|99",
              status: "done",
              result: JSON.stringify({ imported: 5, paymentsAttached: 3, estimatesImported: 1, source: "local" }),
            },
          ]),
        },
        patchAndSave,
      });
    } finally {
      Date.now = now;
    }
    expect(enqueue).toHaveBeenCalledWith(
      "import_customer",
      expect.any(String),
      expect.objectContaining({ scope: "all", kind: "history", qboId: "99" }),
      "deterministic",
      expect.stringMatching(/^import_customer\|/)
    );
    // Should not flood fetch_payments — payments come from office files
    expect(enqueue.mock.calls.every((c) => c[0] !== "fetch_payments")).toBe(true);
    expect(refreshJobs).toHaveBeenCalled();
  });
});
