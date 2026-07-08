import { describe, expect, it, vi } from "vitest";
import { invoicePdfAvailable } from "../src/lib/payInvoicePdf.js";

describe("payInvoicePdf", () => {
  it("returns true when HEAD is ok and content is pdf", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => "application/pdf" },
      }))
    );
    expect(await invoicePdfAvailable("https://x.test/doc")).toBe(true);
  });

  it("returns false for json 404 body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        headers: { get: () => "application/json" },
      }))
    );
    expect(await invoicePdfAvailable("https://x.test/doc")).toBe(false);
  });
});