import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { bindProcessEnv } from "../../netlify/functions/lib/pagesAdapter.mjs";

describe("bindProcessEnv", () => {
  const prev = {};

  beforeEach(() => {
    prev.SOLA_IFIELDS_KEY = process.env.SOLA_IFIELDS_KEY;
    prev.RESEND_API_KEY = process.env.RESEND_API_KEY;
    delete process.env.SOLA_IFIELDS_KEY;
    delete process.env.RESEND_API_KEY;
  });

  afterEach(() => {
    if (prev.SOLA_IFIELDS_KEY == null) delete process.env.SOLA_IFIELDS_KEY;
    else process.env.SOLA_IFIELDS_KEY = prev.SOLA_IFIELDS_KEY;
    if (prev.RESEND_API_KEY == null) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prev.RESEND_API_KEY;
  });

  it("mirrors string secrets onto process.env", () => {
    bindProcessEnv({
      SOLA_IFIELDS_KEY: "ifields_abc",
      RESEND_API_KEY: "re_test",
      LE_KV: { get: () => {} }, // binding object — skip
    });
    expect(process.env.SOLA_IFIELDS_KEY).toBe("ifields_abc");
    expect(process.env.RESEND_API_KEY).toBe("re_test");
  });
});
