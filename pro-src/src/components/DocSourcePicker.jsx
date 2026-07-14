// Submenu — pick local LE Pro PDF/email or QuickBooks file.
import React from "react";
import Sheet, { Opt } from "./Sheet.jsx";
import { docKindLabel, sourcePickerPrompt } from "../lib/docSource.js";

export default function DocSourcePicker({ title, prompt, kind, onPick, onBack }) {
  const word = docKindLabel(kind);
  return (
    <Sheet title={title} onClose={onBack}>
      <p className="text-sm text-slate-500 mb-3">{prompt || sourcePickerPrompt()}</p>
      <Opt
        icon="📄"
        title={"Local " + word}
        note="LE Pro PDF built from this job"
        onClick={() => onPick("local")}
        data-testid="doc-source-local"
      />
      <Opt
        icon="📗"
        title={"QuickBooks " + word}
        note="Uses the file in QuickBooks Online"
        onClick={() => onPick("qbo")}
        data-testid="doc-source-qbo"
      />
    </Sheet>
  );
}