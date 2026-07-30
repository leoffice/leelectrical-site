/**
 * Agency form-fill skill — public entry.
 * New agencies: add config under agencies/ (or sibling modules) and register.
 */
export {
  visibleFields,
  missingRequired,
  incompleteSteps,
  applicationReady,
  applicationFieldRows,
  setAnswer,
  toggleMulti,
  buildApplicationDraft,
  resolveSubmitEmails,
  buildApplicationEmailHtml,
  buildApplicationEmailText,
} from "./engine.js";

export {
  CONED_FORM_A,
  CONED_FORM_A_DEFAULT_EMAILS,
  CONED_FORM_A_SOURCE_PDF,
  AGENCY_REGISTRY,
  getAgency,
  conedAgency,
  seedConedApplication,
} from "./conedFormA.js";

export {
  CONED_UNIT_MAX_LEN,
  abbreviateConedUnit,
  clampConedUnit,
  applyConedUnitInput,
} from "./conedUnit.js";

export {
  buildApplicationPdfBytes,
  buildApplicationPdfBlob,
  applicationPdfFileName,
  blobToBase64,
} from "./applicationPdf.js";
