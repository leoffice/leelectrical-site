// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_WELCOME_DELAY_MS,
  ADMIN_WELCOME_TEXT,
  adminWelcomeAlreadySent,
  adminWelcomeMessageId,
  buildAdminWelcomeMessage,
  ensureFirstOpenStamp,
  markAdminWelcomeSent,
  shouldDeliverAdminWelcome,
} from "../src/lib/adminWelcome.js";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("adminWelcome", () => {
  it("stamps first open once", () => {
    const t0 = 1_700_000_000_000;
    expect(ensureFirstOpenStamp(t0)).toBe(t0);
    expect(ensureFirstOpenStamp(t0 + 999_999)).toBe(t0);
  });

  it("waits ~20 minutes before delivering", () => {
    const t0 = 1_700_000_000_000;
    ensureFirstOpenStamp(t0);
    expect(shouldDeliverAdminWelcome(t0 + ADMIN_WELCOME_DELAY_MS - 1)).toBe(false);
    expect(shouldDeliverAdminWelcome(t0 + ADMIN_WELCOME_DELAY_MS)).toBe(true);
  });

  it("only delivers once", () => {
    const t0 = 1_700_000_000_000;
    ensureFirstOpenStamp(t0);
    expect(shouldDeliverAdminWelcome(t0 + ADMIN_WELCOME_DELAY_MS)).toBe(true);
    markAdminWelcomeSent();
    expect(adminWelcomeAlreadySent()).toBe(true);
    expect(shouldDeliverAdminWelcome(t0 + ADMIN_WELCOME_DELAY_MS * 2)).toBe(false);
  });

  it("builds a stable local admin message", () => {
    const msg = buildAdminWelcomeMessage(123);
    expect(msg.id).toBe(adminWelcomeMessageId());
    expect(msg.who).toBe("admin");
    expect(msg.text).toBe(ADMIN_WELCOME_TEXT);
    expect(msg.ts).toBe(123);
  });
});
