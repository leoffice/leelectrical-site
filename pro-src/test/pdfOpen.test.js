// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  docStorePdfUrl,
  ensurePdfBlob,
  openPdfBlob,
  openPdfForNativeView,
  openPdfUrl,
  pdfInlinePreviewSupported,
  sharePdfBlob,
} from "../src/lib/pdfOpen.js";
import { stubPdfOpen } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("pdfOpen", () => {
  it("builds a docs-store URL for invoice/estimate keys", () => {
    expect(docStorePdfUrl("inv-251841")).toContain("/docs?key=inv-251841");
    expect(docStorePdfUrl("est-9001")).toContain("est-9001");
  });

  it("opens a PDF URL in a new tab via a transient anchor click", () => {
    const click = stubPdfOpen();
    openPdfUrl("https://leelectrical.us/.netlify/functions/docs?key=inv-1");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("opens a generated PDF blob through an object URL", () => {
    URL.createObjectURL = vi.fn(() => "blob:test-pdf");
    URL.revokeObjectURL = vi.fn();
    const click = stubPdfOpen();
    openPdfBlob(new Blob(["%PDF-1.4"], { type: "application/pdf" }));
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("ensurePdfBlob stamps application/pdf when type is missing", () => {
    const raw = new Blob(["%PDF-1.4"], { type: "" });
    const fixed = ensurePdfBlob(raw);
    expect(fixed.type).toBe("application/pdf");
  });

  it("pdfInlinePreviewSupported is false on iPhone user agents", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
    });
    expect(pdfInlinePreviewSupported()).toBe(false);
  });

  it("pdfInlinePreviewSupported is true on desktop Chrome", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      platform: "MacIntel",
      maxTouchPoints: 0,
    });
    expect(pdfInlinePreviewSupported()).toBe(true);
  });

  it("pdfInlinePreviewSupported is false on Samsung Fold Android", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; SM-F946U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
      platform: "Linux armv8l",
      maxTouchPoints: 10,
    });
    expect(pdfInlinePreviewSupported()).toBe(false);
  });

  it("openPdfForNativeView opens tab + named download (iPhone/Android-safe)", () => {
    URL.createObjectURL = vi.fn(() => "blob:native-pdf");
    URL.revokeObjectURL = vi.fn();
    const click = stubPdfOpen();
    const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    expect(openPdfForNativeView({ blob, filename: "Invoice-251825.pdf" })).toBe("download");
    // tab open + download anchor
    expect(click.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("sharePdfBlob uses navigator.share with a File when canShare allows files", async () => {
    const share = vi.fn(async () => {});
    const canShare = vi.fn(() => true);
    vi.stubGlobal("navigator", { share, canShare });
    const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    await expect(sharePdfBlob(blob, "invoice-1.pdf", "Invoice #1")).resolves.toBe("shared");
    expect(canShare).toHaveBeenCalled();
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0][0];
    expect(arg.files?.[0]?.name).toBe("invoice-1.pdf");
  });

  it("sharePdfBlob returns unsupported when share is missing", async () => {
    vi.stubGlobal("navigator", {});
    const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    await expect(sharePdfBlob(blob, "x.pdf")).resolves.toBe("unsupported");
  });
});
