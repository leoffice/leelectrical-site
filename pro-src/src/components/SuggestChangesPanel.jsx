// Floating side panel for change requests — doesn't cover the popup.
import React, { useState } from "react";
import FloatingPanel from "./FloatingPanel.jsx";

export default function SuggestChangesPanel({ target, onSubmit, onClose }) {
  const [text, setText] = useState("");

  if (!target) return null;

  const save = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText("");
  };

  return (
    <FloatingPanel title="Suggest a change" onClose={onClose} testId="suggest-changes">
      <p className="text-xs text-slate-500 mb-2">
        Tell me what to change for <b className="text-slate-700">{target.label}</b> — I'll know exactly which button you mean.
      </p>
      <textarea
        className="input min-h-[120px] text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Change this to Send an email to him, or move it above Remind me…"
        aria-label="Change request"
        data-testid="suggest-changes-input"
        autoFocus
      />
      <button type="button" className="btn-brand w-full mt-3" onClick={save} data-testid="suggest-changes-save">
        Save suggestion
      </button>
    </FloatingPanel>
  );
}