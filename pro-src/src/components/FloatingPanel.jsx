// Draggable floating panel — no full-screen dimmer so the page stays readable.
// Used for approvals, suggest-changes, and (on tablet) reminder / notification cards.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { registerSheet } from "../lib/sheetRegistry.js";

export default function FloatingPanel({
  title,
  onClose,
  children,
  testId,
  minimizable = false,
  urgent = false,
  wide = false,
}) {
  const [pos, setPos] = useState(() => ({
    x: Math.max(16, (typeof window !== "undefined" ? window.innerWidth : 800) - (wide ? 460 : 380)),
    y: Math.max(72, Math.round((typeof window !== "undefined" ? window.innerHeight : 600) * 0.1)),
  }));
  const [minimized, setMinimized] = useState(false);
  const dragRef = useRef(null);

  // Count as a covering sheet so other auto-prompts don't stack under/over us.
  useEffect(() => registerSheet(), []);

  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const onPointerDown = useCallback(
    (e) => {
      if (e.button !== 0 || e.target.closest("button, input, select, textarea, a, label")) return;
      dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [pos.x, pos.y]
  );

  const onPointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;
    const maxX = Math.max(8, window.innerWidth - (minimized ? 160 : 280));
    const maxY = Math.max(8, window.innerHeight - 80);
    setPos({
      x: Math.min(maxX, Math.max(8, dragRef.current.ox + dx)),
      y: Math.min(maxY, Math.max(8, dragRef.current.oy + dy)),
    });
  }, [minimized]);

  const onPointerUp = useCallback((e) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const widthClass = wide
    ? "w-[min(100vw-2rem,28rem)]"
    : "w-[min(100vw-2rem,22rem)]";
  const shellClass = urgent
    ? "border-red-300/50 bg-red-50/95 shadow-red-200/40"
    : "border-slate-200 bg-white";
  const pulseClass = urgent && !minimized ? " animate-insp-heartbeat" : "";

  if (minimized) {
    return (
      <div
        className="fixed inset-0 z-[70] pointer-events-none"
        role="dialog"
        aria-modal="false"
        data-floating-panel={testId || ""}
        data-sheet
        data-minimized="1"
      >
        <button
          type="button"
          className={
            "pointer-events-auto absolute max-w-[min(90vw,18rem)] rounded-full shadow-lg border px-3.5 py-2 text-left text-sm font-bold truncate cursor-grab active:cursor-grabbing " +
            (urgent
              ? "bg-red-500/15 border-red-300/50 text-red-900 animate-insp-heartbeat"
              : "bg-white border-slate-200 text-slate-800")
          }
          style={{ left: pos.x, top: pos.y }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => setMinimized(false)}
          data-testid={testId ? testId + "-minimized" : "floating-panel-minimized"}
          title="Restore"
        >
          <span className="mr-1.5 text-slate-400" aria-hidden>
            ▢
          </span>
          {title}
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] pointer-events-none"
      role="dialog"
      aria-modal="false"
      data-floating-panel={testId || ""}
      data-sheet
    >
      <div
        className={
          "pointer-events-auto absolute max-h-[min(72vh,32rem)] rounded-2xl shadow-2xl border flex flex-col " +
          widthClass +
          " " +
          shellClass +
          pulseClass
        }
        style={{ left: pos.x, top: pos.y }}
        data-testid={testId || "floating-panel"}
      >
        <div
          className={
            "flex items-center gap-2 px-3 py-2.5 border-b cursor-grab active:cursor-grabbing select-none touch-none " +
            (urgent ? "border-red-200/60 bg-red-500/10" : "border-slate-100")
          }
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="text-slate-300 text-xs" aria-hidden>
            ⠿
          </span>
          <h3 className="font-extrabold text-slate-900 text-sm flex-1 truncate">{title}</h3>
          {minimizable ? (
            <button
              type="button"
              aria-label="Minimize"
              className="w-7 h-7 rounded-full bg-slate-100/90 text-slate-500 font-bold text-xs shrink-0"
              onClick={() => setMinimized(true)}
              data-testid={testId ? testId + "-minimize" : "floating-panel-minimize"}
            >
              —
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Close"
            className="w-7 h-7 rounded-full bg-slate-100/90 text-slate-500 font-bold text-xs shrink-0"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto lg-scroll-hidden px-4 py-3 pb-4" data-testid="sheet-body">
          {children}
        </div>
      </div>
    </div>
  );
}
