// Work Confirmation / Compliance letter (Levi 2026-08-12) — modeled on the
// 73-75 Grand Ave exit-sign insurance letter. Locks: product match, the
// notes→letter body, work-description autofill from the job, and the PDF.
import { beforeEach, describe, expect, it } from "vitest";
import {
  LETTER_TYPES,
  buildLetterBody,
  createLetterDraft,
  letterDraftReady,
  letterInvoiceDescription,
  matchLetterType,
  seedLetterAnswersFromJob,
} from "../src/lib/letterDraft.js";
import { jobWorkDescriptionSeed } from "../src/lib/letterTypes.js";
import { buildLetterheadPdf } from "../src/lib/letterheadPdf.js";
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

const TYPE = () => LETTER_TYPES.find((t) => t.id === "work_confirmation");

const grandJob = {
  customer: "The Grand 73 LLC",
  businessName: "The Grand 73 LLC",
  serviceAddress: "73-75 Grand Ave, Brooklyn, NY 11205",
  invoiceLines: [
    {
      itemName: "Service call",
      description:
        "Installed a new illuminated exit sign with battery backup above the rear exit door",
    },
    { itemName: "Compliance letter", description: "Work confirmation letter" },
  ],
};

describe("work confirmation type registry", () => {
  it("matches compliance / work-confirmation product names", () => {
    expect(matchLetterType("Work Confirmation Letter")?.id).toBe("work_confirmation");
    expect(matchLetterType("Compliance letter")?.id).toBe("work_confirmation");
    expect(matchLetterType("Confirmation of Completed Work")?.id).toBe("work_confirmation");
    // More specific existing types still win.
    expect(matchLetterType("Code compliance report")?.id).toBe("code_compliance_safety_report");
    expect(matchLetterType("Load Letter")?.id).toBe("load_letter");
  });

  it("is registered with photos enabled and the compliance fields", () => {
    const t = TYPE();
    expect(t).toBeTruthy();
    expect(t.photoSlots).toBe("optional-multi");
    const keys = t.fields.map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "address",
        "insured",
        "policyNumber",
        "recommendationRef",
        "workDate",
        "workDescription",
      ])
    );
  });
});

describe("work description autofill from the job", () => {
  it("seeds from invoice line descriptions, skipping the letter line itself", () => {
    const seed = jobWorkDescriptionSeed(grandJob);
    expect(seed).toMatch(/illuminated exit sign/i);
    expect(seed).not.toMatch(/Work confirmation letter/i);
  });

  it("falls back to the job title when no lines exist", () => {
    expect(jobWorkDescriptionSeed({ title: "Exit sign install" })).toBe("Exit sign install");
  });

  it("seedLetterAnswersFromJob fills workDescription, insured, and address", () => {
    const answers = seedLetterAnswersFromJob(grandJob, TYPE(), leTenant.profile);
    expect(answers.workDescription).toMatch(/illuminated exit sign/i);
    expect(answers.insured).toBe("The Grand 73 LLC");
    expect(answers.address).toMatch(/73-75 Grand Ave/);
  });
});

describe("work confirmation letter body", () => {
  beforeEach(() => setActiveTenantConfig(leTenant));

  const answers = {
    address: "73-75 Grand Ave, Brooklyn, NY 11205",
    insured: "The Grand 73 LLC",
    policyNumber: "O1017PK000607-00",
    recommendationRef: "Loss Control Recommendation #1",
    workDate: "2026-08-11",
    workDescription:
      "installed a new illuminated exit sign with battery backup above the rear exit door\nhardwired to the building's electrical system",
  };

  it("builds the confirmation body from the questionnaire notes", () => {
    const body = buildLetterBody(TYPE(), answers, grandJob);
    expect(body).toMatch(/We hereby confirm/);
    expect(body).toMatch(/73-75 Grand Ave/);
    expect(body).toMatch(/for the insured, The Grand 73 LLC/);
    expect(body).toMatch(/Loss Control Recommendation #1/);
    expect(body).toMatch(/under policy O1017PK000607-00/);
    expect(body).toMatch(/Scope of completed work:/);
    expect(body).toMatch(/Installed a new illuminated exit sign/);
    expect(body).toMatch(/on August 11, 2026/);
    expect(body).toMatch(/professional and workmanlike manner/);
  });

  it("optional policy / recommendation / date stay out when blank", () => {
    const body = buildLetterBody(
      TYPE(),
      { ...answers, policyNumber: "", recommendationRef: "", workDate: "" },
      grandJob
    );
    expect(body).not.toMatch(/policy/i);
    expect(body).not.toMatch(/Recommendation/);
    expect(body).toMatch(/The work was completed by our licensed electricians/);
  });

  it("adds the photo reference when photos are attached", () => {
    const body = buildLetterBody(TYPE(), answers, grandJob, {
      photos: [{ id: "p1", name: "exit-sign.jpg", url: "u" }],
    });
    expect(body).toMatch(/Review attached photos\./);
  });

  it("draft from job is approvable once required fields are present", () => {
    const d = createLetterDraft({ type: TYPE(), job: grandJob });
    expect(d.reLine).toMatch(/73-75 Grand Ave/);
    expect(letterDraftReady(d)).toBe(true);
  });

  it("invoice line description says what the price covers", () => {
    const desc = letterInvoiceDescription(TYPE(), answers, answers.address);
    const lines = desc.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(desc).toMatch(/compliance letter/i);
    expect(desc).toMatch(/insurance policy and recommendation references/);
  });
});

describe("work confirmation letterhead PDF", () => {
  beforeEach(() => setActiveTenantConfig(leTenant));

  it("renders the approved heading, meta lines, and signature", () => {
    const draft = createLetterDraft({
      type: TYPE(),
      job: grandJob,
      answers: {
        address: "73-75 Grand Ave, Brooklyn, NY 11205",
        insured: "The Grand 73 LLC",
        policyNumber: "O1017PK000607-00",
        recommendationRef: "Loss Control Recommendation #1",
        workDate: "2026-08-11",
        workDescription: "installed a new illuminated exit sign with battery backup",
      },
    });
    draft.status = "approved";
    const bytes = buildLetterheadPdf({ draft });
    const text = Buffer.from(bytes).toString("latin1");
    expect(text.startsWith("%PDF")).toBe(true);
    expect(text).toMatch(/WORK CONFIRMATION/);
    expect(text).toMatch(/CONFIRMATION OF COMPLETED WORK/);
    expect(text).toMatch(/Insured:/);
    expect(text).toMatch(/The Grand 73 LLC/);
    expect(text).toMatch(/Policy #:/);
    expect(text).toMatch(/O1017PK000607-00/);
    expect(text).not.toMatch(/DRAFT/);
  });
});
