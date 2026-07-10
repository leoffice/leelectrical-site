// Attachment + autofill row for check / Zelle payment entry.
import React from "react";
import { Fld } from "./Sheet.jsx";

export default function PaymentProofFld({
  label,
  hint,
  file,
  inputRef,
  onFile,
  onAutofill,
  autofillBusy,
  autofillDone,
  disabled,
  testId = "payment-proof-input",
}) {
  return (
    <Fld label={label} hint={hint}>
      <div className="flex gap-2 items-stretch">
        <input
          ref={inputRef}
          className="input text-sm flex-1 min-w-0"
          type="file"
          accept="image/*"
          onChange={onFile}
          disabled={disabled}
          data-testid={testId}
        />
        {file ? (
          <button
            type="button"
            className="btn bg-accent text-white shrink-0 px-3 text-sm whitespace-nowrap"
            onClick={onAutofill}
            disabled={disabled || autofillBusy}
            data-testid="payment-autofill"
            aria-label="Autofill from attachment"
          >
            {autofillBusy ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Reading…
              </span>
            ) : autofillDone ? (
              "✓ Autofilled"
            ) : (
              "Autofill"
            )}
          </button>
        ) : null}
      </div>
      {file ? <p className="text-[11px] text-slate-500 mt-1">Attached: {file.name}</p> : null}
    </Fld>
  );
}