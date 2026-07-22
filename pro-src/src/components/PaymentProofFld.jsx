// Attachment + autofill row for check / Zelle payment entry.
// One seamless attach control — the phone OS offers Take Photo / Photo Library / Files.
import React, { useRef } from "react";
import { Fld } from "./Sheet.jsx";

const ACCEPT_FILES = "image/*,.pdf,application/pdf";

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
  /** When true, show a compact primary attach area (check deposit path). */
  emphasize = false,
  /** Optional prompt shown until a file is chosen (e.g. after Attach a picture). */
  pendingPick = false,
}) {
  const filesRef = useRef(null);

  // Parent still holds one ref for legacy auto-open / clear.
  const setFilesRef = (el) => {
    filesRef.current = el;
    if (!inputRef) return;
    if (typeof inputRef === "function") inputRef(el);
    else inputRef.current = el;
  };

  const pickFiles = () => {
    if (disabled) return;
    filesRef.current?.click();
  };

  const showPicker = emphasize || pendingPick || !file;

  return (
    <Fld label={label} hint={hint}>
      {/* Single picker — no capture attr so mobile OS offers camera + files in one sheet */}
      <input
        ref={setFilesRef}
        className="sr-only"
        type="file"
        accept={ACCEPT_FILES}
        onChange={onFile}
        disabled={disabled}
        data-testid={testId}
        tabIndex={-1}
        aria-hidden
      />
      {showPicker ? (
        <button
          type="button"
          onClick={pickFiles}
          disabled={disabled}
          data-testid={testId + "-pick"}
          className={`w-full rounded-lg border px-3 py-2 text-left active:opacity-80 disabled:opacity-50 ${
            pendingPick || emphasize
              ? "border-brand bg-brand-soft/40 text-slate-800"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-base leading-none" aria-hidden>
              📎
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold leading-tight" data-testid={testId + "-attach-label"}>
                {file
                  ? "Change attachment"
                  : emphasize || pendingPick
                    ? "Attach check or payment"
                    : "Attach photo or file"}
              </div>
              <p className="text-[11px] text-slate-500 leading-tight mt-0.5 truncate">
                {file
                  ? file.name
                  : "Phone will offer camera, photos, or files"}
              </p>
            </div>
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
            disabled={disabled || autofillBusy || !String(file.type || "").startsWith("image/")}
            data-testid="payment-autofill"
            aria-label="Autofill from attachment"
            title={
              String(file.type || "").startsWith("image/")
                ? "Read amount and details from the image"
                : "Autofill works on photos — PDFs stay attached as proof"
            }
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
            onClick={pickFiles}
            disabled={disabled}
            aria-label="Change attachment"
            title="Choose another file"
          >
            ↻
          </button>
        </div>
      ) : null}
    </Fld>
  );
}
