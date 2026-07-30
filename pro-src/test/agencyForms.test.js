import { describe, it, expect } from "vitest";
import {
  CONED_FORM_A,
  applicationReady,
  applicationFieldRows,
  incompleteSteps,
  missingRequired,
  seedConedApplication,
  visibleFields,
  resolveSubmitEmails,
  buildApplicationEmailHtml,
  buildApplicationEmailText,
  buildApplicationPdfBytes,
  buildApplicationDraft,
  toggleMulti,
} from "../src/lib/agencyForms/index.js";

describe("agency form engine", () => {
  it("registers Con Ed Form A with Parts A–E style steps", () => {
    expect(CONED_FORM_A.id).toBe("coned-form-a");
    expect(CONED_FORM_A.steps.length).toBeGreaterThanOrEqual(10);
    const titles = CONED_FORM_A.steps.map((s) => s.title).join(" ");
    expect(titles).toMatch(/Part A/i);
    expect(titles).toMatch(/Part B/i);
    expect(titles).toMatch(/Part C/i);
    expect(titles).toMatch(/Part D/i);
    expect(titles).toMatch(/Part E/i);
  });

  it("hides gas fields unless Gas is selected", () => {
    const gasStep = CONED_FORM_A.steps.find((s) => s.id === "part-b-gas");
    expect(visibleFields(gasStep, { servicesRequested: ["Electric"] })).toHaveLength(0);
    expect(visibleFields(gasStep, { servicesRequested: ["Electric", "Gas"] }).length).toBeGreaterThan(0);
  });

  it("hides mailing address when same as service", () => {
    const step = CONED_FORM_A.steps.find((s) => s.id === "part-a-mailing");
    const hidden = visibleFields(step, { mailingSame: true });
    expect(hidden.every((f) => f.key === "mailingSame")).toBe(true);
    const shown = visibleFields(step, { mailingSame: false });
    expect(shown.some((f) => f.key === "mailingAddress")).toBe(true);
  });

  it("toggleMulti updates checkbox groups", () => {
    const a = toggleMulti({}, "servicesRequested", "Electric", true);
    const b = toggleMulti(a, "servicesRequested", "Gas", true);
    expect(b.servicesRequested).toEqual(["Electric", "Gas"]);
    const c = toggleMulti(b, "servicesRequested", "Electric", false);
    expect(c.servicesRequested).toEqual(["Gas"]);
  });

  it("seeds from job and marks incomplete until required filled", () => {
    const draft = seedConedApplication({
      customer: "Test Owner",
      serviceAddress: "123 Main St, Brooklyn, NY 11201",
      phone: "7185551212",
      email: "owner@example.com",
    });
    expect(draft.answers.accountName).toBe("Test Owner");
    expect(draft.answers.serviceAddress).toMatch(/123 Main/);
    expect(applicationReady(CONED_FORM_A, draft.answers)).toBe(false);
    expect(incompleteSteps(CONED_FORM_A, draft.answers).length).toBeGreaterThan(0);
  });

  it("applicationReady when all required answered", () => {
    const answers = {
      accountName: "Jane Doe",
      customerType: "Residential",
      idType: "SSN",
      idNumber: "xxx",
      serviceAddress: "1 Test St",
      serviceCity: "Brooklyn",
      serviceZip: "11201",
      mailingSame: true,
      phone: "7185550000",
      email: "j@example.com",
      controlsAccess: true,
      servicesRequested: ["Electric"],
      dateResponsible: "2026-07-30",
      useMix: "Residence only",
      electricUse: "residence",
      publicAssembly: "No",
      taxStatus: "Taxable",
      submittedByName: "Jane Doe",
      affiliation: "Owner",
      signatureName: "Jane Doe",
      signatureDate: "2026-07-30",
    };
    expect(missingRequired(CONED_FORM_A.steps[0], answers)).toEqual([]);
    expect(applicationReady(CONED_FORM_A, answers)).toBe(true);
    const rows = applicationFieldRows(CONED_FORM_A, answers);
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.some((r) => r.key === "accountName" && r.value === "Jane Doe")).toBe(true);
  });

  it("resolveSubmitEmails defaults to office copy", () => {
    const emails = resolveSubmitEmails(CONED_FORM_A);
    expect(emails[0]).toMatch(/office@leelectrical\.us/i);
    expect(resolveSubmitEmails(CONED_FORM_A, "a@x.com, b@y.com")).toEqual(["a@x.com", "b@y.com"]);
  });

  it("builds full email html + text (not a stub)", () => {
    const answers = { accountName: "Acme", customerType: "Nonresidential", phone: "1", email: "a@b.c" };
    // partial is fine for content shape
    const html = buildApplicationEmailHtml(CONED_FORM_A, answers, { customer: "Acme" });
    expect(html).toMatch(/Account/);
    expect(html).toMatch(/Acme/);
    const text = buildApplicationEmailText(CONED_FORM_A, answers, {});
    expect(text).toMatch(/Acme/);
  });

  it("builds a real PDF starting with %PDF", () => {
    const answers = {
      accountName: "PDF Test",
      customerType: "Residential",
      phone: "718",
      email: "p@t.com",
    };
    const bytes = buildApplicationPdfBytes({
      agency: CONED_FORM_A,
      answers,
      job: { customer: "PDF Test", serviceAddress: "9 Test Ave" },
    });
    const head = String.fromCharCode(...bytes.slice(0, 4));
    expect(head).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(500);
  });

  it("buildApplicationDraft stores status + agency", () => {
    const d = buildApplicationDraft({ agencyId: "coned-form-a", answers: { a: 1 }, status: "draft" });
    expect(d.agencyId).toBe("coned-form-a");
    expect(d.status).toBe("draft");
    expect(d.answers.a).toBe(1);
  });
});

describe("paperwork Con Edison progress label", () => {
  it("uses Con Edison progress toggle name", async () => {
    const { PAPER } = await import("../src/lib/paperwork.js");
    expect(PAPER.coned.nm).toMatch(/Con Edison progress/);
  });
});
