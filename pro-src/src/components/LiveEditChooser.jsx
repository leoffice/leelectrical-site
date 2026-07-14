// Tap in developer mode — open the real action or edit the element.
import React, { useEffect, useRef } from "react";

export default function LiveEditChooser({ anchor, label, onOpen, onEdit, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (ref.current?.contains(e.target)) return;
      onClose?.();
    };
    const t = setTimeout(() => {
      document.addEventListener("pointerdown", close);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", close);
    };
  }, [onClose]);

  if (!anchor) return null;

  const top = Math.min(anchor.y, window.innerHeight - 160);
  const left = Math.min(anchor.x, window.innerWidth - 200);

  return (
    <div
      ref={ref}
      className="fixed z-[85] w-48 rounded-2xl border border-slate-200 bg-white shadow-2xl py-1.5"
      style={{ top, left }}
      data-testid="live-edit-chooser"
      role="menu"
    >
      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 truncate">
        {label}
      </div>
      <button
        type="button"
        className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50"
        onClick={onOpen}
        data-testid="live-edit-open"
      >
        ▶️ Open
      </button>
      <button
        type="button"
        className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50"
        onClick={onEdit}
        data-testid="live-edit-edit-choice"
      >
        ✏️ Edit
      </button>
    </div>
  );
}