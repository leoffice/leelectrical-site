// Hide duplicate action buttons when IntelligentSuggestionBlock already offers the same action.

export function suggestedActionKeys(actions) {
  return new Set((actions || []).map((a) => a.key));
}

export function hideSuggestedAction(keys, key) {
  return keys.has(key);
}

const INTENT_ACTION_KEYS = {
  create_invoice: "create_invoice",
  create_estimate: "create_estimate",
  email_invoice: "email_invoice",
  email_followup: "email_followup",
  invoice: "create_invoice",
  estimate: "create_estimate",
};

/** True when a reminder note-intent duplicates a smart-suggestion button. */
export function intentDuplicatesSuggestion(intent, actions) {
  if (!intent || !actions?.length) return false;
  const key = INTENT_ACTION_KEYS[intent.action] || INTENT_ACTION_KEYS[intent.kind];
  return key ? hideSuggestedAction(suggestedActionKeys(actions), key) : false;
}