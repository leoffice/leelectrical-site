// Re-export shared email-insight logic (canonical copy in netlify/functions/lib).
export {
  isEnergyServicesEmail,
  extractAddress,
  extractDateTime,
  classifyAppointmentType,
  appointmentTypeLabel,
  parseEmailInsight,
  matchJobForInsight,
  buildProposedActions,
  formatInsightLead,
  enrichInsight,
  paperworkPatchForInsight,
  normalizeAddress,
  addressSimilarity,
} from "../../../netlify/functions/lib/emailInsight.mjs";