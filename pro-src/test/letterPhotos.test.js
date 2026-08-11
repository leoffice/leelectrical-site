// Levi 2026-08-10: photos attached to a letter must ride inside the same PDF,
// at their TRUE aspect ratio (no stretching), with optional per-photo captions,
// and the body must point the reader at them.
import { describe, expect, it } from "vitest";
import { containSize, loadLetterPhotoImages } from "../src/lib/letterPhotos.js";
import {
  LETTER_TYPES,
  PHOTO_REFERENCE_LINE,
  createLetterDraft,
  refreshLetterDraft,
  withPhotoReference,
} from "../src/lib/letterDraft.js";
import { buildLetterheadPdfWithPhotos } from "../src/lib/letterheadPdf.js";
import { setActiveTenantConfig } from "../src/lib/tenantBranding.js";

/** Minimal valid baseline JPEG of the given size (SOF0 carries the dimensions). */
function fakeJpeg(width, height) {
  const bytes = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  // SOF0: marker, length(17), precision, height(2), width(2), components…
  bytes.push(0xff, 0xc0, 0x00, 0x11, 0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 0x03);
  for (let i = 0; i < 9; i++) bytes.push(0x01);
  bytes.push(0xff, 0xd9);
  return new Uint8Array(bytes);
}

describe("containSize — never distorts", () => {
  it("preserves a landscape aspect ratio", () => {
    const out = containSize(1600, 900, 504, 500);
    expect(out.width / out.height).toBeCloseTo(1600 / 900, 4);
    expect(out.width).toBeLessThanOrEqual(504);
    expect(out.height).toBeLessThanOrEqual(500);
  });

  it("preserves a portrait aspect ratio", () => {
    const out = containSize(900, 1600, 504, 500);
    expect(out.width / out.height).toBeCloseTo(900 / 1600, 4);
    expect(out.width).toBeLessThanOrEqual(504);
    expect(out.height).toBeLessThanOrEqual(500);
  });

  it("contains rather than fills — a wide photo does not get cropped to the box height", () => {
    const out = containSize(4000, 500, 504, 500);
    expect(out.height).toBeLessThan(500); // filling would force height to 500
    expect(out.width / out.height).toBeCloseTo(8, 4);
  });

  it("never upscales past native size", () => {
    const out = containSize(80, 60, 504, 500);
    expect(out.width).toBe(80);
    expect(out.height).toBe(60);
  });

  it("survives degenerate dimensions", () => {
    expect(() => containSize(0, 0, 504, 500)).not.toThrow();
  });
});

describe("photo reference line", () => {
  it("appends the line only when photos exist, and is idempotent", () => {
    expect(withPhotoReference("Body.", [])).toBe("Body.");
    const once = withPhotoReference("Body.", [{ id: "p1" }]);
    expect(once).toMatch(new RegExp(PHOTO_REFERENCE_LINE));
    expect(withPhotoReference(once, [{ id: "p1" }])).toBe(once);
  });

  it("drops the line again when the last photo is removed", () => {
    const withRef = withPhotoReference("Body.", [{ id: "p1" }]);
    expect(withPhotoReference(withRef, [])).toBe("Body.");
  });

  it("rides through draft create + refresh", () => {
    const type = LETTER_TYPES.find((t) => t.id === "load_letter");
    const draft = createLetterDraft({
      type,
      job: { serviceAddress: "1 A St" },
      answers: { address: "1 A St", breakerRating: "40 A", phaseA: "3.9", phaseB: "4.1" },
      photos: [{ id: "p1", name: "a.jpg", url: "u" }],
    });
    expect(draft.bodyText).toMatch(new RegExp(PHOTO_REFERENCE_LINE));
    const cleared = refreshLetterDraft(draft, { photos: [] });
    expect(cleared.bodyText).not.toMatch(new RegExp(PHOTO_REFERENCE_LINE));
  });
});

describe("photo pages in the letter PDF", () => {
  it("appends one page per photo, embedding each at native dimensions", async () => {
    setActiveTenantConfig({
      profile: {
        companyName: "BLZ Electric Inc.",
        street: "383 Kingston Ave, Suite 297",
        cityStateZip: "Brooklyn, NY 11213",
        phone: "(718) 594-1850",
        email: "Office@LeElectrical.us",
        license: "Lic #11212",
      },
      branding: { companyName: "BLZ Electric Inc." },
      internal: true,
    });
    const photos = [
      { id: "p1", name: "wide.jpg", bytes: fakeJpeg(1600, 900), caption: "Panel after the load test." },
      { id: "p2", name: "tall.jpg", bytes: fakeJpeg(900, 1600) }, // no caption
    ];
    const images = await loadLetterPhotoImages(photos);
    expect(images.map((i) => [i.width, i.height])).toEqual([
      [1600, 900],
      [900, 1600],
    ]);

    const type = LETTER_TYPES.find((t) => t.id === "load_letter");
    const draft = createLetterDraft({
      type,
      job: { serviceAddress: "1 A St" },
      answers: { address: "1 A St", breakerRating: "40 A", phaseA: "3.9", phaseB: "4.1" },
      photos,
    });
    draft.status = "approved";
    const bytes = await buildLetterheadPdfWithPhotos({ draft, photoImages: images });
    let text = "";
    for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);

    // Letter page + one page per photo.
    expect(text.match(/\/Type \/Page[^s]/g)?.length).toBe(3);
    expect(text).toMatch(/\/ImPh0/);
    expect(text).toMatch(/\/ImPh1/);
    expect(text).toMatch(/\/Width 1600 \/Height 900/);
    expect(text).toMatch(/\/Width 900 \/Height 1600/);
    expect(text).toMatch(/ATTACHED PHOTOS/);
    // Captions are drawn word-by-word (one text op each) so they can be
    // centered — assert on the words, not a contiguous phrase.
    for (const word of ["Panel", "after", "load", "test."]) {
      expect(text).toContain(`(${word}) Tj`);
    }
    // The letter itself is unchanged: title + signature still present.
    expect(text).toMatch(/LOAD LETTER/);
    expect(text).toMatch(/\/ImSig/);
  });

  it("a letter with no photos produces no photo pages", async () => {
    const type = LETTER_TYPES.find((t) => t.id === "load_letter");
    const draft = createLetterDraft({
      type,
      job: { serviceAddress: "1 A St" },
      answers: { address: "1 A St", breakerRating: "40 A", phaseA: "3.9", phaseB: "4.1" },
    });
    draft.status = "approved";
    const bytes = await buildLetterheadPdfWithPhotos({ draft });
    let text = "";
    for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
    expect(text).not.toMatch(/ATTACHED PHOTOS/);
    expect(text).not.toMatch(/\/ImPh/);
    expect(text.match(/\/Type \/Page[^s]/g)?.length).toBe(1);
  });

  it("skips unreadable photos instead of failing the letter", async () => {
    const images = await loadLetterPhotoImages([
      { id: "bad", name: "broken.jpg", url: "https://unreachable.invalid/x.jpg" },
    ]);
    expect(images).toEqual([]);
  });
});
