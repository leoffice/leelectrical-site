// Long-press menu — edit label, hide, suggest changes.
import React, { useEffect, useRef } from "react";

export default function LiveEditActionMenu({ anchor, label, onEdit, onStyle, onDelete, onSuggest, onClose }) {
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

  const top = Math.min(anchor.y, window.innerHeight - 200);
  const left = Math.min(anchor.x, window.innerWidth - 220);

  return (
    <div
      ref={ref}
      className="fixed z-[85] w-52 rounded-2xl border border-slate-200 bg-white shadow-2xl py-1.5"
      style={{ top, left }}
      data-testid="live-edit-menu"
      role="menu"
    >
      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 truncate">
        {label}
      </div>
      <button type="button" className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50" onClick={onEdit} data-testid="live-edit-edit">
        ✏️ Edit words
      </button>
      {onStyle ? (
        <button type="button" className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50" onClick={onStyle} data-testid="live-edit-style-btn">
          🎨 Adjust style
        </button>
      ) : null}
      <button type="button" className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50" onClick={onSuggest} data-testid="live-edit-suggest">
        💬 Suggest changes
      </button>
      <button
        type="button"
        className="w-full text-left px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
        onClick={onDelete}
        data-testid="live-edit-delete"
      >
        🗑️ Hide button
      </button>
    </div>
  );
}