// Hide duplicate action buttons when IntelligentSuggestionBlock already offers the same action.

export function suggestedActionKeys(actions) {
  return new Set((actions || []).map((a) => a.key));
}

export function hideSuggestedAction(keys, key) {
  return keys.has(key);
}

/** True when a reminder note-intent duplicates a smart-suggestion button. */
export function intentDuplicatesSuggestion(intent, actions) {
  if (!intent || !actions?.length) return false;
  const map = { invoice: "create_invoice", estimate: "create_estimate" };
  const key = map[intent.kind];
  return key ? hideSuggestedAction(suggestedActionKeys(actions), key) : false;
}