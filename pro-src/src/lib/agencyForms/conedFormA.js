/**
 * Con Edison Form A — Application for Service
 * (PSC No. 10 – Electricity; residential & nonresidential).
 *
 * SOURCE FILE (Levi 2026-07-30): BLZ company file
 *   "application-for-service.pdf" (Form A). Shipped as
 *   /forms/coned-application-for-service.pdf for reference.
 * Phase-1 fills FIRST PAGE (Part A — New Account Info) + Part E signature.
 * Parts B–D stay optional extras. Final Con Ed portal submit is HUMAN-only;
 * app emails the finished application to the office/contact (NOT Con Ed).
 */
import { buildApplicationDraft } from "./engine.js";
import { CONED_UNIT_MAX_LEN } from "./conedUnit.js";

/** Real Form A PDF packaged with the app (page-1 source). */
export const CONED_FORM_A_SOURCE_PDF = "/forms/coned-application-for-service.pdf";

/**
 * Destination for completed applications = office / contact copy only.
 * There is NO public Con Ed email intake for new applications (Dispatch research).
 * Portal submit stays a human step. Never auto-login with Levi's password.
 */
export const CONED_FORM_A_DEFAULT_EMAILS = ["office@leelectrical.us"];

/**
 * @type {import('./engine.js').AgencyConfig}
 */
