import { describe, expect, it } from "vitest";
import {
  merchantSlugFromKey,
  keysLookPaired,
  sutMismatchHint,
} from "../../netlify/functions/sola-keys.mjs";

describe("sola-keys", () => {
  it("infers merchant slug from Cardknox key prefixes", () => {
    expect(merchantSlugFromKey("ifields_blzelectricf19091a9a53f435699d914e935")).toBe("blzelectric");
    expect(merchantSlugFromKey("blzelectric808608311bba436fb8cbfdd0e5f80f06")).toBe("blzelectric");
    expect(merchantSlugFromKey("blzelectrice69a2427f74f4ec99c32f856d6bf3565")).toBe("blzelectric");
  });

  it("flags SUT errors with a helpful hint when keys look mismatched", () => {
    const prevIf = process.env.SOLA_IFIELDS_KEY;
    const prevX = process.env.SOLA_X_KEY;
    process.env.SOLA_IFIELDS_KEY = "blzelectrice69a2427f74f4ec99c32f856d6bf3565";
    process.env.SOLA_X_KEY = "lepaymendev7753e14df74c47f29422a22746a13139";
    expect(keysLookPaired()).toBe(false);
    const hint = sutMismatchHint("Unauthorized Token (S) (SUT)");
    expect(hint).toContain("mismatched");
    process.env.SOLA_IFIELDS_KEY = prevIf;
    process.env.SOLA_X_KEY = prevX;
  });
});