// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { docStorePdfUrl, openPdfBlob, openPdfUrl, sharePdfBlob } from "../src/lib/pdfOpen.js";
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