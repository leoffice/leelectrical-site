// Light purple badge — marks AI/contextual suggestions (not hardcoded rules).
import React from "react";

export default function IntelligentSuggestionBadge({ className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-purple-700 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full ${className}`}
      data-testid="intelligent-badge"
    >
      <span aria-hidden>✨</span>
      Smart suggestion
    </span>
  );
}