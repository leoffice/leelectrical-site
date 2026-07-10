import { describe, expect, it } from "vitest";
import {
  buildRecurringPayload,
  defaultRecurringState,
  recurringIdempotencyKey,
} from "../src/lib/recurringBilling.js";
import { planDocSaveSync } from "../src/lib/docSync.js";

describe("recurringBilling", () => {
  it("defaultRecurringState starts disabled with monthly defaults", () => {
    const s = defaultRecurringState({ customer: "Acme LLC" });
    expect(s.enabled).toBe(false);
    expect(s.interval).toBe("Monthly");
    expect(s.name).toContain("Acme");
  });

  it("buildRecurringPayload returns null when disabled", () => {
    expect(buildRecurringPayload({ enabled: false }, {})).toBeNull();
  });

  it("buildRecurringPayload includes schedule fields when enabled", () => {
    const p = buildRecurringPayload(
      {
        enabled: true,
        interval: "Weekly",
        startDate: "2026-08-01",
        dayOfWeek: 3,
        name: "Weekly service",
      },
      { send: false }
    );
    expect(p).toMatchObject({
      enabled: true,
      interval: "Weekly",
      startDate: "2026-08-01",
      dayOfWeek: 3,
      name: "Weekly service",
    });
  });

  it("planDocSaveSync enqueues create_recurring_invoice when enabled", () => {
    const job = {
      id: "J-r",
      customer: "Test Co",
      email: "a@test.com",
      qboCustomerId: "99",
      serviceAddress: "1 Main",
    };
    const recurringState = {
      enabled: true,
      interval: "Monthly",
      startDate: "2026-08-15",
      dayOfMonth: 15,
      name: "Test monthly",
    };
    const { commands } = planDocSaveSync(job, {
      kind: "invoice",
      mode: "new",
      lines: [{ itemName: "Service", qty: 1, unitPrice: 100 }],
      serviceAddress: "1 Main",
      apartment: "",
      send: false,
      recurringState,
    });
    expect(commands.map((c) => c.type)).toEqual(["create_invoice", "create_recurring_invoice"]);
    expect(commands[1].payload.recurring.enabled).toBe(true);
    expect(recurringIdempotencyKey(job.id, [{ itemName: "Service" }], recurringState)).toContain(
      "create_recurring_invoice:J-r:"
    );
  });
});