// Sheet — bottom sheet on mobile, centered modal on desktop (>=1024px).
import React, { useEffect, useRef } from "react";
import { registerSheet } from "../lib/sheetRegistry.js";
import { lockBodyScroll } from "../lib/scrollLock.js";

export default function Sheet({ title, onClose, children, wide, tall, testId, urgent = false }) {
  const shellRef = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Announce this sheet globally so auto-opening prompts never stack on it.
  useEffect(() => registerSheet(), []);

  // Freeze the page behind the sheet and restore the exact scroll position on
  // close, so content never shifts under the user's cursor.
  useEffect(() => lockBodyScroll(), []);

  // iOS keyboard handling. In a position:fixed modal with the body scroll-locked,
  // WebKit can't scroll a focused input above the software keyboard — the field
  // stays hidden ("sometimes it wouldn't") and the keyboard animation stalls for
  // seconds. We instead pin the sheet shell to the *visual* viewport (the area
  // above the keyboard) and pull the focused field into the sheet's own scroller.
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const shell = shellRef.current;
    if (!vv || !shell) return;
    const apply = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      if (kb > 80) {
        // Keyboard is up — constrain the shell to the visible strip above it.
        shell.style.top = vv.offsetTop + "px";
        shell.style.height = vv.height + "px";
        shell.style.bottom = "auto";
      } else {
        shell.style.top = "";
        shell.style.height = "";
        shell.style.bottom = "";
      }
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      shell.style.top = "";
      shell.style.height = "";
      shell.style.bottom = "";
    };
  }, []);

  // Bring the tapped field into view inside the sheet's scroller (not the page).
  // Touch only — desktop mouse users don't have a keyboard covering the field,
  // and forcing a scroll on every click would feel jumpy.
  useEffect(() => {
    const body = bodyRef.current;
    const coarse =
      typeof window !== "undefined" &&
      (("ontouchstart" in window) ||
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches));
    if (!body || !coarse) return;
    const onFocusIn = (e) => {
      const el = e.target;
      if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || "")) return;
      // Let the keyboard begin resizing the viewport, then center the field.
      window.setTimeout(() => {
        try {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch {
          try {
            el.scrollIntoView(false);
          } catch {}
        }
      }, 130);
    };
    body.addEventListener("focusin", onFocusIn);
    return () => body.removeEventListener("focusin", onFocusIn);
  }, []);

  const cardShell = urgent
    ? "bg-red-50/95 border border-red-200/60 animate-insp-heartbeat"
    : "bg-white";

  return (
    <div
      ref={shellRef}
      className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center"
      role="dialog"
      aria-modal="true"
      data-sheet
      data-testid={testId || undefined}
    >
      <div className="absolute inset-0 bg-slate-900/45" onClick={onClose} data-sheet-dim />
      <div
        className={`relative w-full mb-16 lg:mb-0 ${wide ? "lg:max-w-2xl" : "lg:max-w-lg"} ${
          tall ? "max-h-[94vh] lg:max-h-[90vh]" : "max-h-[88vh] lg:max-h-[80vh]"
        } ${cardShell} rounded-t-3xl lg:rounded-2xl shadow-2xl flex flex-col animate-[sheetup_.22s_ease-out]`}
      >
        <div className="lg:hidden w-10 h-1 rounded-full bg-slate-300 mx-auto mt-2.5" />
        <div className={`flex items-center gap-3 px-5 pt-3 pb-2.5 ${urgent ? "bg-red-500/10" : ""}`}>
          <h3 className="font-extrabold text-slate-900 text-base flex-1 truncate">{title}</h3>
          <button
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold text-sm"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div ref={bodyRef} className="overflow-y-auto lg-scroll-hidden px-5 pb-6 lg:pb-5 pb-safe" data-testid="sheet-body">{children}</div>
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
