import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("pending payment Ignore + tap feedback wiring", () => {
  it("exposes Ignore at the top of the payment card", () => {
    const src = readFileSync(join(root, "src/components/PendingPaymentPrompts.jsx"), "utf8");
    expect(src).toMatch(/pending-payment-ignore-top/);
    expect(src).toMatch(/Ignore — already recorded/);
    expect(src).toMatch(/pickQboCustomer/);
    expect(src).toMatch(/paymentJobRank/);
  });

  it("boots global tap flash + haptic", () => {
    const main = readFileSync(join(root, "src/main.jsx"), "utf8");
    const css = readFileSync(join(root, "src/index.css"), "utf8");
    expect(main).toMatch(/installGlobalTapFeedback/);
    expect(css).toMatch(/le-press-flash/);
  });
});
