/**
 * Permits module — meter application + functionalities lock-in + feature flag.
 */
import { describe, it, expect } from "vitest";
import {
  MODULE_KEY,
  isPermitsEnabled,
  METER_APPLICATION_OPTIONS,
  METER_APPLICATION_VALUES,
  isValidMeterApplication,
  meterApplicationLabel,
  getMeterApplication,
  recordMeterApplication,
  jobPatchMeterApplication,
  FUNCTIONALITIES_LOCK_IN,
  LEARNED_SKILLS_REMOVED,
  functionalitiesLockInSeed,
  lockInDoneCount,
  lockInTotalCount,
  lockInProgressPct,
  isLockInDone,
} from "../src/modules/permits/index.js";
import {
  LE_TENANT_SEED,
  resolveTenantConfig,
  resolveModules,
} from "../src/lib/tenantConfig.js";
import { isRouteAllowed } from "../src/lib/tenantNav.js";

describe("permits module boundary", () => {
  it("exports stable MODULE_KEY", () => {
    expect(MODULE_KEY).toBe("permits");
  });

  it("is enabled for LE seed, off for white-label full", () => {
    const le = resolveTenantConfig(LE_TENANT_SEED);
    expect(isPermitsEnabled(le)).toBe(true);
    const wl = resolveTenantConfig({
      tenantId: "acme",
      internal: false,
      plan: { tier: "full" },
    });
    expect(isPermitsEnabled(wl)).toBe(false);
    expect(isRouteAllowed("/applications", wl)).toBe(false);
  });

  it("plan tiers leave permits off (override path only)", () => {
    for (const tier of ["free", "pro", "full"]) {
      expect(resolveModules({ plan: { tier } }).permits).toBe(false);
    }
    expect(
      resolveModules({ plan: { tier: "pro" }, moduleOverrides: { permits: true } }).permits
    ).toBe(true);
  });
});

describe("meter application (4 options)", () => {
  it("has exactly four options with stable values", () => {
    expect(METER_APPLICATION_OPTIONS).toHaveLength(4);
    expect(METER_APPLICATION_VALUES).toEqual([
      "not_required",
      "not_needed",
      "new_meter",
      "new_application",
    ]);
    expect(METER_APPLICATION_OPTIONS.map((o) => o.label)).toEqual([
      "Not required",
      "Not needed for this job",
      "A new meter",
      "A new application",
    ]);
  });

  it("validates values and labels", () => {
    expect(isValidMeterApplication("new_meter")).toBe(true);
    expect(isValidMeterApplication("nope")).toBe(false);
    expect(meterApplicationLabel("new_application")).toBe("A new application");
  });

  it("records selection with timestamp", () => {
    const rec = recordMeterApplication("not_required", {
      at: "2026-07-31T12:00:00.000Z",
    });
    expect(rec).toEqual({
      value: "not_required",
      label: "Not required",
      setAt: "2026-07-31T12:00:00.000Z",
      source: "manual",
    });
  });

  it("rejects invalid values on record", () => {
    expect(() => recordMeterApplication("bogus")).toThrow(/Invalid/);
  });

  it("jobPatchMeterApplication writes paperwork.coned and mirrors permit", () => {
    const job = {
      id: "j1",
      paperwork: { coned: { enabled: true, caseNumber: "MC-1" } },
      permits: [
        { id: "p1", agency: "coned", primaryKey: "MC-1", currentStage: "layout_issued" },
        { id: "p2", agency: "dob", primaryKey: "B0123" },
      ],
    };
    const patch = jobPatchMeterApplication(job, "new_meter", {
      at: "2026-07-31T15:00:00.000Z",
    });
    expect(patch.paperwork.coned.enabled).toBe(true);
    expect(patch.paperwork.coned.meterApplication.value).toBe("new_meter");
    expect(patch.paperwork.coned.meterApplication.label).toBe("A new meter");
    expect(patch.permits).toHaveLength(2);
    expect(patch.permits[0].meterApplication.value).toBe("new_meter");
    expect(patch.permits[1].meterApplication).toBeUndefined();
  });

  it("getMeterApplication reads from paperwork or permit list", () => {
    expect(getMeterApplication(null)).toBe(null);
    const fromPw = getMeterApplication({
      paperwork: {
        coned: {
          meterApplication: {
            value: "not_needed",
            label: "Not needed for this job",
            setAt: "x",
          },
        },
      },
    });
    expect(fromPw.value).toBe("not_needed");

    const fromList = getMeterApplication({
      permits: [
        {
          agency: "coned",
          meterApplication: { value: "new_application", label: "A new application" },
        },
      ],
    });
    expect(fromList.value).toBe("new_application");
  });
});

describe("functionalities to lock in checklist", () => {
  it("seeds remaining skills only — learned removed from the board", () => {
    const seed = functionalitiesLockInSeed();
    // 12 remaining to-teach · 3 learned (app, meter, create-case)
    expect(seed).toHaveLength(12);
    expect(seed.every((i) => i.status === "to_build")).toBe(true);
    expect(seed.find((i) => i.id === 1)).toBeUndefined();
    expect(seed.find((i) => i.id === 8)).toBeUndefined();
    expect(seed.find((i) => i.id === 15)).toBeUndefined();
    expect(seed.find((i) => i.id === 2)).toBeTruthy();
    // Totals include learned for progress scale
    expect(lockInTotalCount()).toBe(15);
    expect(lockInDoneCount()).toBe(3);
  });

  it("scale reflects what's working (create-case verified to Review)", () => {
    expect(LEARNED_SKILLS_REMOVED.map((s) => s.id).sort((a, b) => a - b)).toEqual([1, 8, 15]);
    expect(LEARNED_SKILLS_REMOVED.find((s) => s.id === 15)?.title).toMatch(/Submit a Case/i);
    expect(lockInProgressPct()).toBe(20); // 3/15
  });

  it("preserves L1 / POE / Con Edison notes on key remaining items", () => {
    const byId = Object.fromEntries(FUNCTIONALITIES_LOCK_IN.map((i) => [i.id, i]));
    expect(byId[3].notes).toMatch(/L1/);
    expect(byId[10].notes).toMatch(/10:00/);
    expect(byId[14].notes).toMatch(/Con Edison/);
    expect(byId[1]).toBeUndefined();
    expect(byId[8]).toBeUndefined();
  });
});
