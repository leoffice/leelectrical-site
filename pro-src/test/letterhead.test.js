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
    // Approved letterhead: Re: line is the site address for load letters.
    expect(d.reLine).toMatch(/100 Main St/);
    expect(letterDraftReady(d)).toBe(true);
  });

  it("auto-computes % of capacity from amps vs breaker rating (9%–11% sample)", () => {
    const type = LETTER_TYPES.find((t) => t.id === "load_letter");
    const body = buildLetterBody(
      type,
      {
        address: "1254 Sterling Place, Brooklyn, NY 11213",
        breakerRating: "40 Amp double-pole fuse per apartment",
        phaseA: "3.9",
        phaseB: "4.1",
        applianceList: "overhead lighting, table and floor lamps, refrigerators",
      },
      job
    );
    expect(body).toMatch(/9%–11%/);
    expect(body).toMatch(/3\.9 amps on Phase A/);
    expect(body).toMatch(/4\.1 amps on Phase B/);
    expect(body).toMatch(/40 Amp fuse is therefore sufficient/);
    expect(body).toMatch(/arcing, corrosion, and other potential fire hazards/);
  });

  it("equipment safety notes normalize into report language", () => {
    const type = LETTER_TYPES.find((t) => t.id === "equipment_safety_inspection");
    const body = buildLetterBody(
      type,
      {
        address: "1254 Sterling Place, Brooklyn, NY 11213",
        equipment: "main metering equipment and the associated service panel",
        methods: "visual, operational test, checked integrity, grounding/bonding",
        findings: "safe, working fine, no immediate hazards",
        notFound: "no arcing, no corrosion, burnt parts, exposed live wiring",
        condition: "older equipment, normal wear, doesn't affect safety",
        necConcern: "grounding busbar accessible per NEC 250.68 and 250.64(B)",
        purpose: "insurance",
        recommendations: "nothing urgent, monitor periodically",
      },
      job
    );
    expect(body).toMatch(/a visual examination, operational testing, verification of electrical integrity, and verification of the grounding and bonding connections/);
    expect(body).toMatch(/safe working condition with no immediate hazards observed/);
    expect(body).toMatch(/No arcing, corrosion, overheating or burnt components, or exposed live wiring was observed/);
    expect(body).toMatch(/normal wear is present but does not compromise safety/);
    expect(body).toMatch(/NEC 250\.68 and 250\.64\(B\)/);
    expect(body).toMatch(/periodic monitoring of the equipment is recommended/);
    expect(body).toMatch(/provided for insurance purposes/);
  });

  it("shared meter notes normalize into affidavit language", () => {
    const type = LETTER_TYPES.find((t) => t.id === "shared_meter_affidavit");
    const body = buildLetterBody(
      type,
      {
        address: "1254 Sterling Place, Brooklyn, NY 11213",
        unit: "Apt 2R",
        accountNumber: "59117-24803-6",
        corrective: "Removed cables incorrectly connected to / running through this meter",
      },
      job
    );
    expect(body).toMatch(/We hereby affirm that, as a licensed electrician/);
    expect(body).toMatch(/We removed cables that were incorrectly connected to and running through this meter, which is assigned to Apt 2R\./);
    expect(body).toMatch(/no other devices, common areas, neighboring units, or extraneous loads/);
    expect(body).toMatch(/shared meter condition has been resolved/);
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

  it("signer line is always on — name + President credentials (approved 2026-08-10)", () => {
    setActiveTenantConfig({
      profile: {
        companyName: "BLZ Electric Inc.",
        shortName: "BLZ Electric",
        street: "123 Test Ave",
        cityStateZip: "Brooklyn, NY 11213",
        phone: "718-555-0100",
        email: "office@test.com",
        license: "LIC-99",
        letterSignatureMode: "company",
        defaultSignerName: "Levi Kumer",
        defaultSignerTitle: "President",
        owners: [{ id: "o1", fullName: "Levi Kumer", title: "President", isDefaultSigner: true }],
      },
      branding: { companyName: "BLZ Electric Inc." },
      internal: true,
    });
    const type = LETTER_TYPES.find((t) => t.id === "general");
    const draft = createLetterDraft({
      type,
      job: { serviceAddress: "1 A St" },
      answers: { recipient: "Board", body: "Hello from the field." },
    });
    draft.status = "approved";
    const bytes = buildLetterheadPdf({ draft });
    let asText = "";
    for (let i = 0; i < bytes.length; i++) asText += String.fromCharCode(bytes[i]);
    // Even in legacy "company" signature mode the signer line stays on.
    expect(asText).toMatch(/Levi Kumer/);
    expect(asText).toMatch(/President/);
    expect(asText).toMatch(/BLZ Electric/);
  });

  it("embeds the real LE signature image for the LE tenant", () => {
    setActiveTenantConfig({
      profile: {
        companyName: "BLZ Electric Inc.",
        street: "383 Kingston Ave, Suite 297",
        cityStateZip: "Brooklyn, NY 11213",
        phone: "(718) 594-1850",
        email: "Office@LeElectrical.us",
        license: "11212",
        website: "leelectrical.us",
        owners: [{ id: "o1", fullName: "Levi Kumer", title: "President", isDefaultSigner: true }],
      },
      branding: { companyName: "BLZ Electric Inc." },
      internal: true,
    });
    const type = LETTER_TYPES.find((t) => t.id === "load_letter");
    const draft = createLetterDraft({
      type,
      job: { serviceAddress: "1254 Sterling Place, Brooklyn, NY 11213", customer: "Owner" },
      answers: {
        county: "Kings",
        state: "New York",
        address: "1254 Sterling Place, Brooklyn, NY 11213",
        breakerRating: "40 Amp double-pole fuse per apartment",
        phaseA: "3.9",
        phaseB: "4.1",
      },
    });
    draft.status = "approved";
    const bytes = buildLetterheadPdf({ draft });
    let asText = "";
    for (let i = 0; i < bytes.length; i++) asText += String.fromCharCode(bytes[i]);
    // Signature image XObject present + referenced, signer line on, footer band.
    expect(asText).toMatch(/\/ImSig/);
    expect(asText).toMatch(/Levi Kumer/);
    expect(asText).toMatch(/LOAD LETTER/);
    expect(asText).toMatch(/License #11212/);
    // Two DCT images: logo + signature.
    expect(asText.match(/DCTDecode/g)?.length).toBe(2);
  });

  it("never prints the LE signature for a non-LE tenant without one registered", () => {
    setActiveTenantConfig({
      tenantId: "demo",
      profile: {
        companyName: "Ace Plumbing Co.",
        street: "1 Demo Way",
        cityStateZip: "Brooklyn, NY 11213",
        phone: "718-555-0100",
        email: "office@aceplumbing.example",
        license: "PL-1",
        owners: [{ id: "o1", fullName: "Pat Ace", title: "Owner", isDefaultSigner: true }],
      },
      branding: { companyName: "Ace Plumbing Co." },
      internal: false,
    });
    const type = LETTER_TYPES.find((t) => t.id === "general");
    const draft = createLetterDraft({
      type,
      job: { serviceAddress: "1 A St" },
      answers: { recipient: "Board", body: "Hello." },
    });
    draft.status = "approved";
    const bytes = buildLetterheadPdf({ draft });
    let asText = "";
    for (let i = 0; i < bytes.length; i++) asText += String.fromCharCode(bytes[i]);
    expect(asText).not.toMatch(/\/ImSig/);
    expect(asText).toMatch(/Pat Ace/);
  });
});
