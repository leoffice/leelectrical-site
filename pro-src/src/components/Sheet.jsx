// Sheet — bottom sheet on mobile, centered modal on desktop (>=1024px).
import React, { useEffect } from "react";

export default function Sheet({ title, onClose, children, wide, tall }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center" role="dialog" aria-modal="true" data-sheet>
      <div className="absolute inset-0 bg-slate-900/45" onClick={onClose} data-sheet-dim />
      <div
        className={`relative w-full ${wide ? "lg:max-w-2xl" : "lg:max-w-lg"} ${
          tall ? "max-h-[94vh] lg:max-h-[90vh]" : "max-h-[88vh] lg:max-h-[80vh]"
        } bg-white rounded-t-3xl lg:rounded-2xl shadow-2xl flex flex-col animate-[sheetup_.22s_ease-out]`}
      >
        <div className="lg:hidden w-10 h-1 rounded-full bg-slate-300 mx-auto mt-2.5" />
        <div className="flex items-center gap-3 px-5 pt-3 pb-2.5">
          <h3 className="font-extrabold text-slate-900 text-base flex-1 truncate">{title}</h3>
          <button
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold text-sm"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto lg-scroll-hidden px-5 pb-6 lg:pb-5 pb-safe" data-testid="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** Big tappable option row (sleek's .opt). */
export function Opt({ icon, title, note, danger, onClick, className = "", ...rest }) {
  return (
    <button
      className={`w-full flex items-center gap-3 text-left border rounded-2xl px-4 py-3 mb-2.5 active:bg-slate-50 ${
        danger ? "border-red-200" : "border-slate-200"
      } ${className}`}
      onClick={onClick}
      {...rest}
    >
      <span className="text-xl">{icon}</span>
      <span className="min-w-0">
        <span className={`block font-bold text-sm ${danger ? "text-red-600" : "text-slate-900"}`}>{title}</span>
        {note && <span className="block text-xs text-slate-500">{note}</span>}
      </span>
    </button>
  );
}

/** Labeled field wrapper (sleek's .fld). */
export function Fld({ label, hint, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-bold text-slate-500 mb-1.5 px-0.5">{label}</label>
      {children}
      {hint && <div className="text-[11px] text-slate-400 mt-1 px-0.5">{hint}</div>}
    </div>
  );
}
