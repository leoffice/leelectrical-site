// Levi 2026-08-10: sending an invoice mailed ONLY the invoice PDF — the
// approved letter attached to it was silently dropped. These lock the letter
// into the SAME outgoing email, and keep letter-less sends untouched.
import { beforeEach, describe, expect, it } from "vitest";
import { LETTER_TYPES, createLetterDraft, letterAttachmentFromUpload } from "../src/lib/letterDraft.js";
import { buildEmailAttachmentParts } from "../src/lib/emailAttachments.js";
import { setActiveTenantConfig } from "../src/lib/tenantBranding.js";

const leTenant = {
  profile: {
    companyName: "BLZ Electric Inc.",
    street: "383 Kingston Ave, Suite 297",
    cityStateZip: "Brooklyn, NY 11213",
    phone: "(718) 594-1850",
    email: "Office@LeElectrical.us",
    license: "Lic #11212",
    website: "leelectrical.us",
  },
  branding: { companyName: "BLZ Electric Inc." },
  internal: true,
};

function approvedLoadLetter() {
  const type = LETTER_TYPES.find((t) => t.id === "load_letter");
  const draft = createLetterDraft({
    type,
    job: { serviceAddress: "1254 sterling pl brooklyn", customer: "Owner" },
    answers: {
      county: "Kings",
      state: "New York",
      address: "1254 sterling pl brooklyn",
      breakerRating: "40 Amp double-pole fuse per apartment",
      phaseA: "3.9",
      phaseB: "4.1",
    },
  });
  draft.status = "approved";
  return draft;
}

const b64ToText = (b64) => Buffer.from(b64, "base64").toString("latin1");

describe("letter rides with the invoice email", () => {
  beforeEach(() => setActiveTenantConfig(leTenant));

  it("produces a letter part from an attached letter", async () => {
    const draft = approvedLoadLetter();
    const att = letterAttachmentFromUpload(draft, {
      url: "https://example.test/letter.pdf",
      name: "Load_letter_1254.pdf",
    });
    const parts = await buildEmailAttachmentParts({
      attachments: [att],
      letterDrafts: [draft],
    });
    expect(parts).toHaveLength(1);
    expect(parts[0].filename).toBe("Load_letter_1254.pdf");
    const text = b64ToText(parts[0].contentB64);
    expect(text.startsWith("%PDF")).toBe(true);
    expect(text).toMatch(/LOAD LETTER/);
    expect(text).toMatch(/Levi Kumer/);
  });

  it("re-renders the letter from the draft when its upload URL is unreachable", async () => {
    const draft = approvedLoadLetter();
    const att = letterAttachmentFromUpload(draft, {
      url: "https://unreachable.invalid/gone.pdf",
      name: "Load_letter.pdf",
    });
    const parts = await buildEmailAttachmentParts({
      attachments: [att],
      letterDrafts: [draft],
    });
    // A dead upload must never cost the customer the letter.
    expect(parts).toHaveLength(1);
    expect(b64ToText(parts[0].contentB64)).toMatch(/LOAD LETTER/);
  });

  it("returns nothing when there is no letter (plain invoice send is untouched)", async () => {
    expect(await buildEmailAttachmentParts({})).toEqual([]);
    expect(await buildEmailAttachmentParts({ attachments: [], letterDrafts: [] })).toEqual([]);
  });

  it("skips attachments the user unchecked for email", async () => {
    const draft = approvedLoadLetter();
    const att = { ...letterAttachmentFromUpload(draft, { url: "u", name: "L.pdf" }), attachToEmail: false };
    expect(await buildEmailAttachmentParts({ attachments: [att], letterDrafts: [draft] })).toEqual([]);
  });
});

describe("server email payload", () => {
  it("appends extra attachments after the document PDF and de-dupes names", async () => {
    const { normalizeExtraAttachments } = await import(
      "../../netlify/functions/lib/docEmail.mjs"
    );
    const out = normalizeExtraAttachments(
      [
        { filename: "Letter.pdf", contentB64: "AAAA" },
        { filename: "Invoice-1097.pdf", contentB64: "BBBB" }, // collides with the doc
        { filename: "noext", contentB64: "CCCC" },
        { filename: "empty.pdf", contentB64: "" }, // dropped
      ],
      "Invoice-1097.pdf"
    );
    expect(out.map((a) => a.filename)).toEqual([
      "Letter.pdf",
      "Invoice-1097 (2).pdf",
      "noext.pdf",
    ]);
  });

  it("is a no-op for sends without extras", async () => {
    const { normalizeExtraAttachments } = await import(
      "../../netlify/functions/lib/docEmail.mjs"
    );
    expect(normalizeExtraAttachments([], "Invoice-1.pdf")).toEqual([]);
    expect(normalizeExtraAttachments(undefined, "Invoice-1.pdf")).toEqual([]);
  });
});
