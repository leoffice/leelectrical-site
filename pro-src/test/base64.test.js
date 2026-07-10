import { describe, it, expect } from "vitest";
import {
  bytesFromBase64,
  base64FromBytes,
  basicAuthBase64,
} from "../../netlify/functions/lib/base64.mjs";

describe("base64 helpers", () => {
  it("round-trips bytes", () => {
    const raw = new Uint8Array([72, 101, 108, 108, 111]);
    const b64 = base64FromBytes(raw);
    const back = bytesFromBase64(b64);
    expect([...back]).toEqual([...raw]);
  });

  it("builds basic auth header payload", () => {
    expect(basicAuthBase64("client", "secret")).toBe(btoa("client:secret"));
  });
});