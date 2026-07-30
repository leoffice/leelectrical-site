import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  CONED_FORM_A,
  CONED_FORM_A_PAGE1_FIELDS,
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
  buildApplicationPdfBytesAsync,
  buildApplicationDraft,
  toggleMulti,
  resolveConedPage1Values,
  fillConedFormAPdfBytes,
  clampConedUnit,
} from "../src/lib/agencyForms/index.js";

/** Inject packaged Form A bytes so fill runs offline under vitest (no public server). */
beforeAll(() => {
  const candidates = [
    join(process.cwd(), "public/forms/coned-application-for-service.pdf"),
    join(process.cwd(), "src/lib/agencyForms/assets/coned-application-for-service.pdf"),
    join(process.cwd(), "pro-src/public/forms/coned-application-for-service.pdf"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      globalThis.__CONED_FORM_A_PDF_BYTES__ = new Uint8Array(readFileSync(p));
      return;
    }
  }
  throw new Error("Test setup: packaged coned-application-for-service.pdf not found");
});

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

  it("billing step has service=billing one-tap and hides extra mailing when same", () => {
    const step = CONED_FORM_A.steps.find((s) => s.id === "part-a-billing");
    expect(step).toBeTruthy();
    const keys = visibleFields(step, { serviceSameAsBilling: true, mailingSame: true }).map((f) => f.key);
    expect(keys).toContain("serviceSameAsBilling");
    expect(keys).toContain("billingAddress");
    expect(keys).not.toContain("mailingAddress");
    const shown = visibleFields(step, { mailingSame: false });
    expect(shown.some((f) => f.key === "mailingAddress")).toBe(true);
    expect(shown.some((f) => f.key === "mailingUnit")).toBe(true);
  });

  it("points at the real Form A source and office-only submit", () => {
    expect(String(CONED_FORM_A.sourceForm || "")).toMatch(/coned-application-for-service/);
    expect(CONED_FORM_A.humanPortalSubmit).toBe(true);
    expect(CONED_FORM_A.firstPageOnly).toBe(true);
  });

  it("labels unit fields with exact Form A Part Supply wording", () => {
    const labels = CONED_FORM_A.steps.flatMap((s) => s.fields.map((f) => f.label)).join(" | ");
    expect(labels).toMatch(/Part Supply: Floor\/Office #\/Apartment #/);
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

  it("applicationReady when required Part A + Part E answered", () => {
    const answers = {
      accountName: "Jane Doe",
      customerType: "Residential",
      idType: "SSN",
      idNumber: "xxx",
      billingAddress: "1 Test St",
      billingCity: "Brooklyn",
      billingZip: "11201",
      serviceSameAsBilling: true,
      serviceAddress: "1 Test St",
      serviceCity: "Brooklyn",
      serviceZip: "11201",
      mailingSame: true,
      phone: "7185550000",
      email: "j@example.com",
      controlsAccess: true,
      servicesRequested: ["Electric"],
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
    const html = buildApplicationEmailHtml(CONED_FORM_A, answers, { customer: "Acme" });
    expect(html).toMatch(/Account/);
    expect(html).toMatch(/Acme/);
    const text = buildApplicationEmailText(CONED_FORM_A, answers, {});
    expect(text).toMatch(/Acme/);
  });

  it("builds a real PDF starting with %PDF (field dump fallback)", () => {
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

describe("Con Ed Form A real PDF fill (page 1 AcroForm)", () => {
  it("maps answers onto exact page-1 field names including both Part Supply units", () => {
    const values = resolveConedPage1Values({
      accountName: "Levi K",
      customerType: "Residential",
      billingAddress: "100 Billing Ave",
      billingUnit: "apt1",
      billingCity: "Brooklyn",
      billingZip: "11230",
      serviceSameAsBilling: false,
      serviceAddress: "200 Service St",
      serviceUnit: "fl3",
      serviceCity: "Brooklyn",
      serviceZip: "11218",
      mailingSame: true,
      phone: "7185551212",
      email: "office@leelectrical.us",
      controlsAccess: true,
    });
    expect(values[CONED_FORM_A_PAGE1_FIELDS.accountName]).toBe("Levi K");
    expect(values[CONED_FORM_A_PAGE1_FIELDS.serviceAddress]).toBe("200 Service St");
    expect(values[CONED_FORM_A_PAGE1_FIELDS.serviceUnit]).toBe("fl3");
    // mailingSame + billing differs from service → billing fills mailing block
    expect(values[CONED_FORM_A_PAGE1_FIELDS.mailingAddress]).toBe("100 Billing Ave");
    expect(values[CONED_FORM_A_PAGE1_FIELDS.mailingUnit]).toBe("apt1");
    expect(values[CONED_FORM_A_PAGE1_FIELDS.email]).toMatch(/office@/);
  });

  it("leaves mailing blank when service equals billing and mailingSame", () => {
    const values = resolveConedPage1Values({
      accountName: "Same Place",
      billingAddress: "1 One St",
      billingUnit: "u1",
      billingCity: "Brooklyn",
      billingZip: "11201",
      serviceSameAsBilling: true,
      mailingSame: true,
      phone: "1",
      email: "a@b.c",
      controlsAccess: true,
    });
    expect(values[CONED_FORM_A_PAGE1_FIELDS.serviceAddress]).toBe("1 One St");
    expect(values[CONED_FORM_A_PAGE1_FIELDS.mailingAddress]).toBeUndefined();
    expect(values[CONED_FORM_A_PAGE1_FIELDS.mailingUnit]).toBeUndefined();
  });

  it("clamps both Part Supply unit fields", () => {
    expect(clampConedUnit("apartment one").length).toBeLessThanOrEqual(6);
    const values = resolveConedPage1Values({
      accountName: "X",
      serviceSameAsBilling: false,
      serviceAddress: "S",
      serviceUnit: "verylongunittext",
      serviceCity: "B",
      serviceZip: "1",
      billingAddress: "B",
      billingUnit: "anotherlongunit",
      billingCity: "B",
      billingZip: "1",
      mailingSame: false,
      mailingAddress: "M",
      mailingUnit: "mailinglongunit",
      mailingCity: "B",
      mailingZip: "1",
    });
    expect(values[CONED_FORM_A_PAGE1_FIELDS.serviceUnit].length).toBeLessThanOrEqual(6);
    expect(values[CONED_FORM_A_PAGE1_FIELDS.mailingUnit].length).toBeLessThanOrEqual(6);
  });

  it("fills the official source PDF and keeps %PDF + filled field values", async () => {
    const answers = {
      accountName: "Fill Test LLC",
      customerType: "Nonresidential",
      billingAddress: "50 Office Plaza",
      billingUnit: "ofc2",
      billingCity: "Brooklyn",
      billingZip: "11201",
      serviceSameAsBilling: true,
      mailingSame: true,
      phone: "7185559999",
      email: "fill@test.example",
      controlsAccess: true,
    };
    const bytes = await fillConedFormAPdfBytes({ answers });
    const head = String.fromCharCode(...bytes.slice(0, 4));
    expect(head).toBe("%PDF");
    // Official form is ~446k; filled should stay in the same ballpark
    expect(bytes.length).toBeGreaterThan(100000);

    // Round-trip: re-open with pdf-lib and confirm field values
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes);
    const form = doc.getForm();
    expect(form.getTextField(CONED_FORM_A_PAGE1_FIELDS.accountName).getText()).toBe("Fill Test LLC");
    expect(form.getTextField(CONED_FORM_A_PAGE1_FIELDS.serviceAddress).getText()).toBe("50 Office Plaza");
    expect(form.getTextField(CONED_FORM_A_PAGE1_FIELDS.serviceUnit).getText()).toBe("ofc2");
    expect(form.getTextField(CONED_FORM_A_PAGE1_FIELDS.email).getText()).toBe("fill@test.example");
  }, 20000);

  it("buildApplicationPdfBytesAsync returns filled Form A for coned-form-a", async () => {
    const bytes = await buildApplicationPdfBytesAsync({
      agency: CONED_FORM_A,
      answers: {
        accountName: "Async Fill",
        billingAddress: "9 Ave",
        billingCity: "Brooklyn",
        billingZip: "11211",
        serviceSameAsBilling: true,
        mailingSame: true,
        phone: "1",
        email: "a@b.c",
      },
    });
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(100000);
  }, 20000);
});

describe("paperwork Con Edison progress label", () => {
  it("uses Con Edison progress toggle name", async () => {
    const { PAPER } = await import("../src/lib/paperwork.js");
    expect(PAPER.coned.nm).toMatch(/Con Edison progress/);
  });
});
