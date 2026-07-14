// Send a developer note about the current page — auto-includes page context.
import React, { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import Sheet, { Fld } from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";
import { buildPageContext } from "../lib/pageContext.js";

export default function PageNoteSheet({ onClose }) {
  const { addDevTask, showToast, effectiveJob, jobs } = useStore();
  const loc = useLocation();
  const [note, setNote] = useState("");
  const context = useMemo(
    () => buildPageContext(loc.pathname, { effectiveJob, jobs }),
    [loc.pathname, effectiveJob, jobs]
  );

  const send = async () => {
    const trimmed = note.trim();
    if (!trimmed) {
      showToast("Write a note first");
      return;
    }
    const desc = `${context}\n\nNote:\n${trimmed}`;
    const ok = await addDevTask({
      title: "Page note",
      desc,
      status: "approved",
      source: "levi-page-note",
    });
    if (ok) {
      showToast("Note sent to build board");
      onClose();
    }
  };

  return (
    <Sheet title="Page note" onClose={onClose}>
      <Fld label="Your note" hint="Describe what you want changed — I'll know which page you were on">
        <textarea
          className="input min-h-[100px] text-sm"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Move the payment button above the invoice section"
          aria-label="Page note"
          data-testid="page-note-input"
          autoFocus
        />
      </Fld>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 mb-4" data-testid="page-note-context">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Page context (auto)</div>
        <pre className="text-[11px] text-slate-600 whitespace-pre-wrap font-sans leading-relaxed">{context}</pre>
      </div>
      <button type="button" className="btn-brand w-full" onClick={send} data-testid="page-note-send">
        Send note
      </button>
    </Sheet>
  );
}