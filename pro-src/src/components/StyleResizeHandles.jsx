// Corner drag handles — resize a live-edited element in developer mode.
import React, { useCallback, useEffect, useState } from "react";

const HANDLES = [
  { id: "se", cursor: "nwse-resize", dx: 1, dy: 1 },
  { id: "sw", cursor: "nesw-resize", dx: -1, dy: 1 },
  { id: "ne", cursor: "nesw-resize", dx: 1, dy: -1 },
  { id: "nw", cursor: "nwse-resize", dx: -1, dy: -1 },
];

function px(n) {
  return `${Math.max(24, Math.round(n))}px`;
}

export default function StyleResizeHandles({ element, style = {}, onResize }) {
  const [box, setBox] = useState(null);

  useEffect(() => {
    if (!element) return undefined;
    const sync = () => {
      const r = element.getBoundingClientRect();
      setBox({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(element);
    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [element, style]);

  const startDrag = useCallback(
    (handle, e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const startW = parseFloat(style.width) || rect.width;
      const startH = parseFloat(style.height) || rect.height;
      const startX = e.clientX;
      const startY = e.clientY;

      const move = (ev) => {
        const dw = (ev.clientX - startX) * handle.dx;
        const dh = (ev.clientY - startY) * handle.dy;
        const width = handle.dx > 0 ? startW + (ev.clientX - startX) : startW - (ev.clientX - startX);
        const height = handle.dy > 0 ? startH + (ev.clientY - startY) : startH - (ev.clientY - startY);
        onResize?.({
          width: px(width),
          height: px(height),
          minHeight: px(height),
        });
      };

      const up = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
      };

      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    },
    [element, onResize, style.height, style.width]
  );

  if (!element || !box) return null;

  return (
    <div
      className="fixed z-[84] pointer-events-none border-2 border-dashed border-purple-400 rounded-lg"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      data-testid="style-resize-handles"
    >
      {HANDLES.map((h) => (
        <div
          key={h.id}
          className="absolute w-4 h-4 bg-purple-600 border-2 border-white rounded-sm pointer-events-auto shadow"
          style={{
            cursor: h.cursor,
            left: h.dx < 0 ? -8 : box.width - 8,
            top: h.dy < 0 ? -8 : box.height - 8,
          }}
          onPointerDown={(e) => startDrag(h, e)}
          data-testid={`resize-handle-${h.id}`}
        />
      ))}
    </div>
  );
}