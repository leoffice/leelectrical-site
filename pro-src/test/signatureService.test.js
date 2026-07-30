import { describe, it, expect } from "vitest";
import {
  applySignature,
  listSignatures,
  ownersFromProfile,
  registerSignature,
  resolveSigner,
} from "../src/lib/signatureService.js";
import { DEFAULT_PROFILE, mergeProfile } from "../src/lib/tenantProfile.js";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("signatureService", () => {
  it("seeds default owner from profile", () => {
    const owners = ownersFromProfile(DEFAULT_PROFILE);
    expect(owners.length).toBeGreaterThan(0);
    expect(owners[0].fullName).toBeTruthy();
    expect(resolveSigner(DEFAULT_PROFILE)?.fullName).toBeTruthy();
  });

  it("registers a signature for an owner and applies it", () => {
    const owners = ownersFromProfile(DEFAULT_PROFILE);
    const next = registerSignature(DEFAULT_PROFILE, {
      ownerId: owners[0].id,
      dataUrl: TINY_PNG,
      label: "Test sig",
    });
    expect(listSignatures(next).length).toBe(1);
    const applied = applySignature({ profile: next, ownerId: owners[0].id });
    expect(applied.dataUrl).toMatch(/^data:image\/png/);
    expect(applied.owner.fullName).toBe(owners[0].fullName);
  });

  it("white-label: second tenant owner name is used, not BLZ hardcode", () => {
    const other = mergeProfile({
      companyName: "Ace Plumbing Co",
      owners: [{ id: "o1", fullName: "Pat Ace", title: "Owner", isDefaultSigner: true }],
      signatures: [],
    });
    const signer = resolveSigner(other);
    expect(signer.fullName).toBe("Pat Ace");
    expect(signer.fullName).not.toMatch(/Levi/i);
  });
});
