// Draggable floating panel — no backdrop so you can read the job behind it.
import React, { useCallback, useEffect, useRef, useState } from "react";

export default function FloatingPanel({ title, onClose, children, testId }) {
  const [pos, setPos] = useState(() => ({
    x: Math.max(16, window.innerWidth - 420),
    y: Math.max(72, Math.round(window.innerHeight * 0.12)),
  }));
  const dragRef = useRef(null);

  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0 || e.target.closest("button, input, select, textarea, a, label")) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [pos.x, pos.y]);

  const onPointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;
    const maxX = Math.max(8, window.innerWidth - 320);
    const maxY = Math.max(8, window.innerHeight - 120);
    setPos({
      x: Math.min(maxX, Math.max(8, dragRef.current.ox + dx)),
      y: Math.min(maxY, Math.max(8, dragRef.current.oy + dy)),
    });
  }, []);

  const onPointerUp = useCallback((e) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="fixed inset-0 z-[70] pointer-events-none" role="dialog" aria-modal="false" data-floating-panel={testId || ""}>
      <div
        className="pointer-events-auto absolute w-[min(100vw-2rem,24rem)] max-h-[min(78vh,36rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col"
        style={{ left: pos.x, top: pos.y }}
      >
        <div
          className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 cursor-grab active:cursor-grabbing select-none touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="text-slate-300 text-xs" aria-hidden>
            ⠿
          </span>
          <h3 className="font-extrabold text-slate-900 text-sm flex-1">{title}</h3>
          <button
            type="button"
            aria-label="Close"
            className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 font-bold text-xs shrink-0"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto lg-scroll-hidden px-4 py-3 pb-4">{children}</div>
      </div>
    </div>
  );
}