export const CONED_FORM_A = {
  id: "coned-form-a",
  label: "Con Edison — Application for Service",
  description:
    "Form A (application-for-service) — fill the first page (customer + service address), sign, then email the finished application to the office. You still submit in the Con Ed portal by hand — the app never logs into Con Ed for you.",
  sourceForm: CONED_FORM_A_SOURCE_PDF,
  firstPageOnly: true,
  humanPortalSubmit: true,
  formTitle: "Con Edison Form A — Application for Service",
  submitEmailDefault: CONED_FORM_A_DEFAULT_EMAILS,
  seedFromJob(job = {}) {
    const addr = String(job.serviceAddress || job.address || job.billingAddress || "").trim();
    const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
    const line1 = parts[0] || addr;
    let city = "";
    let zip = "";
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      const zm = last.match(/\b(\d{5})(?:-\d{4})?\b/);
      if (zm) zip = zm[1];
      city = parts.length >= 3 ? parts[parts.length - 2] : parts[1].replace(/\b\d{5}(?:-\d{4})?\b/, "").trim();
    }
    const billingLine = String(job.billingAddress || job.billToAddress || line1).trim();
    const email = String(
      job.email || job.customerEmail || job.contactEmail || job.primaryEmail || ""
    ).trim();
    return {
      accountName: String(job.customer || job.customerName || job.displayName || job.personName || "").trim(),
      // Billing first (customer priority); service copies billing by default
      billingAddress: billingLine || line1,
      billingCity: city || "Brooklyn",
      billingZip: zip,
      billingUnit: String(job.billingUnit || job.apartment || job.unit || "").trim().slice(0, CONED_UNIT_MAX_LEN),
      serviceSameAsBilling: true,
      serviceAddress: line1,
      serviceCity: city || "Brooklyn",
      serviceZip: zip,
      serviceUnit: String(job.apartment || job.unit || "").trim().slice(0, CONED_UNIT_MAX_LEN),
      phone: String(job.phone || job.customerPhone || job.primaryPhone || "").trim(),
      email,
      emailFromContact: email,
      servicesRequested: ["Electric"],
      electricUse: "residence",
      mailingSame: true,
    };
  },
  steps: [
    {
      id: "part-a-account",
      title: "Part A — Account name",
      shortTitle: "Account",
      intro: "Who should the Con Ed account be under?",
      fields: [
        {
          key: "accountName",
          label: "Account / business name",
          type: "text",
          required: true,
          placeholder: "Full name or company on the bill",
          autoComplete: "organization",
        },
        {
          key: "customerType",
          label: "Customer type",
          type: "radio",
          required: true,
          options: ["Residential", "Nonresidential"],
        },
      ],
    },
    {
      id: "part-a-id",
      title: "Part A — ID",
      shortTitle: "ID",
      intro: "ID type depends on residential vs business.",
      fields: [
        {
          key: "idType",
          label: "ID type",
          type: "select",
          required: true,
          options: [
            "SSN",
            "NYS driver license",
            "ITIN",
            "IDNYC",
            "TIN / EIN (business)",
            "Other",
          ],
        },
        {
          key: "idNumber",
          label: "ID number",
          type: "text",
          required: true,
          placeholder: "As shown on the ID",
          inputMode: "text",
          autoComplete: "off",
        },
      ],
    },
    {
      id: "part-a-service-address",
      title: "Part A — Service address",
      shortTitle: "Service addr",
      intro: "Where the meter / service will be. Leave the one-tap on if it matches billing.",
      fields: [
        {
          key: "serviceAddress",
          label: "Street address",
          type: "text",
          required: true,
          when: (a) => !a.serviceSameAsBilling,
          placeholder: "Street number and name",
          autoComplete: "street-address",
        },
        {
          key: "serviceUnit",
          label: "Part Supply: Floor/Office #/Apartment #",
          type: "text",
          placeholder: "apt1, fl3, ste2 (max 6)",
          autoComplete: "address-line2",
          maxLength: CONED_UNIT_MAX_LEN,
          hint: "Exact Form A field — Con Ed rejects long unit text (~3–6 chars). First time we shorten (apartment one → apt1); if you retype, we leave it as you wrote it.",
        },
        {
          key: "serviceCity",
          label: "Town / city",
          type: "text",
          required: true,
          when: (a) => !a.serviceSameAsBilling,
          placeholder: "Brooklyn",
          autoComplete: "address-level2",
        },
        {
          key: "serviceZip",
          label: "ZIP",
          type: "text",
          required: true,
          when: (a) => !a.serviceSameAsBilling,
          placeholder: "11201",
          inputMode: "numeric",
          autoComplete: "postal-code",
        },
      ],
    },
    {
      id: "part-a-billing",
      title: "Part A — Billing address",
      shortTitle: "Billing",
      intro: "Customer billing address is the priority. One tap copies it into the service address.",
      fields: [
        {
          key: "billingAddress",
          label: "Billing street",
          type: "text",
          required: true,
          placeholder: "Where bills should go",
          autoComplete: "street-address",
        },
        {
          key: "billingUnit",
          label: "Part Supply: Floor/Office #/Apartment #",
          type: "text",
          placeholder: "apt1, fl3 (max 6)",
          maxLength: CONED_UNIT_MAX_LEN,
          hint: "Same Form A unit field as service — short form only (~3–6 chars).",
        },
        {
          key: "billingCity",
          label: "Billing city",
          type: "text",
          required: true,
          autoComplete: "address-level2",
        },
        {
          key: "billingZip",
          label: "Billing ZIP",
          type: "text",
          required: true,
          inputMode: "numeric",
          autoComplete: "postal-code",
        },
        {
          key: "serviceSameAsBilling",
          label: "Service address = billing address",
          type: "checkbox",
          hint: "One tap — copies billing into the service fields.",
        },
        {
          key: "mailingSame",
          label: "Also use billing for Con Ed bill mail",
          type: "checkbox",
        },
        {
          key: "mailingAddress",
          label: "Mailing street (if different)",
          type: "text",
          when: (a) => !a.mailingSame,
          placeholder: "If Con Ed bills go somewhere else",
        },
        {
          key: "mailingUnit",
          label: "Part Supply: Floor/Office #/Apartment #",
          type: "text",
          when: (a) => !a.mailingSame,
          placeholder: "apt1, fl3 (max 6)",
          maxLength: CONED_UNIT_MAX_LEN,
          hint: "Second Part Supply field on page 1 (mailing address) — same short-form rules.",
        },
        {
          key: "mailingCity",
          label: "Mailing city",
          type: "text",
          when: (a) => !a.mailingSame,
        },
        {
          key: "mailingZip",
          label: "Mailing ZIP",
          type: "text",
          when: (a) => !a.mailingSame,
          inputMode: "numeric",
        },
      ],
    },
    {
      id: "part-a-contact",
      title: "Part A — Contact",
      shortTitle: "Contact",
      fields: [
        {
          key: "phone",
          label: "Phone",
          type: "tel",
          required: true,
          placeholder: "Primary phone",
          inputMode: "tel",
          autoComplete: "tel",
        },
        {
          key: "phoneAlt",
          label: "Alt phone",
          type: "tel",
          inputMode: "tel",
        },
        {
          key: "fax",
          label: "Fax",
          type: "tel",
          inputMode: "tel",
        },
        {
          key: "email",
          label: "Email",
          type: "email",
          required: true,
          placeholder: "Pulled from contact — change if needed",
          inputMode: "email",
          autoComplete: "email",
          hint: "Auto-filled from the job/contact. Override anytime.",
        },
      ],
    },
    {
      id: "part-a-access",
      title: "Part A — Meter access",
      shortTitle: "Access",
      intro: "If the applicant does not control access to the meters.",
      fields: [
        {
          key: "controlsAccess",
          label: "Applicant controls access to meters",
          type: "checkbox",
        },
        {
          key: "accessContactName",
          label: "Access contact name",
          type: "text",
          when: (a) => !a.controlsAccess,
          required: true,
          placeholder: "Who can let Con Ed in",
        },
        {
          key: "accessContactPhone",
          label: "Access contact phone",
          type: "tel",
          when: (a) => !a.controlsAccess,
          required: true,
          inputMode: "tel",
        },
      ],
    },
    {
      id: "part-b-services",
      title: "Part B — Services requested",
      shortTitle: "Services",
      fields: [
        {
          key: "servicesRequested",
          label: "Service(s) requested",
          type: "checkboxes",
          options: ["Electric", "Gas"],
          hint: "Optional extra (not first page). Defaults to Electric.",
        },
        {
          key: "dateResponsible",
          label: "Date responsible for account",
          type: "date",
        },
      ],
    },
    {
      id: "part-b-use",
      title: "Part B — How the space is used",
      shortTitle: "Use",
      fields: [
        {
          key: "useMix",
          label: "Use of premises",
          type: "radio",
          options: ["Residence only", "Business only", "Mixed residence + business"],
        },
        {
          key: "percentBusiness",
          label: "Percent business use",
          type: "text",
          when: (a) => String(a.useMix || "").includes("Mixed"),
          placeholder: "e.g. 30",
          inputMode: "numeric",
          required: true,
        },
        {
          key: "electricUse",
          label: "Electric use best describes",
          type: "select",
          options: [
            "residence",
            "store",
            "office",
            "factory",
            "warehouse",
            "restaurant",
            "house of worship",
            "other",
          ],
        },
        {
          key: "electricUseOther",
          label: "Describe other use",
          type: "text",
          when: (a) => a.electricUse === "other",
          required: true,
        },
        {
          key: "hasGenerator",
          label: "Has emergency generator",
          type: "checkbox",
        },
        {
          key: "hasElectricHeat",
          label: "Has electric space heating",
          type: "checkbox",
        },
        {
          key: "hasElectricHotWater",
          label: "Has electric hot water",
          type: "checkbox",
        },
        {
          key: "wiringChanges",
          label: "Wiring changes planned",
          type: "textarea",
          placeholder: "Describe planned electrical work (or leave blank if none)",
        },
        {
          key: "publicAssembly",
          label: "Building of public assembly",
          type: "radio",
          options: ["No", "Yes"],
        },
      ],
    },
    {
      id: "part-b-gas",
      title: "Part B — Gas use",
      shortTitle: "Gas",
      intro: "Only when gas service is requested.",
      fields: [
        {
          key: "gasUse",
          label: "Primary gas use",
          type: "select",
          when: (a) => Array.isArray(a.servicesRequested) && a.servicesRequested.includes("Gas"),
          required: true,
          options: ["Cooking", "Heating", "Hot water", "Process / other"],
        },
        {
          key: "gasNotes",
          label: "Gas notes",
          type: "textarea",
          when: (a) => Array.isArray(a.servicesRequested) && a.servicesRequested.includes("Gas"),
          placeholder: "Equipment, load, special needs",
        },
      ],
    },
    {
      id: "part-c-prior",
      title: "Part C — Prior Con Ed accounts",
      shortTitle: "Prior",
      fields: [
        {
          key: "hasPriorAccount",
          label: "Has existing or prior Con Ed account",
          type: "checkbox",
        },
        {
          key: "priorAccountNumber",
          label: "Prior account number",
          type: "text",
          when: (a) => !!a.hasPriorAccount,
          placeholder: "If known",
        },
        {
          key: "priorAccountName",
          label: "Name on prior account",
          type: "text",
          when: (a) => !!a.hasPriorAccount,
        },
        {
          key: "priorAccountAddress",
          label: "Prior service address",
          type: "text",
          when: (a) => !!a.hasPriorAccount,
        },
      ],
    },
    {
      id: "part-d-tax",
      title: "Part D — Sales tax",
      shortTitle: "Tax",
      fields: [
        {
          key: "taxStatus",
          label: "Sales-tax status",
          type: "radio",
          options: ["Taxable", "Exempt"],
        },
        {
          key: "taxExemptCert",
          label: "Exemption certificate type",
          type: "text",
          when: (a) => a.taxStatus === "Exempt",
          required: true,
          placeholder: "e.g. ST-119.1, resale, religious",
        },
      ],
    },
    {
      id: "part-e-sign",
      title: "Part E — Signature",
      shortTitle: "Sign",
      intro: "Who is submitting this application.",
      fields: [
        {
          key: "submittedByName",
          label: "Submitted by (name)",
          type: "text",
          required: true,
          autoComplete: "name",
        },
        {
          key: "submittedByTitle",
          label: "Title",
          type: "text",
          placeholder: "Owner, agent, electrician…",
        },
        {
          key: "affiliation",
          label: "Affiliation",
          type: "radio",
          required: true,
          options: ["Owner", "Partner", "Agent", "Other"],
        },
        {
          key: "affiliationOther",
          label: "Affiliation (other)",
          type: "text",
          when: (a) => a.affiliation === "Other",
          required: true,
        },
        {
          key: "signatureName",
          label: "Signature (type full name)",
          type: "text",
          required: true,
          placeholder: "Types as electronic signature",
        },
        {
          key: "signatureDate",
          label: "Date",
          type: "date",
          required: true,
        },
      ],
    },
  ],
};

