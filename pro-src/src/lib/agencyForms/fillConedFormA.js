/**
 * Fill the real Con Edison Form A AcroForm (application-for-service.pdf).
 * Source: BLZ company file — do not recreate the layout; write field values only.
 * Phase 1 = FIRST PAGE (Part A — New Account Information) only.
 *
 * Exact unit field name on the PDF (appears twice on page 1):
 *   "Part Supply FloorOffice Apartment"  / tooltip "Part Supply: Floor/Office #/Apartment"
 *   "Part Supply FloorOffice Apartment_2" (mailing)
 */
import { PDFDocument } from "pdf-lib";
import { CONED_FORM_A_SOURCE_PDF } from "./conedFormA.js";
import { clampConedUnit } from "./conedUnit.js";

/** AcroForm field names on page 1 of the official PDF. */
export const CONED_FORM_A_PAGE1_FIELDS = {
  accountName: "Name",
  businessName: "Name of Business if applicable",
  // Account address (where service is used)
  serviceAddress: "Address",
  serviceUnit: "Part Supply FloorOffice Apartment",
  serviceCity: "TownCity",
  serviceState: "State",
  serviceZip: "Zip",
  // Mailing address (bills) — only when different from account address
  mailingName: "Name_2",
  mailingAddress: "Address_2",
  mailingUnit: "Part Supply FloorOffice Apartment_2",
  mailingCity: "TownCity_2",
  mailingState: "State_2",
  mailingZip: "Zip_2",
  // Contact
  phone: "CONTACT INFORMATION What is your telephone number",
  phoneAlt: "Is there another telephone number or pager number where we can reach you",
  fax: "Fax No",
  email: "Email Address",
  // Access contact (when applicant does not control meters)
  accessName: "Name_3",
  accessAddress: "Address_3",
  accessUnit: "Part Supply FloorOffice Apartment_3",
  accessCity: "TownCity_3",
  accessState: "State_3",
  accessZip: "Zip_3",
  accessPhone: "Telephone No",
};

/**
 * Resolve service / billing / mailing lines from app answers into PDF values.
 * @param {Record<string, any>} answers
 */
export function resolveConedPage1Values(answers = {}) {
  const a = answers || {};
  const sameService = a.serviceSameAsBilling !== false; // default true

  const serviceAddress = String(
    sameService ? a.billingAddress || a.serviceAddress || "" : a.serviceAddress || ""
  ).trim();
  const serviceUnit = clampConedUnit(
    sameService ? a.billingUnit || a.serviceUnit || "" : a.serviceUnit || ""
  );
  const serviceCity = String(
    sameService ? a.billingCity || a.serviceCity || "" : a.serviceCity || ""
  ).trim();
  const serviceZip = String(
    sameService ? a.billingZip || a.serviceZip || "" : a.serviceZip || ""
  ).trim();
  const serviceState = String(a.serviceState || a.billingState || "NY").trim() || "NY";

  const accountName = String(a.accountName || "").trim();
  const isBiz = String(a.customerType || "").toLowerCase().includes("non");
  const businessName = String(
    a.businessName || (isBiz ? accountName : "") || ""
  ).trim();

  // Mailing on the official form: leave blank when same as account address.
  let mail = null;
  if (a.mailingSame === false) {
    mail = {
      name: String(a.mailingName || accountName).trim(),
      address: String(a.mailingAddress || "").trim(),
      unit: clampConedUnit(a.mailingUnit || ""),
      city: String(a.mailingCity || "").trim(),
      state: String(a.mailingState || "NY").trim() || "NY",
      zip: String(a.mailingZip || "").trim(),
    };
  } else {
    // mailingSame → bills go to billing address
    const billAddr = String(a.billingAddress || "").trim();
    const billCity = String(a.billingCity || "").trim();
    const billZip = String(a.billingZip || "").trim();
    const billUnit = clampConedUnit(a.billingUnit || "");
    const billState = String(a.billingState || "NY").trim() || "NY";
    const differs =
      billAddr &&
      (billAddr !== serviceAddress ||
        billCity !== serviceCity ||
        billZip !== serviceZip ||
        billUnit !== serviceUnit);
    if (differs) {
      mail = {
        name: accountName,
        address: billAddr,
        unit: billUnit,
        city: billCity,
        state: billState,
        zip: billZip,
      };
    }
  }

  const out = {
    [CONED_FORM_A_PAGE1_FIELDS.accountName]: accountName,
    [CONED_FORM_A_PAGE1_FIELDS.businessName]: businessName,
    [CONED_FORM_A_PAGE1_FIELDS.serviceAddress]: serviceAddress,
    [CONED_FORM_A_PAGE1_FIELDS.serviceUnit]: serviceUnit,
    [CONED_FORM_A_PAGE1_FIELDS.serviceCity]: serviceCity,
    [CONED_FORM_A_PAGE1_FIELDS.serviceState]: serviceState,
    [CONED_FORM_A_PAGE1_FIELDS.serviceZip]: serviceZip,
    [CONED_FORM_A_PAGE1_FIELDS.phone]: String(a.phone || "").trim(),
    [CONED_FORM_A_PAGE1_FIELDS.phoneAlt]: String(a.phoneAlt || "").trim(),
    [CONED_FORM_A_PAGE1_FIELDS.fax]: String(a.fax || "").trim(),
    [CONED_FORM_A_PAGE1_FIELDS.email]: String(a.email || "").trim(),
  };

  if (mail) {
    out[CONED_FORM_A_PAGE1_FIELDS.mailingName] = mail.name;
    out[CONED_FORM_A_PAGE1_FIELDS.mailingAddress] = mail.address;
    out[CONED_FORM_A_PAGE1_FIELDS.mailingUnit] = mail.unit;
    out[CONED_FORM_A_PAGE1_FIELDS.mailingCity] = mail.city;
    out[CONED_FORM_A_PAGE1_FIELDS.mailingState] = mail.state;
    out[CONED_FORM_A_PAGE1_FIELDS.mailingZip] = mail.zip;
  }

  // Access block — only when applicant does not control meters
  if (!a.controlsAccess) {
    out[CONED_FORM_A_PAGE1_FIELDS.accessName] = String(a.accessContactName || "").trim();
    out[CONED_FORM_A_PAGE1_FIELDS.accessPhone] = String(a.accessContactPhone || "").trim();
    out[CONED_FORM_A_PAGE1_FIELDS.accessAddress] = String(a.accessContactAddress || serviceAddress).trim();
    out[CONED_FORM_A_PAGE1_FIELDS.accessUnit] = clampConedUnit(a.accessContactUnit || serviceUnit);
    out[CONED_FORM_A_PAGE1_FIELDS.accessCity] = String(a.accessContactCity || serviceCity).trim();
    out[CONED_FORM_A_PAGE1_FIELDS.accessState] = String(a.accessContactState || serviceState).trim();
    out[CONED_FORM_A_PAGE1_FIELDS.accessZip] = String(a.accessContactZip || serviceZip).trim();
  }

  // Drop empties so we don't overwrite blanks with ""
  for (const k of Object.keys(out)) {
    if (out[k] == null || String(out[k]).trim() === "") delete out[k];
  }
  return out;
}

