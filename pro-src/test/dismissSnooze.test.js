// @vitest-environment jsdom
// Board-wide "X = remind me later" store (Levi 2026-07-27).
import { beforeEach, describe, expect, it } from "vitest";
import {
  DISMISS_SNOOZE_MAX,
  DISMISS_SNOOZE_MIN,
  clampSnoozeMinutes,
  clearSuggestionSnooze,
  formatSnoozeMinutes,
  isSuggestionSnoozed,
  pruneSuggestionSnoozes,
  snoozeSuggestion,
} from "../src/lib/dismissSnooze.js";

const T0 = new Date("2026-07-27T10:00:00");

describe("dismissSnooze", () => {
  beforeEach(() => localStorage.clear());

  it("spans 5 minutes to 5 hours", () => {
    expect(DISMISS_SNOOZE_MIN).toBe(5);
    expect(DISMISS_SNOOZE_MAX).toBe(300);
    expect(clampSnoozeMinutes(1)).toBe(5);
    expect(clampSnoozeMinutes(9999)).toBe(300);
    expect(clampSnoozeMinutes(45)).toBe(45);
  });

  it("labels durations the way the slider shows them", () => {
    expect(formatSnoozeMinutes(5)).toBe("5 min");
    expect(formatSnoozeMinutes(60)).toBe("1 hour");
    expect(formatSnoozeMinutes(150)).toBe("2½ hours");
    expect(formatSnoozeMinutes(300)).toBe("5 hours");
  });

  it("hides a suggestion until its time is up, then brings it back", () => {
    snoozeSuggestion("payment:abc", 30, T0);
    expect(isSuggestionSnoozed("payment:abc", new Date("2026-07-27T10:29:00"))).toBe(true);
    expect(isSuggestionSnoozed("payment:abc", new Date("2026-07-27T10:31:00"))).toBe(false);
  });

  it("an expired snooze is swept out of storage", () => {
    snoozeSuggestion("insight:1", 5, T0);
    isSuggestionSnoozed("insight:1", new Date("2026-07-27T11:00:00"));
    expect(JSON.parse(localStorage.getItem("lepro_dismiss_snooze"))).toEqual({});
  });

  it("unknown keys are never snoozed; clearing brings a card straight back", () => {
    expect(isSuggestionSnoozed("nothing", T0)).toBe(false);
    snoozeSuggestion("qbo-sync:a,b", 300, T0);
    expect(isSuggestionSnoozed("qbo-sync:a,b", T0)).toBe(true);
    clearSuggestionSnooze("qbo-sync:a,b");
    expect(isSuggestionSnoozed("qbo-sync:a,b", T0)).toBe(false);
  });

  it("prune drops only the entries that already fired", () => {
    snoozeSuggestion("a", 5, T0);
    snoozeSuggestion("b", 300, T0);
    pruneSuggestionSnoozes(new Date("2026-07-27T10:30:00"));
    const map = JSON.parse(localStorage.getItem("lepro_dismiss_snooze"));
    expect(Object.keys(map)).toEqual(["b"]);
  });
});
