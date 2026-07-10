import { describe, expect, it } from "vitest";
import {
  merchantSlugFromKey,
  keysLookPaired,
  sutMismatchHint,
} from "../../netlify/functions/sola-keys.mjs";

describe("sola-keys", () => {
  it("infers merchant slug from Cardknox key prefixes", () => {
    expect(merchantSlugFromKey("ifields_blzelectric_mock_test_key")).toBe("blzelectric");
    expect(merchantSlugFromKey("blzelectric_mock_gateway_key")).toBe("blzelectric");
    expect(merchantSlugFromKey("blzelectrice_mock_ifields_key")).toBe("blzelectric");
  });

  it("flags SUT errors with a helpful hint when keys look mismatched", () => {
    const prevIf = process.env.SOLA_IFIELDS_KEY;
    const prevX = process.env.SOLA_X_KEY;
    process.env.SOLA_IFIELDS_KEY = "blzelectric_mock_ifields_key_for_pair_test";
    process.env.SOLA_X_KEY = "test_lepaymendev_x_key_placeholder";
    expect(keysLookPaired()).toBe(false);
    const hint = sutMismatchHint("Unauthorized Token (S) (SUT)");
    expect(hint).toContain("mismatched");
    process.env.SOLA_IFIELDS_KEY = prevIf;
    process.env.SOLA_X_KEY = prevX;
  });
});