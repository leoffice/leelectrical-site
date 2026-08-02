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
  buildApplicationPdfBytesAsync,
  buildApplicationPdfBlob,
  applicationPdfFileName,
  blobToBase64,
} from "./applicationPdf.js";

export {
  CONED_FORM_A_PAGE1_FIELDS,
  resolveConedPage1Values,
  loadConedSourcePdfBytes,
  fillConedFormAPdfBytes,
} from "./fillConedFormA.js";

export {
  filesystemSafeSegment,
  resolveConedMeterLabel,
  buildConedCompletedFileName,
  customerConedApplicationSubject,
} from "./completedFileName.js";

export {
  isConedApplicationsEnabled,
  CONED_APPLICATIONS_MODULE,
} from "./conedFeatureFlag.js";

export {
  buildConedDocKey,
  putCompletedApplicationDoc,
  buildCustomerConedEmailText,
  buildCustomerConedEmailHtml,
  completeConedApplicationDestinations,
  isCustomerEmailOptIn,
  listConedCompletedFiles,
} from "./completeDestinations.js";

// S23 — Submit a Case questionnaire + create-case execution
export {
  REQUEST_TYPES,
  REQUEST_TYPE_LABELS,
  REQUEST_TYPE_PORTAL,
  DEFAULT_LOAD_ITEMS,
  AUTO_HANDLED,
  toPlainAscii,
  sumLoadKw,
  questionnaireSteps,
  portalWizardStepCount,
  isFullBranch,
  normalizeRequestType,
  seedCreateCaseAnswers,
  defaultAnswers as defaultCreateCaseAnswers,
  sanitizeAnswers as sanitizeCreateCaseAnswers,
  missingCreateCaseFields,
  createCaseReady,
  buildCreateCasePayload,
  buildCreateCaseDraft,
  createCaseReviewRows,
} from "./createCaseQuestionnaire.js";

export {
  CONED_CREATE_CASE_CMD,
  queueConedCreateCase,
  getCreateCaseState,
} from "./createCaseExecution.js";

// S24 — upload Form A to case Documents
export {
  CONED_UPLOAD_DOCUMENT_CMD,
  DOCUMENT_TYPE as CONED_UPLOAD_DOCUMENT_TYPE,
  MAX_PDF_BYTES as CONED_UPLOAD_MAX_PDF_BYTES,
  resolveFormAForUpload,
  buildUploadToCasePayload,
  queueConedUploadDocument,
} from "./uploadToCase.js";

