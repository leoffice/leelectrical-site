// Agent access grant pure logic (mint / redeem / revoke / expire).
import { describe, expect, it } from "vitest";
import {
  clampTtlMs,
  DEFAULT_TTL_MS,
  emptyDoc,
  extendGrant,
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
    expect(clampTtlMs(12 * 60 * 60 * 1000)).toBe(12 * 60 * 60 * 1000);
    expect(clampTtlMs(24 * 60 * 60 * 1000)).toBe(24 * 60 * 60 * 1000);
    expect(clampTtlMs(99 * 60 * 60 * 1000)).toBe(24 * 60 * 60 * 1000);
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

  it("extends the same grant by adding duration (keeps code hash)", () => {
    const now = 4_000_000_000_000;
    const { doc, code } = mintGrant(emptyDoc(), { ttlMs: 30 * 60 * 1000, scope: "full" }, now);
    const hashBefore = doc.activeGrant.codeHash;
    const expiresBefore = doc.activeGrant.expiresAt;
    // 1 min later: 29 min left; add 24h → ~24h 29m remaining
    const t1 = now + 60 * 1000;
    const ext = extendGrant(doc, { ttlMs: 24 * 60 * 60 * 1000, scope: "test" }, t1);
    expect(ext.ok).toBe(true);
    expect(ext.doc.activeGrant.codeHash).toBe(hashBefore);
    expect(ext.doc.activeGrant.id).toBe(doc.activeGrant.id);
    expect(ext.doc.activeGrant.scope).toBe("test");
    expect(ext.doc.activeGrant.expiresAt).toBe(expiresBefore + 24 * 60 * 60 * 1000);
    expect(ext.grant.remainingMs).toBeGreaterThan(24 * 60 * 60 * 1000 - 2 * 60 * 1000);
    // Same code still redeems
    const ok = redeemGrant(ext.doc, code, { label: "agent" }, t1 + 1000);
    expect(ok.ok).toBe(true);
    expect(ok.session.expiresAt).toBe(ext.doc.activeGrant.expiresAt);
  });

  it("extend fails when no active grant", () => {
    const now = 5_000_000_000_000;
    const res = extendGrant(emptyDoc(), { ttlMs: 60 * 60 * 1000 }, now);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no active/i);
  });

  it("extend lengthens an active agent session", () => {
    const now = 6_000_000_000_000;
    const { doc, code } = mintGrant(emptyDoc(), { ttlMs: 30 * 60 * 1000 }, now);
    const redeemed = redeemGrant(doc, code, { label: "israel" }, now + 1000);
    expect(redeemed.ok).toBe(true);
    const t1 = now + 5 * 60 * 1000;
    const ext = extendGrant(redeemed.doc, { ttlMs: 60 * 60 * 1000 }, t1);
    expect(ext.ok).toBe(true);
    expect(ext.doc.activeGrant.session.expiresAt).toBe(ext.doc.activeGrant.expiresAt);
    expect(ext.doc.activeGrant.expiresAt).toBeGreaterThan(redeemed.doc.activeGrant.expiresAt);
  });
});
