// permitConfirm — universal confirmed/done + 24h flag/nudge model (Levi 2026-08-13).
import { describe, expect, it } from "vitest";
import {
  PERMIT_CONFIRM_DEFAULTS,
  buildActionConfirmedPatch,
  buildActionFiredPatch,
  buildActionNudgePatch,
  caseTrackIsStale,
  describePermitAction,
  getPermitAction,
  listFlaggedActions,
  permitActionPhase,
  staleDays,
} from "../src/lib/permitConfirm.js";

const T0 = Date.parse("2026-08-13T12:00:00Z");
const HOUR = 3600_000;
const DAY = 24 * HOUR;

function applyPatch(job, patch) {
  return { ...job, ...patch };
}

describe("permitConfirm state machine", () => {
  it("ready → sent → confirmed only via an external notification", () => {
    let job = { id: "J1" };
    expect(permitActionPhase(null, { now: T0 })).toBe("ready");

    job = applyPatch(
      job,
      buildActionFiredPatch(job, "inquiry:J1", {
        kind: "submit_inquiry",
        via: "bus:coned_submit_inquiry",
        meta: { caseNumber: "MC-1" },
        now: T0,
      })
    );
    const rec = getPermitAction(job, "inquiry:J1");
    expect(rec.firedAt).toBeTruthy();
    expect(rec.meta.caseNumber).toBe("MC-1");
    // Sent is NOT done — no self-report.
    expect(permitActionPhase(rec, { now: T0 + HOUR })).toBe("sent");

    job = applyPatch(
      job,
      buildActionConfirmedPatch(job, "inquiry:J1", {
        by: "email",
        source: "insight:abc",
        now: T0 + 2 * HOUR,
      })
    );
    const rec2 = getPermitAction(job, "inquiry:J1");
    expect(permitActionPhase(rec2, { now: T0 + 3 * HOUR })).toBe("confirmed");
    expect(rec2.confirmedBy).toBe("email");
    expect(rec2.confirmSource).toBe("insight:abc");
  });

  it("flags after 24h without confirmation (configurable)", () => {
    let job = { id: "J1" };
    job = applyPatch(job, buildActionFiredPatch(job, "k", { now: T0 }));
    const rec = getPermitAction(job, "k");
    expect(permitActionPhase(rec, { now: T0 + 23 * HOUR })).toBe("sent");
    expect(permitActionPhase(rec, { now: T0 + 25 * HOUR })).toBe("flagged");
    // configurable window
    expect(
      permitActionPhase(rec, { now: T0 + 25 * HOUR, config: { flagAfterHours: 48 } })
    ).toBe("sent");
    expect(listFlaggedActions(job, { now: T0 + 25 * HOUR })).toHaveLength(1);
    const d = describePermitAction(rec, { now: T0 + 25 * HOUR });
    expect(d.phase).toBe("flagged");
    expect(d.label).toMatch(/no confirmation/i);
  });

  it("re-nudge records the nudge but never confirms or re-fires", () => {
    let job = { id: "J1" };
    job = applyPatch(job, buildActionFiredPatch(job, "k", { now: T0 }));
    job = applyPatch(
      job,
      buildActionNudgePatch(job, "k", { note: "ping Israel", now: T0 + 25 * HOUR })
    );
    const rec = getPermitAction(job, "k");
    expect(rec.nudges).toHaveLength(1);
    expect(rec.nudges[0].channel).toBe(PERMIT_CONFIRM_DEFAULTS.nudgeChannel);
    // still flagged — a nudge is not a confirmation
    expect(permitActionPhase(rec, { now: T0 + 26 * HOUR })).toBe("flagged");
  });

  it("re-firing resets the confirmation wait", () => {
    let job = { id: "J1" };
    job = applyPatch(job, buildActionFiredPatch(job, "k", { now: T0 }));
    job = applyPatch(job, buildActionConfirmedPatch(job, "k", { now: T0 + HOUR }));
    job = applyPatch(job, buildActionFiredPatch(job, "k", { now: T0 + 2 * HOUR }));
    const rec = getPermitAction(job, "k");
    expect(rec.confirmedAt).toBe("");
    expect(permitActionPhase(rec, { now: T0 + 3 * HOUR })).toBe("sent");
  });
});

describe("open-case stale rule (>7 days, not complete)", () => {
  const iso = (t) => new Date(t).toISOString();
  it("flags stale open tracks, never completed ones, never unknown dates", () => {
    expect(
      caseTrackIsStale({ updatedAt: iso(T0 - 8 * DAY), stageBucket: "Open" }, { now: T0 })
    ).toBe(true);
    expect(
      caseTrackIsStale({ updatedAt: iso(T0 - 6 * DAY), stageBucket: "Open" }, { now: T0 })
    ).toBe(false);
    expect(
      caseTrackIsStale({ updatedAt: iso(T0 - 30 * DAY), stageBucket: "Passed" }, { now: T0 })
    ).toBe(false);
    expect(
      caseTrackIsStale({ updatedAt: iso(T0 - 30 * DAY), stageBucket: "Terminal" }, { now: T0 })
    ).toBe(false);
    expect(caseTrackIsStale({ updatedAt: "", stageBucket: "Open" }, { now: T0 })).toBe(false);
    expect(staleDays(iso(T0 - 8 * DAY), T0)).toBe(8);
  });
});
