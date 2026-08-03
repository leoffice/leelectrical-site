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
  CONED_FORM_A_TEXT_SIZE,
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

// S26 — optional per-tenant Google Drive copy (white-label API)
export {
  saveConedToDriveApi,
  gdriveStatus,
  tenantGdriveFolderId,
} from "./gdriveSave.js";

// S27 — customer-fill intake (meter gate + personal link + import)
export {
  suggestMeters,
  intakePrefillFromJob,
  requestCustomerFill,
  checkCustomerIntake,
  mapIntakeAnswersToConed,
  intakeSubmissionToCompletedFiles,
} from "./conedIntake.js";

// Kept as manual/Ready-to-go primitives — no longer auto-fired on completion
// (Levi redirect 2026-08-02: completion creates a paperwork TO-DO instead).
export {
  autoUploadOnComplete,
  autoUploadIfWaiting,
  resolveConedCaseNumber,
  conedNotification,
} from "./autoUploadOnComplete.js";

// Paperwork TO-DO model + Ready-to-go trigger
export {
  PAPERWORK_TODO_KINDS,
  paperworkTodoLabel,
  listPaperworkTodos,
  openPaperworkTodos,
  addPaperworkTodoPatch,
  updatePaperworkTodoPatch,
  readyToGoTodo,
  completionTodoPatch,
} from "./paperworkTodos.js";

// S23 — Submit a Case questionnaire + create-case execution
export {
  REQUEST_TYPES,
  REQUEST_TYPE_LABELS,
  REQUEST_TYPE_PORTAL,
  DEFAULT_LOAD_ITEMS,
  AUTO_HANDLED,
  SKIP_OPTIONAL_KEYS,
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
  resolveOwnerPersonName,
  looksLikeCompanyName,
  isLightingItem,
  isAcItem,
  resolveLoadEntryMode,
  loadItemKw,
  HP_TO_KW,
} from "./createCaseQuestionnaire.js";

export {
  lookupNycProperty,
  applyNycLookupToAnswers,
  parseNycAddressParts,
  parsePlutoOwnerName,
} from "./nycPropertyLookup.js";

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

