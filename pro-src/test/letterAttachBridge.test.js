// Levi 2026-08-10 (v407 retest): he attached a photo with the job's
// "Add attachment" button and it never appeared in the letter. Root cause —
// that button writes job.attachments, but letters only read draft.photos
// (the questionnaire's own picker). These lock the bridge between the two,
// and cover the richer invoice-line description.
import { describe, expect, it } from "vitest";
import {
  imageAttachmentsAsPhotos,
  isImageAttachment,
  mergeLetterPhotos,
} from "../src/lib/letterPhotos.js";
import {
  LETTER_TYPES,
  createLetterDraft,
  letterInvoiceDescription,
  refreshLetterDraft,
} from "../src/lib/letterDraft.js";

const photoAtt = {
  id: "att-1",
  name: "Panel photo",
  url: "https://x.test/docs?key=chat-1-panel.jpg",
  mime: "image/jpeg",
  attachToEmail: true,
};

describe("attachment → letter photo bridge", () => {
  it("recognizes images by mime and by extension when mime is missing", () => {
    expect(isImageAttachment(photoAtt)).toBe(true);
    expect(isImageAttachment({ name: "shot.HEIC", url: "https://x/y" })).toBe(true);
    expect(isImageAttachment({ name: "p", url: "https://x/docs?key=a-photo.png" })).toBe(true);
    expect(isImageAttachment({ name: "Contract", url: "u", mime: "application/pdf" })).toBe(false);
    expect(isImageAttachment({ name: "no url" })).toBe(false);
  });

  it("never treats the generated letter PDF as an evidence photo", () => {
    expect(
      isImageAttachment({ name: "Letter.pdf", url: "u", mime: "image/jpeg", letterId: "letter-1" })
    ).toBe(false);
  });

  it("turns job attachments into captionable photo rows", () => {
    const photos = imageAttachmentsAsPhotos([photoAtt, { name: "c", url: "u", mime: "application/pdf" }]);
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({ name: "Panel photo", url: photoAtt.url, fromAttachment: true });
  });

  it("merges without duplicating or clobbering an existing caption", () => {
    const existing = [{ id: "p1", url: photoAtt.url, name: "mine", caption: "typed by Levi" }];
    const merged = mergeLetterPhotos(existing, imageAttachmentsAsPhotos([photoAtt]));
    expect(merged).toHaveLength(1);
    expect(merged[0].caption).toBe("typed by Levi");
  });

  it("a photo attached the real way reaches the draft and triggers the body reference", () => {
    const job = {
      id: "j1",
      serviceAddress: "1254 sterling pl brooklyn",
      attachments: [photoAtt],
    };
    const type = LETTER_TYPES.find((t) => t.id === "equipment_safety_inspection");
    let draft = createLetterDraft({ type, job, answers: { address: "1254 sterling pl brooklyn", equipment: "main metering equipment" } });
    expect(draft.photos).toHaveLength(0); // the old, broken state

    // what the questionnaire now does on open:
    draft = refreshLetterDraft(draft, {
      photos: mergeLetterPhotos(draft.photos, imageAttachmentsAsPhotos(job.attachments)),
      job,
    });
    expect(draft.photos).toHaveLength(1);
    expect(draft.bodyText).toMatch(/Review attached photos/);
  });
});

describe("invoice line description", () => {
  const linesOf = (t, a, s) => letterInvoiceDescription(t, a, s).split("\n");

  it("gives the equipment safety letter at least 3 professional lines", () => {
    const type = LETTER_TYPES.find((t) => t.id === "equipment_safety_inspection");
    const lines = linesOf(
      type,
      { equipment: "main metering equipment", methods: "visual, operational test" },
      "1254 Sterling Pl"
    );
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines[1]).toMatch(/^Price includes performing a safety inspection of the main metering equipment/);
    expect(lines.join(" ")).toMatch(/corrosion/);
    expect(lines.join(" ")).toMatch(/paperwork/);
  });

  it("describes a load letter with its own context and correct grammar", () => {
    const type = LETTER_TYPES.find((t) => t.id === "load_letter");
    const lines = linesOf(
      type,
      { breakerRating: "40 Amp double-pole fuse per apartment", scope: "electrical sub-panel inspection of the apartment units" },
      "1254 Sterling Pl"
    );
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.join(" ")).toMatch(/performing an electrical sub-panel inspection/);
    expect(lines.join(" ")).toMatch(/40 Amp double-pole fuse per apartment/);
    expect(lines.join(" ")).not.toMatch(/\bperforming electrical\b/); // missing article
  });

  it("describes a shared-meter affidavit, keeping the unit label and using a gerund", () => {
    const type = LETTER_TYPES.find((t) => t.id === "shared_meter_affidavit");
    const lines = linesOf(
      type,
      { unit: "Apt 2R", accountNumber: "59117-24803-6", corrective: "Removed cables incorrectly connected to / running through this meter" },
      "1254 Sterling Pl"
    );
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.join(" ")).toMatch(/serving Apt 2R/); // not "apt 2R"
    expect(lines.join(" ")).toMatch(/removing cables/); // not "removed cables"
    expect(lines.join(" ")).toMatch(/59117-24803-6/);
  });

  it("mentions photos only when the letter carries them", () => {
    const type = LETTER_TYPES.find((t) => t.id === "load_letter");
    const withPhotos = letterInvoiceDescription(type, { _photos: [{ id: "p" }] }, "1 A St");
    const without = letterInvoiceDescription(type, {}, "1 A St");
    expect(withPhotos).toMatch(/site photographs/);
    expect(without).not.toMatch(/site photographs/);
  });

  it("falls back to sensible copy for any other letter type", () => {
    const type = LETTER_TYPES.find((t) => t.id === "general");
    const lines = linesOf(type, {}, "1 A St");
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.join(" ")).toMatch(/company letterhead/);
  });
});
