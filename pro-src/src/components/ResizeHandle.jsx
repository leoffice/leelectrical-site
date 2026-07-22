// Drag handle between desktop columns (sidebar | list | detail).
import React, { useCallback, useEffect, useRef } from "react";

/**
 * Vertical drag strip. Calls onResize(deltaX) while dragging; onResizeEnd on pointer up.
 * axis="x" only (horizontal layout).
 */
export default function ResizeHandle({
  onResize,
  onResizeEnd,
  testId = "resize-handle",
  title = "Drag to resize",
}) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onMove = useCallback(
    (e) => {
      if (!dragging.current) return;
      const x = e.clientX;
      const dx = x - lastX.current;
      lastX.current = x;
      if (dx) onResize?.(dx);
    },
    [onResize]
  );

  const onUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    onResizeEnd?.();
  }, [onResizeEnd]);

  useEffect(() => {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [onMove, onUp]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={title}
      title={title}
      data-testid={testId}
      className="hidden lg:flex w-1.5 shrink-0 cursor-col-resize items-stretch self-stretch group relative z-20 touch-none"
      onPointerDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        lastX.current = e.clientX;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }}
    >
      <span className="absolute inset-y-0 -left-1 -right-1" aria-hidden />
      <span className="m-auto h-10 w-0.5 rounded-full bg-slate-200 group-hover:bg-brand/50 group-active:bg-brand transition-colors" />
    </div>
  );
}
