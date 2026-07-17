/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import {
  PROMPT_QUEUE_CAP,
  canShowNameSortPrompt,
  claimReminderSlots,
  consumeNameSortSlot,
  nameSortShownToday,
  nameSortSlotsRemaining,
  reminderSlotsClaimed,
  resetPopupBudget,
} from "../src/lib/promptQueueCap.js";

beforeEach(() => {
  resetPopupBudget();
  localStorage.clear();
  sessionStorage.clear();
});

describe("prompt queue cap — shared reminders + name-sort", () => {
  it("starts with five free name-sort slots when no reminders claimed", () => {
    expect(PROMPT_QUEUE_CAP).toBe(5);
    expect(nameSortSlotsRemaining()).toBe(5);
    expect(canShowNameSortPrompt()).toBe(true);
  });

  it("reminder claim reserves the shared budget first", () => {
    claimReminderSlots(3);
    expect(reminderSlotsClaimed()).toBe(3);
    expect(nameSortSlotsRemaining()).toBe(2);
    claimReminderSlots(5);
    expect(reminderSlotsClaimed()).toBe(5);
    expect(nameSortSlotsRemaining()).toBe(0);
    expect(canShowNameSortPrompt()).toBe(false);
    // claim is monotonic within the day — cannot shrink
    claimReminderSlots(1);
    expect(reminderSlotsClaimed()).toBe(5);
    // never above cap
    claimReminderSlots(99);
    expect(reminderSlotsClaimed()).toBe(5);
  });

  it("each name-sort card consumes one slot (idempotent per pair)", () => {
    expect(consumeNameSortSlot("a|b")).toBe(true);
    expect(nameSortShownToday()).toBe(1);
    expect(nameSortSlotsRemaining()).toBe(4);
    expect(consumeNameSortSlot("a|b")).toBe(true);
    expect(nameSortShownToday()).toBe(1);
    expect(nameSortSlotsRemaining()).toBe(4);
  });

  it("stops after five name-sort cards with no reminders", () => {
    for (let i = 0; i < 5; i++) {
      expect(canShowNameSortPrompt()).toBe(true);
      expect(consumeNameSortSlot("pair-" + i)).toBe(true);
    }
    expect(nameSortShownToday()).toBe(5);
    expect(nameSortSlotsRemaining()).toBe(0);
    expect(canShowNameSortPrompt()).toBe(false);
    expect(consumeNameSortSlot("pair-extra")).toBe(false);
  });

  it("two reminders leave three name-sort slots for the day", () => {
    claimReminderSlots(2);
    expect(nameSortSlotsRemaining()).toBe(3);
    consumeNameSortSlot("p1");
    consumeNameSortSlot("p2");
    consumeNameSortSlot("p3");
    expect(nameSortSlotsRemaining()).toBe(0);
    expect(canShowNameSortPrompt()).toBe(false);
  });

  it("five reminders leave zero room for name-sort cards", () => {
    claimReminderSlots(8);
    expect(reminderSlotsClaimed()).toBe(5);
    expect(canShowNameSortPrompt()).toBe(false);
    expect(consumeNameSortSlot("x|y")).toBe(false);
  });
});
