// Agent access grant pure logic (mint / redeem / revoke / expire).
import { describe, expect, it } from "vitest";
import {
  clampTtlMs,
  DEFAULT_TTL_MS,
  emptyDoc,
  formatCode,
  mintGrant,
  normalizeCode,
  publicGrant,
  redeemGrant,
  refreshGrantState,
  revokeGrant,
  sha256Hex,
} from "../../netlify/functions/lib/agentAccess.mjs";

describe("agent access codes", () => {
  it("normalizes and formats codes", () => {
    expect(normalizeCode("ab3k-9mp2")).toBe("AB3K9MP2");
    expect(formatCode("AB3K9MP2")).toBe("AB3K-9MP2");
  });

  it("clamps TTL", () => {
    expect(clampTtlMs(1000)).toBe(5 * 60 * 1000);
    expect(clampTtlMs(undefined)).toBe(DEFAULT_TTL_MS);
    expect(clampTtlMs(99 * 60 * 60 * 1000)).toBe(4 * 60 * 60 * 1000);
  });

  it("mints a single-use code that redeems into a session", () => {
    const now = 1_700_000_000_000;
    const { doc, code, grant } = mintGrant(emptyDoc(), { ttlMs: 30 * 60 * 1000, scope: "full" }, now);
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(grant.expiresAt).toBe(now + 30 * 60 * 1000);
    expect(doc.activeGrant.codeHash).toBe(sha256Hex(normalizeCode(code)));

    const bad = redeemGrant(doc, "WRONG-CODE", {}, now + 1000);
    expect(bad.ok).toBe(false);

    const ok = redeemGrant(doc, code, { label: "israel" }, now + 2000);
    expect(ok.ok).toBe(true);
    expect(ok.token).toHaveLength(48);
    expect(ok.session.scope).toBe("full");
    expect(ok.session.label).toBe("israel");

    const reuse = redeemGrant(ok.doc, code, {}, now + 3000);
    expect(reuse.ok).toBe(false);
  });

  it("revokes and expires grants", () => {
    const now = 2_000_000_000_000;
    const { doc, code } = mintGrant(emptyDoc(), { ttlMs: 15 * 60 * 1000 }, now);
    const revoked = revokeGrant(doc, now + 1000);
    expect(revoked.revoked).toBe(true);
    expect(revoked.doc.activeGrant).toBe(null);
    const after = redeemGrant(revoked.doc, code, {}, now + 2000);
    expect(after.ok).toBe(false);

    const { doc: d2 } = mintGrant(emptyDoc(), { ttlMs: 15 * 60 * 1000 }, now);
    const expired = refreshGrantState(d2, now + 16 * 60 * 1000);
    expect(expired.activeGrant).toBe(null);
    expect(expired.audit[0].type).toBe("expire");
  });

  it("publicGrant hides secrets", () => {
    const now = 3_000_000_000_000;
    const { doc } = mintGrant(emptyDoc(), {}, now);
    const pub = publicGrant(doc.activeGrant, now);
    expect(pub.codeHash).toBeUndefined();
    expect(pub.id).toBeTruthy();
    expect(pub.remainingMs).toBeGreaterThan(0);
  });
});
