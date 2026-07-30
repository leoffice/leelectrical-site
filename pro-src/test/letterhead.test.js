import { describe, expect, it } from "vitest";
import {
  LETTER_TYPES,
  buildLetterBody,
  createLetterDraft,
  isLetterProduct,
  letterDraftReady,
  letterLineDescription,
  matchLetterType,
  refreshLetterDraft,
} from "../src/lib/letterDraft.js";
import {
  buildLetterheadPdf,
  buildLetterheadPdfBlob,
  letterPdfFileName,
} from "../src/lib/letterheadPdf.js";
import { setActiveTenantConfig } from "../src/lib/tenantBranding.js";

describe("letter product match", () => {
  it("detects Load Letter catalog item", () => {
    expect(isLetterProduct("7 Plans and Permits:Load Letter")).toBe(true);
    expect(matchLetterType("7 Plans and Permits:Load Letter")?.id).toBe("load_letter");
  });

  it("detects grounded letter types from product names", () => {
    expect(matchLetterType("Equipment safety check")?.id).toBe("equipment_safety_inspection");
    expect(matchLetterType("Shared meter affidavit")?.id).toBe("shared_meter_affidavit");
    expect(matchLetterType("Owner inspection request")?.id).toBe("owner_inspection_request");
    expect(matchLetterType("Good standing letter")?.id).toBe("good_standing_request");
  });

  it("does not treat normal services as letters", () => {
    expect(isLetterProduct("Service call:Service call")).toBe(false);
    expect(isLetterProduct("Tesla Charger:Tesla Charger")).toBe(false);
  });
});

describe("letter draft body", () => {
  const job = {
    customer: "Test Customer",
    serviceAddress: "100 Main St, Brooklyn, NY",
    apartment: "2B",
  };

  it("builds load letter body from answers (amp-probe sample style)", () => {
    const type = LETTER_TYPES.find((t) => t.id === "load_letter");
    const body = buildLetterBody(
      type,
      {
        county: "Brooklyn",
        state: "New York",
        address: "100 Main St, Brooklyn, NY",
        breakerRating: "40Amp double pole fuse per apartment",
        phaseA: "3.72",
        phaseB: "3.98",
        capacityPct: "10%–12%",
      },
      job
    );
    expect(body).toMatch(/100 Main St/);
    expect(body).toMatch(/3\.72/);
    expect(body).toMatch(/40Amp/);
    expect(body).toMatch(/10%/);
  });

  it("createLetterDraft seeds site + RE line", () => {
    const type = LETTER_TYPES.find((t) => t.id === "load_letter");
    const d = createLetterDraft({
      type,
      job,
      lineIndex: 0,
      itemName: "7 Plans and Permits:Load Letter",
      answers: {
        county: "Kings",
        state: "New York",
        address: "100 Main St, Brooklyn, NY",
        breakerRating: "200 A",
        phaseA: "10",
        phaseB: "12",
      },
    });
    expect(d.status).toBe("draft");
    expect(d.siteAddress).toMatch(/100 Main St/);
    expect(d.reLine).toMatch(/Load letter/i);
    expect(letterDraftReady(d)).toBe(true);
  });

  it("letterLineDescription summarizes for invoice line", () => {
    const type = LETTER_TYPES.find((t) => t.id === "load_letter");
    const desc = letterLineDescription(
      type,
      { existingService: "200 A", proposedWork: "EVSE" },
      "100 Main St"
    );
    expect(desc).toMatch(/Load letter/);
    expect(desc).toMatch(/100 Main St/);
  });

  it("refreshLetterDraft rebuilds body", () => {
    const type = LETTER_TYPES.find((t) => t.id === "safety");
    let d = createLetterDraft({ type, job, answers: { recipient: "Insurer", scope: "Panel", findings: "OK" } });
    d = refreshLetterDraft(d, {
      answers: { ...d.answers, conclusion: "Cleared." },
      status: "approved",
      job,
    });
    expect(d.status).toBe("approved");
    expect(d.bodyText).toMatch(/Cleared/);
  });
});

describe("letterhead PDF", () => {
  it("emits a valid PDF with company letterhead", () => {
    setActiveTenantConfig({
      profile: {
        companyName: "BLZ Electric Inc.",
        street: "123 Test Ave",
        cityStateZip: "Brooklyn, NY 11213",
        phone: "718-555-0100",
        email: "office@test.com",
        license: "LIC-99",
      },
      branding: { companyName: "BLZ Electric Inc." },
      internal: true,
    });
    const type = LETTER_TYPES.find((t) => t.id === "load_letter");
    const draft = createLetterDraft({
      type,
      job: { serviceAddress: "50 Oak Rd", customer: "Acme" },
      answers: {
        recipient: "AHJ",
        existingService: "100 A",
        proposedWork: "New branch",
        conclusion: "OK",
      },
    });
    draft.status = "approved";
    const bytes = buildLetterheadPdf({ draft });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(500);
    const head = String.fromCharCode(...bytes.slice(0, 8));
    expect(head.startsWith("%PDF")).toBe(true);
    const blob = buildLetterheadPdfBlob({ draft });
    expect(blob.type).toBe("application/pdf");
    expect(letterPdfFileName(draft)).toMatch(/Load_letter/i);
  });

  it("marks DRAFT on unapproved letters", () => {
    const type = LETTER_TYPES.find((t) => t.id === "general");
    const draft = createLetterDraft({
      type,
      job: { serviceAddress: "1 A St" },
      answers: { recipient: "Board", body: "Hello from the field." },
    });
    const bytes = buildLetterheadPdf({ draft });
    // PDF content is latin1 text ops — DRAFT should appear in stream
    let asText = "";
    for (let i = 0; i < bytes.length; i++) asText += String.fromCharCode(bytes[i]);
    expect(asText).toMatch(/DRAFT/);
  });
});
