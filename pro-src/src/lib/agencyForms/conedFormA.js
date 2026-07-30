/**
 * Con Edison Form A — Application for Service
 * (PSC No. 10 – Electricity; residential & nonresidential).
 * Modeled for LE Pro meter application intake. Field list can be tightened
 * when Levi drops the exact PDF he wants mirrored.
 */
import { buildApplicationDraft } from "./engine.js";

/** Default LE office copy until Levi confirms Con Ed intake address. */
export const CONED_FORM_A_DEFAULT_EMAILS = ["office@leelectrical.us"];

/**
 * @type {import('./engine.js').AgencyConfig}
 */
export const CONED_FORM_A = {
  id: "coned-form-a",
  label: "Con Edison — Application for Service",
  description:
    "Form A application for new electric (and optional gas) service. Fill on phone or desktop; we email the full application on submit.",
  formTitle: "Con Edison Form A — Application for Service",
  submitEmailDefault: CONED_FORM_A_DEFAULT_EMAILS,
  seedFromJob(job = {}) {
    const addr = String(job.serviceAddress || job.address || "").trim();
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
    return {
      accountName: String(job.customer || job.customerName || job.displayName || "").trim(),
      serviceAddress: line1,
      serviceCity: city || "Brooklyn",
      serviceZip: zip,
      phone: String(job.phone || job.customerPhone || "").trim(),
      email: String(job.email || job.customerEmail || "").trim(),
      servicesRequested: ["Electric"],
      electricUse: "residence",
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
      intro: "Where the meter / service will be.",
      fields: [
        {
          key: "serviceAddress",
          label: "Street address",
          type: "text",
          required: true,
          placeholder: "Street number and name",
          autoComplete: "street-address",
        },
        {
          key: "serviceUnit",
          label: "Room / floor / apt",
          type: "text",
          placeholder: "Apt, suite, floor",
          autoComplete: "address-line2",
        },
        {
          key: "serviceCity",
          label: "Town / city",
          type: "text",
          required: true,
          placeholder: "Brooklyn",
          autoComplete: "address-level2",
        },
        {
          key: "serviceZip",
          label: "ZIP",
          type: "text",
          required: true,
          placeholder: "11201",
          inputMode: "numeric",
          autoComplete: "postal-code",
        },
      ],
    },
    {
      id: "part-a-mailing",
      title: "Part A — Mailing address",
      shortTitle: "Mailing",
      fields: [
        {
          key: "mailingSame",
          label: "Mailing address same as service",
          type: "checkbox",
        },
        {
          key: "mailingAddress",
          label: "Mailing street",
          type: "text",
          when: (a) => !a.mailingSame,
          placeholder: "If different from service",
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
          placeholder: "name@example.com",
          inputMode: "email",
          autoComplete: "email",
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
          required: true,
          options: ["Electric", "Gas"],
        },
        {
          key: "dateResponsible",
          label: "Date responsible for account",
          type: "date",
          required: true,
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
          required: true,
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
          required: true,
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
          required: true,
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
          required: true,
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
  if (seeded.controlsAccess == null) seeded.controlsAccess = true;
  return buildApplicationDraft({
    agencyId: CONED_FORM_A.id,
    answers: seeded,
    status: "draft",
    stepIndex: 0,
  });
}
