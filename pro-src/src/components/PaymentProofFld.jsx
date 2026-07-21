// Attachment + autofill row for check / Zelle payment entry.
// Two attach paths: take a photo (camera) OR pick a local file (image / PDF).
import React, { useRef } from "react";
import { Fld } from "./Sheet.jsx";

const ACCEPT_IMAGE = "image/*";
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
  /** When true, show a large primary attach area (check deposit path). */
  emphasize = false,
  /** Optional prompt shown until a file is chosen (e.g. after Attach a picture). */
  pendingPick = false,
}) {
  const cameraRef = useRef(null);
  const filesRef = useRef(null);

  // Parent still holds one ref for legacy auto-open / clear — bind it to the
  // files input so "open picker" never forces the camera-only path.
  const setFilesRef = (el) => {
    filesRef.current = el;
    if (!inputRef) return;
    if (typeof inputRef === "function") inputRef(el);
    else inputRef.current = el;
  };

  const pickCamera = () => {
    if (disabled) return;
    cameraRef.current?.click();
  };

  const pickFiles = () => {
    if (disabled) return;
    filesRef.current?.click();
  };

  const showPicker = emphasize || pendingPick || !file;

  return (
    <Fld label={label} hint={hint}>
      {/* Camera — forces rear camera on phones when available */}
      <input
        ref={cameraRef}
        className="sr-only"
        type="file"
        accept={ACCEPT_IMAGE}
        capture="environment"
        onChange={onFile}
        disabled={disabled}
        data-testid={testId + "-camera"}
        tabIndex={-1}
        aria-hidden
      />
      {/* Local files — images + PDF; no capture so the system file picker opens */}
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
        <div
          className={`rounded-xl border-2 border-dashed px-3 py-3 ${
            pendingPick || emphasize
              ? "border-brand bg-brand-soft/40 text-slate-800"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
          data-testid={testId + "-pick"}
        >
          <div className="text-sm font-bold mb-0.5">
            {file
              ? "Change attachment"
              : emphasize || pendingPick
                ? "Attach check or payment file"
                : "Attach a photo or file"}
          </div>
          <p className="text-[11px] text-slate-500 mb-3">
            {file
              ? file.name
              : "Take a picture, or pick a photo / PDF from this device"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={pickCamera}
              disabled={disabled}
              data-testid={testId + "-take-photo"}
              className="btn bg-white border border-slate-200 text-slate-800 text-sm font-bold px-3 py-2.5 flex items-center justify-center gap-2 active:opacity-80"
            >
              <span aria-hidden>📷</span>
              Take photo
            </button>
            <button
              type="button"
              onClick={pickFiles}
              disabled={disabled}
              data-testid={testId + "-choose-file"}
              className="btn bg-brand text-white text-sm font-bold px-3 py-2.5 flex items-center justify-center gap-2 active:opacity-80"
            >
              <span aria-hidden>📁</span>
              Choose from files
            </button>
          </div>
        </div>
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
