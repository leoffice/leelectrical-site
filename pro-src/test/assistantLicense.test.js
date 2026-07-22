// AI Assistant paid license pure logic (mint / validate / revoke).
import { describe, expect, it } from "vitest";
import {
  emptyDoc,
  formatToken,
  isEntitledByToken,
  mintLicense,
  normalizeToken,
  publicLicense,
  revokeLicense,
  sha256Hex,
  statusPayload,
  tokenPreview,
  validateLicense,
} from "../../netlify/functions/lib/assistantLicense.mjs";

describe("assistant licenses (paid feature)", () => {
  it("normalizes and formats tokens", () => {
    expect(normalizeToken("ab3k-9mp2-cdef-ghjk-lmnp")).toBe("AB3K9MP2CDEFGHJKLMNP");
    expect(formatToken("AB3K9MP2CDEFGHJKLMNP")).toBe("AB3K-9MP2-CDEF-GHJK-LMNP");
  });

  it("mints owner unlimited token once (replace prior owner)", () => {
    const now = 1_700_000_000_000;
    const first = mintLicense(emptyDoc(), { kind: "owner", label: "Levi" }, now);
    expect(first.ok).toBe(true);
    expect(first.token).toMatch(
      /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/
    );
    expect(first.license.kind).toBe("owner");
    expect(first.license.unlimited).toBe(true);
    expect(first.doc.licenses[0].tokenHash).toBe(sha256Hex(normalizeToken(first.token)));

    const second = mintLicense(first.doc, { kind: "owner", label: "Levi" }, now + 1000);
    expect(second.ok).toBe(true);
    const activeOwners = second.doc.licenses.filter((l) => l.kind === "owner" && !l.revokedAt);
    expect(activeOwners).toHaveLength(1);
    // Old owner token no longer works
    const old = validateLicense(second.doc, first.token, now + 2000);
    expect(old.ok).toBe(false);
    const neu = validateLicense(second.doc, second.token, now + 2000);
    expect(neu.ok).toBe(true);
    expect(neu.entitled).toBe(true);
  });

  it("mints paid customer tokens that validate unlimited", () => {
    const now = 1_700_000_000_000;
    let doc = emptyDoc();
    const a = mintLicense(doc, { kind: "paid", label: "Acme Electric" }, now);
    expect(a.ok).toBe(true);
    doc = a.doc;
    const b = mintLicense(doc, { kind: "paid", label: "Beta Plumbing" }, now + 1);
    expect(b.ok).toBe(true);
    doc = b.doc;

    expect(statusPayload(doc).activeCount).toBe(2);

    const okA = validateLicense(doc, a.token, now + 10);
    expect(okA.ok).toBe(true);
    expect(okA.license.label).toBe("Acme Electric");
    doc = okA.doc;

    const bad = validateLicense(doc, "WRONG-TOKEN-HERE-XXXX-YYYY", now + 20);
    expect(bad.ok).toBe(false);
    expect(bad.entitled).toBe(false);
  });

  it("requires a label", () => {
    const r = mintLicense(emptyDoc(), { kind: "paid", label: "   " });
    expect(r.ok).toBe(false);
  });

  it("revokes a paid token so it stops working", () => {
    const now = 1_700_000_000_000;
    const minted = mintLicense(emptyDoc(), { kind: "paid", label: "Zed Co" }, now);
    const revoked = revokeLicense(minted.doc, minted.license.id, now + 5);
    expect(revoked.ok).toBe(true);
    expect(revoked.license.active).toBe(false);

    const v = validateLicense(revoked.doc, minted.token, now + 10);
    expect(v.ok).toBe(false);
    expect(isEntitledByToken(revoked.doc, minted.token)).toBe(false);
  });

  it("public license never leaks the hash", () => {
    const minted = mintLicense(emptyDoc(), { kind: "owner", label: "Owner" });
    const pub = publicLicense(minted.doc.licenses[0]);
    expect(pub.tokenHash).toBeUndefined();
    expect(pub.tokenPreview).toBe(tokenPreview(minted.token));
  });
});