/**
 * Load the packaged Form A bytes.
 * Browser: fetch public `/forms/coned-application-for-service.pdf`.
 * Tests / offline: set `globalThis.__CONED_FORM_A_PDF_BYTES__` (Uint8Array).
 * @param {string} [url]
 * @returns {Promise<Uint8Array>}
 */
export async function loadConedSourcePdfBytes(url = CONED_FORM_A_SOURCE_PDF) {
  if (typeof globalThis !== "undefined" && globalThis.__CONED_FORM_A_PDF_BYTES__) {
    const b = globalThis.__CONED_FORM_A_PDF_BYTES__;
    return b instanceof Uint8Array ? b : new Uint8Array(b);
  }
  if (typeof fetch === "function") {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Form A PDF fetch failed: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new Error("Could not load Con Ed Form A source PDF");
}

/**
 * Fill page-1 AcroForm fields on the official application PDF.
 * @param {object} opts
 * @param {Record<string, any>} opts.answers
 * @param {Uint8Array|ArrayBuffer} [opts.sourceBytes]
 * @returns {Promise<Uint8Array>}
 */
export async function fillConedFormAPdfBytes({ answers = {}, sourceBytes } = {}) {
  const raw = sourceBytes
    ? sourceBytes instanceof Uint8Array
      ? sourceBytes
      : new Uint8Array(sourceBytes)
    : await loadConedSourcePdfBytes();

  const doc = await PDFDocument.load(raw, { ignoreEncryption: true, updateMetadata: false });
  const form = doc.getForm();
  const values = resolveConedPage1Values(answers);

  for (const [fieldName, value] of Object.entries(values)) {
    try {
      const field = form.getTextField(fieldName);
      // Unit fields hard-cap at 6 (both Account + Mailing Part Supply)
      let v = String(value);
      if (fieldName.includes("Part Supply FloorOffice Apartment")) {
        v = clampConedUnit(v);
      }
      field.setText(v);
    } catch {
      // Field missing or not a text field — skip
    }
  }

  // Flatten optional? Keep editable so office can tweak before portal submit.
  form.updateFieldAppearances();
  const saved = await doc.save({ updateFieldAppearances: true });
  return saved instanceof Uint8Array ? saved : new Uint8Array(saved);
}
