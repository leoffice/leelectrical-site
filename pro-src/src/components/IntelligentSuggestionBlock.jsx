// Purple-tinted block for contextual AI suggestions inside popups.
import React, { useCallback, useRef } from "react";
import IntelligentSuggestionBadge from "./IntelligentSuggestionBadge.jsx";
import { useLiveEdit } from "./LiveEditProvider.jsx";

export default function IntelligentSuggestionBlock({
  scope,
  title,
  lead,
  children,
  className = "",
  enableHighlight = true,
}) {
  const { highlightMode, addHighlight } = useLiveEdit();
  const blockRef = useRef(null);

  const onMouseUp = useCallback(() => {
    if (!enableHighlight || !highlightMode) return;
    const sel = window.getSelection();
    const text = (sel?.toString() || "").trim();
    if (!text || text.length < 2) return;
    if (!blockRef.current?.contains(sel.anchorNode)) return;
    const note = window.prompt("Add a note for this highlight:", "");
    if (note == null) return;
    addHighlight({ scope, excerpt: text, text: note.trim() });
    sel.removeAllRanges();
  }, [addHighlight, enableHighlight, highlightMode, scope]);

  return (
    <div
      ref={blockRef}
      className={`rounded-xl border border-purple-200 bg-purple-50/80 px-3 py-3 mb-3 ${className}`}
      data-testid="intelligent-suggestion-block"
      onMouseUp={onMouseUp}
    >
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <IntelligentSuggestionBadge />
        {title ? (
          <span className="text-xs font-bold text-purple-800 uppercase tracking-wide">{title}</span>
        ) : null}
      </div>
      {lead ? <p className="text-sm text-purple-900/80 mb-2">{lead}</p> : null}
      {children}
      <p className="text-[10px] text-purple-400 mt-2">Press &amp; hold any button to edit, hide, or suggest changes</p>
    </div>
  );
}