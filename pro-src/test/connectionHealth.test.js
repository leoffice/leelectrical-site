import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { probeConnections } from "../src/lib/connectionHealth.js";

describe("probeConnections", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, opts) => {
        const u = String(url);
        if (u.includes("calendar")) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({ events: [{ id: "1" }], syncedAt: Date.now() - 30_000 }),
          };
        }
        if (u.includes("send-doc-email")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              probe: true,
              hasResendKey: false,
              from: "payments@leelectrical.us",
            }),
          };
        }
        if (u.includes("sola-ifields-config")) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({ ok: true, ifieldsKey: "ifields_test", environment: "production" }),
          };
        }
        return { ok: false, status: 404, text: async () => "{}", json: async () => ({}) };
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports calendar ok, email missing key, card ready", async () => {
    const h = await probeConnections();
    expect(h.calendar.ok).toBe(true);
    expect(h.calendar.events).toBe(1);
    expect(h.email.ok).toBe(false);
    expect(h.email.hasResendKey).toBe(false);
    expect(h.cardEntry.ok).toBe(true);
  });
});
