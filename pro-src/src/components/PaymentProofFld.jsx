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
  /** When true, show a large primary "attach photo" button (check deposit path). */
  emphasize = false,
  /** Optional prompt shown until a file is chosen (e.g. after Attach a picture). */
  pendingPick = false,
}) {
  const pick = () => {
    if (disabled) return;
    inputRef?.current?.click();
  };

  return (
    <Fld label={label} hint={hint}>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        disabled={disabled}
        data-testid={testId}
        tabIndex={-1}
        aria-hidden
      />
      {emphasize || pendingPick || !file ? (
        <button
          type="button"
          onClick={pick}
          disabled={disabled}
          data-testid={testId + "-pick"}
          className={`w-full rounded-xl border-2 border-dashed text-left px-3 py-3 transition-colors active:opacity-80 ${
            pendingPick || emphasize
              ? "border-brand bg-brand-soft/40 text-slate-800"
              : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl leading-none" aria-hidden>
              📷
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold">
                {file ? "Change photo" : emphasize || pendingPick ? "Attach check or payment photo" : "Attach a photo"}
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                {file
                  ? file.name
                  : pendingPick
                    ? "Tap to choose a picture — amount, check #, date fill in for you"
                    : "Camera or photo library"}
              </span>
            </span>
          </div>
        </button>
      ) : null}
      {file ? (
        <div className="flex gap-2 items-stretch mt-2">
          <p className="input text-sm flex-1 min-w-0 truncate bg-slate-50" title={file.name}>
            {file.name}
          </p>
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
          <button
            type="button"
            className="btn bg-white border border-slate-200 text-slate-700 shrink-0 px-2.5 text-sm"
            onClick={pick}
            disabled={disabled}
            aria-label="Change photo"
          >
            ↻
          </button>
        </div>
      ) : null}
    </Fld>
  );
}
