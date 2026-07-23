// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultCompanyLogoImage,
  defaultLeLogoImage,
  isLeCompanyTenant,
  jpegImageFromDataUrl,
  resolveCompanyLogoDataUrl,
  resolvePdfLogoImage,
  resolvePdfLogoImageSync,
} from "../src/lib/companyLogoPdf.js";
import { setCompanyLogoDataUrl, clearCompanyLogo } from "../src/lib/appSettings.js";
import { LE_LOGO_JPEG, leLogoJpegBytes } from "../src/lib/leLogoJpeg.js";
import { buildQbDocPdf } from "../src/lib/qbInvoicePdf.js";
import { mapJobToQbDocData } from "../src/lib/jobToQbDoc.js";
import { setActiveTenantConfig } from "../src/lib/tenantBranding.js";
import { resolveTenantConfig } from "../src/lib/tenantConfig.js";

afterEach(() => {
  clearCompanyLogo();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  // Restore LE flagship seed so other suites see the default.
  setActiveTenantConfig(resolveTenantConfig(null));
});

/** Tiny 1x1 JPEG (solid white) for deterministic embed tests. */
const TINY_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z";

const TINY_JPEG_DATA_URL = `data:image/jpeg;base64,${TINY_JPEG_B64}`;

function asDemoTenant() {
  setActiveTenantConfig(
    resolveTenantConfig({
      tenantId: "demo",
      internal: false,
      plan: { tier: "full", crewAddon: true },
      branding: {
        companyName: "Ace Plumbing Co.",
        logoUrl: "",
        primaryColor: "#1d4ed8",
      },
      profile: {
        companyName: "Ace Plumbing Co.",
        logoDataUrl: "",
      },
    })
  );
}

describe("companyLogoPdf", () => {
  it("defaults to the built-in LE logo for the LE Electrical account", () => {
    expect(isLeCompanyTenant()).toBe(true);
    expect(resolveCompanyLogoDataUrl()).toBe("");
    const img = resolvePdfLogoImageSync();
    expect(img.width).toBe(LE_LOGO_JPEG.width);
    expect(img.height).toBe(LE_LOGO_JPEG.height);
    expect(img.bytes.length).toBe(leLogoJpegBytes().length);
  });

  it("never falls back to the LE mark for a white-label demo tenant", () => {
    asDemoTenant();
    expect(isLeCompanyTenant()).toBe(false);
    expect(defaultCompanyLogoImage()).toBeNull();
    expect(resolvePdfLogoImageSync()).toBeNull();
  });

  it("reads a custom JPEG data URL from device settings", () => {
    setCompanyLogoDataUrl(TINY_JPEG_DATA_URL);
    expect(resolveCompanyLogoDataUrl()).toBe(TINY_JPEG_DATA_URL);
    const img = resolvePdfLogoImageSync();
    expect(img.bytes.length).toBeGreaterThan(20);
    // Must not be the default LE logo bytes
    expect(img.bytes.length).not.toBe(leLogoJpegBytes().length);
  });

  it("prefers a just-uploaded device logo over a stale empty tenant profile", () => {
    asDemoTenant();
    setCompanyLogoDataUrl(TINY_JPEG_DATA_URL);
    expect(resolveCompanyLogoDataUrl()).toBe(TINY_JPEG_DATA_URL);
    const img = resolvePdfLogoImageSync();
    expect(img).not.toBeNull();
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

  it("builds a PDF without the LE logo bytes for a demo tenant with no logo", async () => {
    asDemoTenant();
    const data = mapJobToQbDocData(
      {
        id: "j1",
        customer: "Blue Ridge Cafe",
        invoiceNo: "1002",
        amount: 100,
        invoiceLines: [{ description: "Work", qty: 1, unitPrice: 100 }],
      },
      "invoice"
    );
    const blob = buildQbDocPdf(data);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const le = leLogoJpegBytes();
    let foundLe = false;
    outer: for (let i = 0; i < buf.length - le.length; i++) {
      if (buf[i] !== le[0] || buf[i + 1] !== le[1]) continue;
      let ok = true;
      for (let j = 0; j < le.length; j++) {
        if (buf[i + j] !== le[j]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        foundLe = true;
        break outer;
      }
    }
    expect(foundLe).toBe(false);
  });
});