/** Registry of agency apps — add more agencies as configs later. */
export const AGENCY_REGISTRY = {
  "coned-form-a": CONED_FORM_A,
};

export function getAgency(id) {
  return AGENCY_REGISTRY[id] || null;
}

/** Default agency for Con Ed progress on a job. */
export function conedAgency() {
  return CONED_FORM_A;
}

/**
 * Seed or resume Con Ed application draft for a job.
 * @param {object} job
 * @param {object} [existing] prior draft from job.paperwork.coned.application
 */
export function seedConedApplication(job, existing) {
  if (existing?.answers && Object.keys(existing.answers).length) {
    return {
      ...buildApplicationDraft({
        agencyId: CONED_FORM_A.id,
        answers: existing.answers,
        status: existing.status || "draft",
        stepIndex: existing.stepIndex || 0,
        submittedAt: existing.submittedAt || "",
        emailResult: existing.emailResult || null,
      }),
      answers: { ...existing.answers },
    };
  }
  const seeded = CONED_FORM_A.seedFromJob?.(job) || {};
  if (!seeded.signatureDate) {
    seeded.signatureDate = new Date().toISOString().slice(0, 10);
  }
  if (!seeded.dateResponsible) {
    seeded.dateResponsible = new Date().toISOString().slice(0, 10);
  }
  if (seeded.mailingSame == null) seeded.mailingSame = true;
  if (seeded.serviceSameAsBilling == null) seeded.serviceSameAsBilling = true;
  if (seeded.controlsAccess == null) seeded.controlsAccess = true;
  // When service = billing, mirror billing into service fields for PDF rows
  if (seeded.serviceSameAsBilling) {
    if (seeded.billingAddress) seeded.serviceAddress = seeded.billingAddress;
    if (seeded.billingCity) seeded.serviceCity = seeded.billingCity;
    if (seeded.billingZip) seeded.serviceZip = seeded.billingZip;
    if (seeded.billingUnit != null && seeded.billingUnit !== "") seeded.serviceUnit = seeded.billingUnit;
  }
  return buildApplicationDraft({
    agencyId: CONED_FORM_A.id,
    answers: seeded,
    status: "draft",
    stepIndex: 0,
  });
}
