// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultLeLogoImage,
  jpegImageFromDataUrl,
  resolveCompanyLogoDataUrl,
  resolvePdfLogoImage,
  resolvePdfLogoImageSync,
} from "../src/lib/companyLogoPdf.js";
import { setCompanyLogoDataUrl, clearCompanyLogo } from "../src/lib/appSettings.js";
import { LE_LOGO_JPEG, leLogoJpegBytes } from "../src/lib/leLogoJpeg.js";
import { buildQbDocPdf } from "../src/lib/qbInvoicePdf.js";
import { mapJobToQbDocData } from "../src/lib/jobToQbDoc.js";

afterEach(() => {
  clearCompanyLogo();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

/** Tiny 1x1 JPEG (solid white) for deterministic embed tests. */
const TINY_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z";

const TINY_JPEG_DATA_URL = `data:image/jpeg;base64,${TINY_JPEG_B64}`;

describe("companyLogoPdf", () => {
  it("defaults to the built-in LE logo when nothing is uploaded", () => {
    expect(resolveCompanyLogoDataUrl()).toBe("");
    const img = resolvePdfLogoImageSync();
    expect(img.width).toBe(LE_LOGO_JPEG.width);
    expect(img.height).toBe(LE_LOGO_JPEG.height);
    expect(img.bytes.length).toBe(leLogoJpegBytes().length);
  });

  it("reads a custom JPEG data URL from device settings", () => {
    setCompanyLogoDataUrl(TINY_JPEG_DATA_URL);
    expect(resolveCompanyLogoDataUrl()).toBe(TINY_JPEG_DATA_URL);
    const img = resolvePdfLogoImageSync();
    expect(img.bytes.length).toBeGreaterThan(20);
    // Must not be the default LE logo bytes
    expect(img.bytes.length).not.toBe(leLogoJpegBytes().length);
  });

  it("honors an explicit logoDataUrl override over device settings", () => {
    setCompanyLogoDataUrl(TINY_JPEG_DATA_URL);
    const other = defaultLeLogoImage();
    // Pass through logoImage (already decoded) — highest priority
    const img = resolvePdfLogoImageSync({ logoImage: other });
    expect(img.bytes.length).toBe(other.bytes.length);
  });

  it("jpegImageFromDataUrl rejects non-JPEG data URLs", () => {
    expect(jpegImageFromDataUrl("data:image/png;base64,iVBORw0KGgo=")).toBeNull();
    expect(jpegImageFromDataUrl("https://example.com/logo.png")).toBeNull();
  });

  it("embeds the custom company logo bytes into the invoice PDF", async () => {
    setCompanyLogoDataUrl(TINY_JPEG_DATA_URL);
    const data = mapJobToQbDocData(
      {
        id: "j1",
        customer: "Logo Test Co",
        invoiceNo: "999001",
        amount: 100,
        invoiceLines: [{ description: "Work", qty: 1, unitPrice: 100 }],
      },
      "invoice"
    );
    data.logoImage = await resolvePdfLogoImage();
    const blob = buildQbDocPdf(data);
    const buf = new Uint8Array(await blob.arrayBuffer());
    // PDF must contain the custom JPEG payload (starts with FF D8)
    let found = false;
    const target = data.logoImage.bytes;
    outer: for (let i = 0; i < buf.length - target.length; i++) {
      if (buf[i] !== target[0] || buf[i + 1] !== target[1]) continue;
      let ok = true;
      for (let j = 0; j < target.length; j++) {
        if (buf[i + j] !== target[j]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        found = true;
        break outer;
      }
    }
    expect(found).toBe(true);
  });
});
