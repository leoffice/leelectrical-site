import { describe, expect, it, vi } from "vitest";
import { pullCustomerFromQbo, runQboSync } from "../src/lib/qboSyncActions.js";

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
    expect(showToast).toHaveBeenCalledWith("Customer info updated from QuickBooks");
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